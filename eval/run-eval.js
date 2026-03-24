/**
 * RAG Retrieval Evaluation Script
 *
 * Measures Recall@5 and MRR for four retrieval strategies:
 *   1. BM25 only
 *   2. kNN only
 *   3. Hybrid (BM25 + kNN, no reranker)
 *   4. Hybrid + Rerank
 *
 * Prerequisites:
 *   - Elasticsearch running (port 9200)
 *   - Embedding service running (port 8001) — needed for kNN, Hybrid, Hybrid+Rerank
 *   - Reranker service running (port 8002)   — needed for Hybrid+Rerank only
 *   - Documents seeded: cd node-backend && node scripts/seedDocs.js
 *     seedDocs.js writes eval/seed-doc-ids.json and prints a chunk map so you can
 *     verify the chunkIndex labels in eval/ground-truth.json after re-seeding.
 *
 * Run from node-backend/:
 *   cd node-backend && node ../eval/run-eval.js
 */

import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

// Import strategy functions (paths relative to this file's location)
import {
	retrieveChunksBM25Only,
	retrieveChunksKNNOnly,
	retrieveChunksHybridOnly,
	retrieveChunks,
} from "../node-backend/src/services/ragService.js";

import {
	esAvailable,
	initElasticsearch,
} from "../node-backend/src/utils/ragHelper/esClient.js";

// ── Eval config ───────────────────────────────────────────────────────────

// How many top results to score.
// Seed corpus: 4 documents × 12–16 chunks each = ~56 chunks total.
// With EVAL_K=5 and ~14 chunks per document, Recall@5 baseline ≈ 36% (random).
// For the full 33-document corpus with real PDFs, each large document may have
// 20–50+ chunks, making Recall@5 even more discriminating.
const EVAL_K = 5;

// ── Load ground truth ──────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const groundTruthPath = path.join(__dirname, "ground-truth.json");
const groundTruth = JSON.parse(fs.readFileSync(groundTruthPath, "utf8"));

// ── Validate ground truth ──────────────────────────────────────────────────

function validate(groundTruth) {
	const placeholders = groundTruth.filter((q) =>
		q.docId.startsWith("PLACEHOLDER"),
	);
	if (placeholders.length > 0) {
		console.error(
			`\nERROR: ${placeholders.length} queries still have placeholder docIds:`,
		);
		placeholders.forEach((q) => console.error(`  ${q.id}: ${q.docId}`));
		console.error(
			"\nRun seedDocs.js first, then replace PLACEHOLDER_* with real IDs from eval/seed-doc-ids.json",
		);
		process.exit(1);
	}
	const unlabeled = groundTruth.filter((q) => q.relevantChunks.length === 0);
	if (unlabeled.length > 0) {
		console.error(
			`\nERROR: ${unlabeled.length} queries have no relevantChunks labeled:`,
		);
		unlabeled.forEach((q) => console.error(`  ${q.id}: ${q.query}`));
		console.error("\nLabel relevantChunks before running eval.");
		process.exit(1);
	}
}

// ── Metrics ────────────────────────────────────────────────────────────────

/**
 * Compute Recall@K (binary) and Mean Reciprocal Rank (MRR) for a single strategy.
 *
 * Recall@K: 1 if ANY relevant chunk appears in the top-K results, else 0.
 * MRR: 1/rank of the FIRST relevant chunk within top-K. 0 if not found.
 */
async function evalStrategy(name, fn, groundTruth) {
	let recallHits = 0;
	let reciprocalRankSum = 0;

	for (const q of groundTruth) {
		let results;
		try {
			results = await fn(q.query, q.docId);
		} catch (err) {
			console.warn(`  [${name}] q=${q.id} error: ${err.message}`);
			results = [];
		}

		const topK = results.slice(0, EVAL_K);
		for (let i = 0; i < topK.length; i++) {
			const rank = i + 1; // 0-based index → 1-based rank
			const isRelevant = q.relevantChunks.some(
				(rc) => rc.chunkIndex === topK[i].chunkIndex,
			);
			if (isRelevant) {
				recallHits += 1;
				reciprocalRankSum += 1 / rank;
				break; // score only first hit per query
			}
		}
	}

	return {
		[`recall${EVAL_K}`]: recallHits / groundTruth.length,
		mrr: reciprocalRankSum / groundTruth.length,
	};
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
	validate(groundTruth);

	await initElasticsearch();
	if (!esAvailable) {
		console.error("Elasticsearch not available — aborting");
		process.exit(1);
	}

	console.log(`\nRunning eval on ${groundTruth.length} queries...\n`);

	const strategies = [
		{ name: "BM25 only", fn: retrieveChunksBM25Only },
		{ name: "kNN only", fn: retrieveChunksKNNOnly },
		{ name: "Hybrid", fn: retrieveChunksHybridOnly },
		{ name: "Hybrid + Rerank", fn: retrieveChunks },
	];

	const results = {};
	for (const s of strategies) {
		process.stdout.write(`  Running ${s.name}...`);
		const metrics = await evalStrategy(s.name, s.fn, groundTruth);
		results[s.name] = metrics;
		const recallKey = `recall${EVAL_K}`;
		console.log(
			` Recall@${EVAL_K}=${metrics[recallKey].toFixed(2)}  MRR=${metrics.mrr.toFixed(2)}`,
		);
	}

	// ── Print comparison table ──
	const recallKey = `recall${EVAL_K}`;
	const header = `Recall@${EVAL_K}`;
	const divider = "─".repeat(46);
	console.log("\n" + divider);
	console.log(`Strategy            ${header.padStart(8)}    MRR`);
	console.log(divider);
	for (const s of strategies) {
		const m = results[s.name];
		const name = s.name.padEnd(18);
		const recall = m[recallKey].toFixed(2).padStart(8);
		const mrr = m.mrr.toFixed(2).padStart(7);
		console.log(`${name}  ${recall}     ${mrr}`);
	}
	console.log(divider + "\n");

	// ── Write results.json ──
	const output = {
		runAt: new Date().toISOString(),
		totalQueries: groundTruth.length,
		strategies: Object.fromEntries(
			strategies.map((s) => [s.name, results[s.name]]),
		),
	};
	const outPath = path.join(__dirname, "results.json");
	fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
	console.log(`Results written to eval/results.json`);
}

main().catch((err) => {
	console.error("Eval failed:", err);
	process.exit(1);
});
