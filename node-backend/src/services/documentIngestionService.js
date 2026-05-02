import { config } from "../config/index.js";
import { readFile } from "fs/promises";
import { es, CHUNK_INDEX } from "../utils/ragHelper/esClient.js";
import { extractTextFromPDF } from "../utils/ragHelper/pdfParser.js";
import {
	splitTextWithOverlap,
	detectLanguage,
} from "../utils/ragHelper/chunker.js";
import { embedBatch } from "../utils/ragHelper/embeddingModel.js";
import {
	getRedisClient,
	waitForRedisReady,
	createRedisWorkerClient,
} from "../utils/redis.js";
import { getDocumentById, updateDocument } from "../dao/documentDao.js";

const PENDING_QUEUE_KEY = "ingestion:documents:pending";
const PROCESSING_QUEUE_KEY = "ingestion:documents:processing";
const ENQUEUED_SET_KEY = "ingestion:documents:enqueued";

let workerStarted = false;

function withTimeout(promise, timeoutMs, label) {
	return Promise.race([
		promise,
		new Promise((_, reject) =>
			setTimeout(
				() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
				timeoutMs,
			),
		),
	]);
}

export async function enqueueDocumentIngestion(documentId) {
	const redis = getRedisClient();
	if (!redis) throw new Error("Redis client is not initialized");

	await waitForRedisReady();

	const added = await withTimeout(
		redis.sadd(ENQUEUED_SET_KEY, documentId),
		3000,
		"Redis sadd",
	);

	if (added === 1) {
		await withTimeout(
			redis.lpush(PENDING_QUEUE_KEY, documentId),
			3000,
			"Redis lpush",
		);
	}

	await updateDocument(documentId, {
		ingestion_status: "pending",
		ingestion_error: null,
		last_enqueued_at: new Date(),
	});
}

export async function removeDocumentIngestionMarkers(documentId) {
	const redis = getRedisClient();
	if (!redis) return;

	await Promise.all([
		redis.srem(ENQUEUED_SET_KEY, documentId),
		redis.lrem(PENDING_QUEUE_KEY, 0, documentId),
		redis.lrem(PROCESSING_QUEUE_KEY, 0, documentId),
	]);
}

export async function startDocumentIngestionWorkers() {
	if (workerStarted) return;
	workerStarted = true;

	await requeueProcessingJobs();

	const concurrency = Math.max(1, config.ingestion.workerConcurrency);
	for (let i = 0; i < concurrency; i += 1) {
		runWorkerLoop(i).catch((err) => {
			console.error(`Document ingestion worker ${i} crashed:`, err);
		});
	}
}

async function requeueProcessingJobs() {
	const redis = getRedisClient();
	if (!redis) return new Error("cannot find Redis");

	// On restart, move interrupted in-flight jobs back to pending.
	const processingIds = await redis.lrange(PROCESSING_QUEUE_KEY, 0, -1);
	if (processingIds.length === 0) return;

	await redis.del(PROCESSING_QUEUE_KEY);
	for (const documentId of processingIds.reverse()) {
		await redis.sadd(ENQUEUED_SET_KEY, documentId);
		await redis.lpush(PENDING_QUEUE_KEY, documentId);
	}
}

async function runWorkerLoop(workerId) {
	const workerRedis = createRedisWorkerClient();

	await new Promise((resolve, reject) => {
		workerRedis.once("ready", resolve);
		workerRedis.once("error", reject);
	});

	console.log(`Document ingestion worker ${workerId} started`);

	while (true) {
		// Atomically claim one pending job and mark it as processing.
		const documentId = await workerRedis.brpoplpush(
			PENDING_QUEUE_KEY,
			PROCESSING_QUEUE_KEY,
			0,
		);
		if (!documentId) continue;

		try {
			await processDocument(documentId);
			await clearQueueState(documentId);
		} catch (err) {
			console.error(`Document ingestion failed for ${documentId}:`, err);
			await handleProcessingFailure(documentId, err);
		}
	}
}

async function processDocument(documentId) {
	const doc = await getDocumentById(documentId);
	if (!doc) return;
	if (doc.ingestion_status === "done") return;

	await updateDocument(documentId, {
		ingestion_status: "running",
		ingestion_error: null,
		ingestion_attempts: (doc.ingestion_attempts || 0) + 1,
		last_started_at: new Date(),
	});

	const { text, title } = await extractDocumentText(doc);
	const chunks = splitTextWithOverlap(text);
	const docLanguage = detectLanguage(text);

	if (chunks.length === 0) {
		throw new Error("No extractable text found in PDF");
	}

	const vectors = await embedBatch(chunks.map((chunk) => chunk.content));
	const resolvedTitle = doc.title || title || doc.filename;

	const operations = chunks.flatMap((chunk, idx) => [
		{ index: { _index: CHUNK_INDEX } },
		{
			doc_id: doc.id,
			user_name: doc.user_name,
			chunk_index: idx,
			content: chunk.content,
			content_en:
				chunk.language === "en" || chunk.language === "mixed"
					? chunk.content
					: "",
			content_zh:
				chunk.language === "zh" || chunk.language === "mixed"
					? chunk.content
					: "",
			embedding: vectors[idx],
			title: resolvedTitle,
			source: doc.source,
			category: doc.category,
			language: chunk.language,
		},
	]);

	// Replace any previously indexed chunks for this document before re-indexing.
	await es
		.deleteByQuery({
			index: CHUNK_INDEX,
			query: { term: { doc_id: doc.id } },
			refresh: false,
		})
		.catch((err) => {
			console.warn(
				`Failed to clear existing chunks for ${doc.id}:`,
				err.message,
			);
		});

	if (operations.length > 0) {
		await es.bulk({ operations, refresh: true });
	}

	const finishedAt = new Date();
	await updateDocument(documentId, {
		title: resolvedTitle,
		language: docLanguage,
		ingestion_status: "done",
		ingestion_error: null,
		last_finished_at: finishedAt,
		ingested_at: finishedAt,
	});
}

async function extractDocumentText(doc) {
	if (doc.source_type === "upload" || doc.filename?.toLowerCase().endsWith(".pdf")) {
		return extractTextFromPDF(doc.file_path);
	}

	const text = await readFile(doc.file_path, "utf8");
	return {
		text,
		title: doc.title || null,
	};
}

async function handleProcessingFailure(documentId, err) {
	const doc = await getDocumentById(documentId);
	if (!doc) {
		await clearQueueState(documentId);
		return;
	}

	const attempts = doc.ingestion_attempts || 0;
	const errorMessage = err?.message || "Document ingestion failed";
	await clearQueueState(documentId);

	if (attempts < config.ingestion.maxRetries) {
		await updateDocument(documentId, {
			ingestion_status: "pending",
			ingestion_error: errorMessage,
			last_finished_at: new Date(),
		});
		await enqueueDocumentIngestion(documentId);
		return;
	}

	await updateDocument(documentId, {
		ingestion_status: "failed",
		ingestion_error: errorMessage,
		last_finished_at: new Date(),
	});
}

async function clearQueueState(documentId) {
	const redis = getRedisClient();
	if (!redis) return;

	await Promise.all([
		redis.srem(ENQUEUED_SET_KEY, documentId),
		redis.lrem(PROCESSING_QUEUE_KEY, 0, documentId),
	]);
}
