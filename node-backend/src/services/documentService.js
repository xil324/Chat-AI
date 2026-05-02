import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";
import { mkdir, readFile, unlink, rename, writeFile } from "fs/promises";
import { join, dirname, parse as parsePath } from "path";
import { fileURLToPath } from "url";
import { es, CHUNK_INDEX } from "../utils/ragHelper/esClient.js";
import {
	createDocument,
	getDocumentsByUserName,
	getDocumentById,
	getDocumentByHash,
	getDocumentBySourceUrl,
	deleteDocument as deleteDocumentFromDB,
} from "../dao/documentDao.js";
import {
	getSessionById,
	updateAttachedDocument,
	clearAttachedDocument,
} from "../dao/sessionDao.js";
import {
	enqueueDocumentIngestion,
	removeDocumentIngestionMarkers,
} from "./documentIngestionService.js";
import { fetchWebDocument } from "./webConnectorService.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, "../../uploads");

function createHttpError(message, status) {
	const err = new Error(message);
	err.status = status;
	return err;
}

function toDocumentResponse(doc, extra = {}) {
	return {
		id: doc.id,
		filename: doc.filename,
		title: doc.title,
		source: doc.source,
		source_url: doc.source_url || null,
		source_type: doc.source_type || "upload",
		source_last_modified: doc.source_last_modified || null,
		source_etag: doc.source_etag || null,
		last_synced_at: doc.last_synced_at || null,
		category: doc.category,
		language: doc.language,
		ingestion_status: doc.ingestion_status || "pending",
		ingestion_error: doc.ingestion_error || null,
		ingestion_attempts: doc.ingestion_attempts || 0,
		ingested_at: doc.ingested_at || null,
		created_at: doc.created_at,
		updated_at: doc.updated_at,
		...extra,
	};
}

async function hashFile(filePath) {
	const buffer = await readFile(filePath);
	return createHash("sha256").update(buffer).digest("hex");
}

export async function uploadDocument(userName, file, meta = {}) {
	const docId = uuidv4();
	const filename = file.originalname;
	const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
	const filePath = join(UPLOADS_DIR, `${docId}_${safeName}`);

	await rename(file.path, filePath);
	const contentHash = await hashFile(filePath);
	const duplicate = await getDocumentByHash(userName, contentHash);

	if (duplicate) {
		await unlink(filePath).catch(() => {});
		return toDocumentResponse(duplicate, { deduplicated: true });
	}

	// Title defaults to filename without extension
	const title = meta.title || parsePath(filename).name.replace(/[_-]/g, " ");
	const source = meta.source || null;
	const category = meta.category || null;

	const doc = await createDocument({
		id: docId,
		user_name: userName,
		filename,
		file_path: filePath,
		title,
		source,
		source_type: meta.source_type || "upload",
		category,
		language: null,
		content_hash: contentHash,
		ingestion_status: "pending",
		ingestion_error: null,
		ingestion_attempts: 0,
		last_enqueued_at: new Date(),
		created_at: new Date(),
		updated_at: new Date(),
	});
	await enqueueDocumentIngestion(docId);

	return toDocumentResponse(doc);
}

export async function importWebDocument(userName, url, meta = {}) {
	const fetched = await fetchWebDocument(url);
	const existingByUrl = await getDocumentBySourceUrl(userName, fetched.url);

	if (existingByUrl?.content_hash === fetched.contentHash) {
		return toDocumentResponse(existingByUrl, {
			deduplicated: true,
			not_modified: true,
		});
	}

	const duplicate = await getDocumentByHash(userName, fetched.contentHash);
	if (duplicate) {
		return toDocumentResponse(duplicate, { deduplicated: true });
	}

	const docId = uuidv4();
	const title = meta.title || fetched.title || fetched.url;
	const safeName = title.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
	const filename = `${safeName || "web-document"}.txt`;
	const filePath = join(UPLOADS_DIR, `${docId}_${filename}`);

	await mkdir(UPLOADS_DIR, { recursive: true });
	await writeFile(filePath, fetched.text, "utf8");

	const now = new Date();
	const doc = await createDocument({
		id: docId,
		user_name: userName,
		filename,
		file_path: filePath,
		title,
		source: meta.source || new URL(fetched.url).hostname,
		source_url: fetched.url,
		source_type: "web",
		source_last_modified: fetched.sourceLastModified,
		source_etag: fetched.sourceEtag,
		last_synced_at: now,
		category: meta.category || null,
		language: null,
		content_hash: fetched.contentHash,
		ingestion_status: "pending",
		ingestion_error: null,
		ingestion_attempts: 0,
		last_enqueued_at: now,
		created_at: now,
		updated_at: now,
	});
	await enqueueDocumentIngestion(docId);

	return toDocumentResponse(doc);
}

export async function listDocuments(userName) {
	const docs = await getDocumentsByUserName(userName);
	return docs?.map((doc) => toDocumentResponse(doc));
}

export async function getDocumentStatusById(userName, documentId) {
	const doc = await getDocumentById(documentId);
	if (!doc) throw createHttpError("Document not found", 404);
	if (doc.user_name !== userName) throw createHttpError("Forbidden", 403);
	return toDocumentResponse(doc);
}

export async function deleteDocumentById(userName, documentId) {
	const doc = await getDocumentById(documentId);
	if (!doc) throw createHttpError("Document not found", 404);
	if (doc.user_name !== userName) throw createHttpError("Forbidden", 403);

	await removeDocumentIngestionMarkers(documentId);

	await es.deleteByQuery({
		index: CHUNK_INDEX,
		query: { term: { doc_id: documentId } },
		refresh: true,
	});

	await unlink(doc.file_path).catch(() => {});
	await deleteDocumentFromDB(documentId);
}

export async function attachDocumentToSession(userName, sessionId, documentId) {
	const doc = await getDocumentById(documentId);
	if (!doc) throw createHttpError("Document not found", 404);
	if (doc.user_name !== userName) throw createHttpError("Forbidden", 403);
	if (doc.ingestion_status !== "done") {
		throw createHttpError(
			"Document is still processing and cannot be attached yet",
			409,
		);
	}
	await updateAttachedDocument(sessionId, documentId);
}

export async function detachDocumentFromSession(userName, sessionId) {
	const session = await getSessionById(sessionId);
	if (!session) throw createHttpError("Session not found", 404);
	if (session.user_name !== userName) throw createHttpError("Forbidden", 403);
	await clearAttachedDocument(sessionId);
}
