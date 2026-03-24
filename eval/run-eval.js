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
 *   - Documents seeded: cd node-backend && node scripts/seedDocs.js <username>
 *   - Placeholders in eval/ground-truth.json replaced with real docIds from eval/seed-doc-ids.json
 *   - relevantChunks labeled in eval/ground-truth.json
 *
 * Run from node-backend/:
 *   cd node-backend && node ../eval/run-eval.js
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Import strategy functions (paths relative to this file's location)
import {
  retrieveChunksBM25Only,
  retrieveChunksKNNOnly,
  retrieveChunksHybridOnly,
  retrieveChunks,
} from '../node-backend/src/services/ragService.js';

import { esAvailable, initElasticsearch } from '../node-backend/src/utils/ragHelper/esClient.js';

// ── Load ground truth ──────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const groundTruthPath = path.join(__dirname, 'ground-truth.json');
const groundTruth = JSON.parse(fs.readFileSync(groundTruthPath, 'utf8'));

// ── Validate ground truth ──────────────────────────────────────────────────

function validate(groundTruth) {
  const placeholders = groundTruth.filter(q => q.docId.startsWith('PLACEHOLDER'));
  if (placeholders.length > 0) {
    console.error(`\nERROR: ${placeholders.length} queries still have placeholder docIds:`);
    placeholders.forEach(q => console.error(`  ${q.id}: ${q.docId}`));
    console.error('\nRun seedDocs.js first, then replace PLACEHOLDER_* with real IDs from eval/seed-doc-ids.json');
    process.exit(1);
  }
  const unlabeled = groundTruth.filter(q => q.relevantChunks.length === 0);
  if (unlabeled.length > 0) {
    console.error(`\nERROR: ${unlabeled.length} queries have no relevantChunks labeled:`);
    unlabeled.forEach(q => console.error(`  ${q.id}: ${q.query}`));
    console.error('\nLabel relevantChunks before running eval.');
    process.exit(1);
  }
}

// ── Metrics ────────────────────────────────────────────────────────────────

/**
 * Compute Recall@5 (binary) and MRR for a single strategy.
 *
 * Recall@5: 1 if ANY relevant chunk appears in top-5, else 0. Binary per query.
 * MRR: 1/rank of the FIRST relevant chunk. Subsequent relevant chunks ignored.
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

    for (let i = 0; i < results.length; i++) {
      const rank = i + 1; // 0-based index → 1-based rank
      const isRelevant = q.relevantChunks.some(rc => rc.chunkIndex === results[i].chunkIndex);
      if (isRelevant) {
        recallHits += 1;
        reciprocalRankSum += 1 / rank;
        break; // score only first hit per query
      }
    }
  }

  return {
    recall5: recallHits / groundTruth.length,
    mrr:     reciprocalRankSum / groundTruth.length,
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  validate(groundTruth);

  await initElasticsearch();
  if (!esAvailable) {
    console.error('Elasticsearch not available — aborting');
    process.exit(1);
  }

  console.log(`\nRunning eval on ${groundTruth.length} queries...\n`);

  const strategies = [
    { name: 'BM25 only',       fn: retrieveChunksBM25Only },
    { name: 'kNN only',        fn: retrieveChunksKNNOnly },
    { name: 'Hybrid',          fn: retrieveChunksHybridOnly },
    { name: 'Hybrid + Rerank', fn: retrieveChunks },
  ];

  const results = {};
  for (const s of strategies) {
    process.stdout.write(`  Running ${s.name}...`);
    const metrics = await evalStrategy(s.name, s.fn, groundTruth);
    results[s.name] = metrics;
    console.log(` Recall@5=${metrics.recall5.toFixed(2)}  MRR=${metrics.mrr.toFixed(2)}`);
  }

  // ── Print comparison table ──
  console.log('\n' + '─'.repeat(46));
  console.log('Strategy            Recall@5    MRR');
  console.log('─'.repeat(46));
  for (const s of strategies) {
    const m = results[s.name];
    const name = s.name.padEnd(18);
    const r5   = m.recall5.toFixed(2).padStart(6);
    const mrr  = m.mrr.toFixed(2).padStart(7);
    console.log(`${name}  ${r5}     ${mrr}`);
  }
  console.log('─'.repeat(46) + '\n');

  // ── Write results.json ──
  const output = {
    runAt: new Date().toISOString(),
    totalQueries: groundTruth.length,
    strategies: Object.fromEntries(
      strategies.map(s => [s.name, results[s.name]])
    ),
  };
  const outPath = path.join(__dirname, 'results.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Results written to eval/results.json`);
}

main().catch(err => {
  console.error('Eval failed:', err);
  process.exit(1);
});
