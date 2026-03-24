# RAG Evaluation Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone evaluation script that measures Recall@5 and MRR for four retrieval strategies (BM25-only, kNN-only, Hybrid, Hybrid+Rerank) against 23 labeled Chinese queries.

**Architecture:** Add three new retrieval variant functions to `ragService.js`, update the existing `retrieveChunks` to expose `chunkIndex`, update `seedDocs.js` to write a docId map, write the ground-truth dataset, and write the eval runner script.

**Tech Stack:** Node.js ESM, Elasticsearch 8 (@elastic/elasticsearch), existing `ragService.js` patterns.

---

## File Map

| File | Action | What it does |
|---|---|---|
| `node-backend/src/services/ragService.js` | Modify | Add `chunkIndex` to `retrieveChunks` return; add 3 new strategy functions |
| `node-backend/scripts/seedDocs.js` | Modify | Write `eval/seed-doc-ids.json` after seeding |
| `eval/ground-truth.json` | Create | 23 labeled queries with placeholder docIds |
| `eval/run-eval.js` | Create | Standalone eval runner |
| `.gitignore` (project root) | Modify | Ignore `eval/results.json`, `eval/seed-doc-ids.json` |

---

## Task 1: Add `.gitignore` entries and scaffold `eval/`

**Files:**
- Modify: `.gitignore` (project root)
- Create: `eval/.gitkeep` (to track the directory)

- [ ] **Step 1: Check the root `.gitignore`**

  ```bash
  cat .gitignore
  ```

- [ ] **Step 2: Add eval output files to `.gitignore`**

  Append to the root `.gitignore`:

  ```
  eval/results.json
  eval/seed-doc-ids.json
  ```

- [ ] **Step 3: Create `eval/` directory with a `.gitkeep`**

  ```bash
  mkdir -p eval && touch eval/.gitkeep
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add .gitignore eval/.gitkeep
  git commit -m "feat: scaffold eval/ directory and gitignore eval outputs"
  ```

---

## Task 2: Add `chunkIndex` to `retrieveChunks` return

**Context:** `candidateMeta` already tracks `chunkIndex` (lines 85/97 of `ragService.js`), but the final return object omits it. This is a **prerequisite** — without it, all eval scores will be 0.

**Files:**
- Modify: `node-backend/src/services/ragService.js` (lines 115–121)

- [ ] **Step 1: Open `ragService.js` and locate the return statement**

  It's the `reranked.map(r => ({ ... }))` block, currently returning:
  `{ chunkId, content, title, source, url }`

- [ ] **Step 2: Add `chunkIndex` to the return**

  Change the return object inside `reranked.map(...)` from:

  ```js
  return reranked.map(r => ({
    chunkId: filteredIds[r.index],
    content: r.passage,
    title:   candidateMeta[r.index]?.title  || '',
    source:  candidateMeta[r.index]?.source || '',
    url:     candidateMeta[r.index]?.url    || null,
  }));
  ```

  To:

  ```js
  return reranked.map(r => ({
    chunkId:    filteredIds[r.index],
    content:    r.passage,
    chunkIndex: candidateMeta[r.index]?.chunkIndex ?? null,
    title:      candidateMeta[r.index]?.title  || '',
    source:     candidateMeta[r.index]?.source || '',
    url:        candidateMeta[r.index]?.url    || null,
  }));
  ```

- [ ] **Step 3: Verify the change is backward-compatible**

  Existing callers of `retrieveChunks` are `agenticPipeline.js` and `chatService.js`. Both destructure only the fields they need — adding `chunkIndex` is safe (new field, nothing removed).

  ```bash
  grep -r "retrieveChunks\b" node-backend/src --include="*.js"
  ```

  Expected: shows `agenticPipeline.js` and `ragService.js` only.

- [ ] **Step 4: Commit**

  ```bash
  git add node-backend/src/services/ragService.js
  git commit -m "feat: expose chunkIndex in retrieveChunks return shape"
  ```

---

## Task 3: Add `retrieveChunksBM25Only`

**Files:**
- Modify: `node-backend/src/services/ragService.js`

- [ ] **Step 1: Add the function after `retrieveChunks`**

  Append this export to `ragService.js` (after the `retrieveContext` function at the bottom):

  ```js
  /**
   * BM25-only retrieval — no embedding, no fusion, no reranker.
   * Safe to run without the embedding service (port 8001).
   */
  export async function retrieveChunksBM25Only(query, documentId) {
    if (!esAvailable) return [];

    const queryLang = detectLanguage(query);
    const searchQuery = queryLang === 'zh'
      ? await translateToEnglish(query)
      : query;

    const response = await es.search({
      index: CHUNK_INDEX,
      query: {
        bool: {
          must: [{ multi_match: { query: searchQuery, fields: ['content', 'content_en', 'content_zh'] } }],
          filter: [{ term: { doc_id: documentId } }],
        },
      },
      size: TOP_K,
      _source: ['content', 'title', 'source', 'chunk_index'],
    });

    return response.hits.hits.map(hit => ({
      chunkId:    hit._id,
      content:    hit._source.content,
      chunkIndex: hit._source.chunk_index,
      title:      hit._source.title  || '',
      source:     hit._source.source || '',
      url:        null,
    }));
  }
  ```

- [ ] **Step 2: Verify it uses `TOP_K` (already defined at the top of the file as `5`)**

  ```bash
  grep "TOP_K" node-backend/src/services/ragService.js
  ```

  Expected: `const TOP_K = 5;` at the top.

- [ ] **Step 3: Commit**

  ```bash
  git add node-backend/src/services/ragService.js
  git commit -m "feat: add retrieveChunksBM25Only eval strategy"
  ```

---

## Task 4: Add `retrieveChunksKNNOnly`

**Files:**
- Modify: `node-backend/src/services/ragService.js`

- [ ] **Step 1: Append the function after `retrieveChunksBM25Only`**

  ```js
  /**
   * kNN-only retrieval — no translation, no BM25, no reranker.
   * Uses the original query (not translated) for semantic search.
   */
  export async function retrieveChunksKNNOnly(query, documentId) {
    if (!esAvailable) return [];

    const queryVector = await embed(query);

    const response = await es.search({
      index: CHUNK_INDEX,
      knn: {
        field: 'embedding',
        query_vector: queryVector,
        k: TOP_K,
        num_candidates: 100,
        filter: { term: { doc_id: documentId } },
      },
      size: TOP_K,
      _source: ['content', 'title', 'source', 'chunk_index'],
    });

    return response.hits.hits.map(hit => ({
      chunkId:    hit._id,
      content:    hit._source.content,
      chunkIndex: hit._source.chunk_index,
      title:      hit._source.title  || '',
      source:     hit._source.source || '',
      url:        null,
    }));
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add node-backend/src/services/ragService.js
  git commit -m "feat: add retrieveChunksKNNOnly eval strategy"
  ```

---

## Task 5: Add `retrieveChunksHybridOnly`

**Files:**
- Modify: `node-backend/src/services/ragService.js`

- [ ] **Step 1: Append the function after `retrieveChunksKNNOnly`**

  ```js
  /**
   * Hybrid retrieval (BM25 + kNN weighted RRF) without the reranker.
   * Uses the exact same RRF formula as retrieveChunks so the eval
   * comparison isolates the reranker's contribution.
   */
  export async function retrieveChunksHybridOnly(query, documentId) {
    if (!esAvailable) return [];

    const queryLang = detectLanguage(query);
    const searchQuery = queryLang === 'zh'
      ? await translateToEnglish(query)
      : query;

    const queryVector = await embed(query);

    const [bm25Response, knnResponse] = await Promise.all([
      es.search({
        index: CHUNK_INDEX,
        query: {
          bool: {
            must: [{ multi_match: { query: searchQuery, fields: ['content', 'content_en', 'content_zh'] } }],
            filter: [{ term: { doc_id: documentId } }],
          },
        },
        size: SEARCH_SIZE,
        _source: ['content', 'title', 'source', 'chunk_index'],
      }),
      es.search({
        index: CHUNK_INDEX,
        knn: {
          field: 'embedding',
          query_vector: queryVector,
          k: SEARCH_SIZE,
          num_candidates: 100,
          filter: { term: { doc_id: documentId } },
        },
        size: SEARCH_SIZE,
        _source: ['content', 'title', 'source', 'chunk_index'],
      }),
    ]);

    const fusionScore = {};
    const idToContent = {};
    const idToMeta    = {};

    bm25Response.hits.hits.forEach((hit, idx) => {
      fusionScore[hit._id] = (fusionScore[hit._id] || 0) + WEIGHTS.fulltext / (idx + RRF_K);
      idToContent[hit._id] = hit._source.content;
      idToMeta[hit._id] = {
        chunkIndex: hit._source.chunk_index,
        title:      hit._source.title  || '',
        source:     hit._source.source || '',
      };
    });

    knnResponse.hits.hits.forEach((hit, idx) => {
      fusionScore[hit._id] = (fusionScore[hit._id] || 0) + WEIGHTS.semantic / (idx + RRF_K);
      idToContent[hit._id] = hit._source.content;
      idToMeta[hit._id] = idToMeta[hit._id] || {
        chunkIndex: hit._source.chunk_index,
        title:      hit._source.title  || '',
        source:     hit._source.source || '',
      };
    });

    const topIds = Object.entries(fusionScore)
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_K)
      .map(([id]) => id)
      .filter(id => idToContent[id]);

    return topIds.map(id => ({
      chunkId:    id,
      content:    idToContent[id],
      chunkIndex: idToMeta[id]?.chunkIndex ?? null,
      title:      idToMeta[id]?.title  || '',
      source:     idToMeta[id]?.source || '',
      url:        null,
    }));
  }
  ```

- [ ] **Step 2: Verify `WEIGHTS`, `RRF_K`, `SEARCH_SIZE` are all defined at the top of `ragService.js`**

  ```bash
  head -15 node-backend/src/services/ragService.js
  ```

  Expected to see: `const SEARCH_SIZE = 20;`, `const RRF_K = 60;`, `const TOP_K = 5;`, `const WEIGHTS = { fulltext: 0.4, semantic: 0.6 };`

- [ ] **Step 3: Commit**

  ```bash
  git add node-backend/src/services/ragService.js
  git commit -m "feat: add retrieveChunksHybridOnly eval strategy"
  ```

---

## Task 6: Update `seedDocs.js` to write `eval/seed-doc-ids.json`

**Context:** The seeder generates a UUID per document at runtime. After seeding, we need to record those UUIDs so the eval ground-truth can reference them by docId. The file must be written to `<project-root>/eval/` regardless of where the seeder is run from — use `import.meta.url` for an absolute path.

**Files:**
- Modify: `node-backend/scripts/seedDocs.js`

- [ ] **Step 1: Add imports at the top of `seedDocs.js`**

  After the existing imports, add:

  ```js
  import { fileURLToPath } from 'url';
  import path from 'path';
  import fs from 'fs';
  ```

- [ ] **Step 2: Add a `docIdMap` accumulator before the loop**

  Before `for (const doc of DOCUMENTS) {`, add:

  ```js
  const DOC_KEY_MAP = {
    'CHIP Program Overview — Texas':                                        'chip',
    'Texas Medicaid — Eligibility and Benefits Overview':                  'medicaid',
    'How to File a Health Insurance Complaint — Texas Department of Insurance': 'tdi',
    'Premium Tax Credits and ACA Marketplace Insurance — Overview':        'aca',
  };
  const docIdMap = {};
  ```

- [ ] **Step 3: Record each docId inside the loop**

  Inside `for (const doc of DOCUMENTS)`, after `const docId = uuidv4();`, add:

  ```js
  const key = DOC_KEY_MAP[doc.title];
  if (key) docIdMap[key] = docId;
  ```

- [ ] **Step 4: Write `eval/seed-doc-ids.json` after the loop, before `mongoose.disconnect()`**

  ```js
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const evalDir = path.resolve(__dirname, '../../eval');
  fs.mkdirSync(evalDir, { recursive: true });
  fs.writeFileSync(
    path.join(evalDir, 'seed-doc-ids.json'),
    JSON.stringify(docIdMap, null, 2)
  );
  console.log('\nWrote eval/seed-doc-ids.json:', docIdMap);
  ```

- [ ] **Step 5: Verify the path resolves correctly**

  `seedDocs.js` is at `node-backend/scripts/seedDocs.js`. `import.meta.url` gives its absolute path. `path.resolve(__dirname, '../../eval')` goes up two levels (scripts → node-backend → project root) then into `eval/`. This resolves to `<project-root>/eval/` correctly regardless of CWD.

- [ ] **Step 6: Commit**

  ```bash
  git add node-backend/scripts/seedDocs.js
  git commit -m "feat: write eval/seed-doc-ids.json after seeding"
  ```

---

## Task 7: Write `eval/ground-truth.json`

**Context:** This file contains the 23 labeled queries with placeholder docIds. After seeding, you replace the placeholders with real IDs from `eval/seed-doc-ids.json`. The `chunkIndex` values here are **placeholder zeros** — you must fill them in after seeding by querying ES to find which chunk index contains the relevant content for each query. See Task 9 for the labeling process.

**Files:**
- Create: `eval/ground-truth.json`

- [ ] **Step 1: Create `eval/ground-truth.json` with the 23 queries**

  ```json
  [
    { "id": "q01", "query": "我的孩子能申请CHIP吗",              "queryType": "eligibility", "docId": "PLACEHOLDER_CHIP",     "relevantChunks": [] },
    { "id": "q02", "query": "低收入家庭可以申请医疗补助吗",        "queryType": "eligibility", "docId": "PLACEHOLDER_MEDICAID", "relevantChunks": [] },
    { "id": "q03", "query": "没有工作的人可以参加Medicaid吗",      "queryType": "eligibility", "docId": "PLACEHOLDER_MEDICAID", "relevantChunks": [] },
    { "id": "q04", "query": "移民儿童有资格申请CHIP吗",            "queryType": "eligibility", "docId": "PLACEHOLDER_CHIP",     "relevantChunks": [] },
    { "id": "q05", "query": "怀孕期间可以申请Medicaid吗",          "queryType": "eligibility", "docId": "PLACEHOLDER_MEDICAID", "relevantChunks": [] },
    { "id": "q06", "query": "残疾人能享受哪些医疗保障",            "queryType": "eligibility", "docId": "PLACEHOLDER_MEDICAID", "relevantChunks": [] },
    { "id": "q07", "query": "CHIP申请流程是什么",                  "queryType": "exact-term",  "docId": "PLACEHOLDER_CHIP",     "relevantChunks": [] },
    { "id": "q08", "query": "ACA 保费税收抵免 premium tax credit 计算方式", "queryType": "exact-term", "docId": "PLACEHOLDER_ACA", "relevantChunks": [] },
    { "id": "q09", "query": "Medicaid STAR 计划覆盖哪些服务",      "queryType": "exact-term",  "docId": "PLACEHOLDER_MEDICAID", "relevantChunks": [] },
    { "id": "q10", "query": "TDI如何处理保险投诉",                 "queryType": "exact-term",  "docId": "PLACEHOLDER_TDI",      "relevantChunks": [] },
    { "id": "q11", "query": "联邦贫困线 FPL 200% 对应的收入是多少","queryType": "exact-term",  "docId": "PLACEHOLDER_ACA",      "relevantChunks": [] },
    { "id": "q12", "query": "CHIP Perinatal 计划的申请条件",       "queryType": "exact-term",  "docId": "PLACEHOLDER_CHIP",     "relevantChunks": [] },
    { "id": "q13", "query": "如何申诉保险公司拒赔决定",            "queryType": "procedure",   "docId": "PLACEHOLDER_TDI",      "relevantChunks": [] },
    { "id": "q14", "query": "怎么更换我的Medicaid主治医生",        "queryType": "procedure",   "docId": "PLACEHOLDER_MEDICAID", "relevantChunks": [] },
    { "id": "q15", "query": "如何申请ACA市场保险的特殊注册期",     "queryType": "procedure",   "docId": "PLACEHOLDER_ACA",      "relevantChunks": [] },
    { "id": "q16", "query": "保险公司拒绝理赔后我该怎么办",        "queryType": "procedure",   "docId": "PLACEHOLDER_TDI",      "relevantChunks": [] },
    { "id": "q17", "query": "如何查看我的医疗补助申请状态",        "queryType": "procedure",   "docId": "PLACEHOLDER_MEDICAID", "relevantChunks": [] },
    { "id": "q18", "query": "怎么续保德克萨斯州儿童健康保险",     "queryType": "procedure",   "docId": "PLACEHOLDER_CHIP",     "relevantChunks": [] },
    { "id": "q19", "query": "Medicaid 和 CHIP 的区别是什么",       "queryType": "comparison",  "docId": "PLACEHOLDER_CHIP",     "relevantChunks": [] },
    { "id": "q20", "query": "ACA 市场保险和 Medicaid 哪个更适合我","queryType": "comparison",  "docId": "PLACEHOLDER_ACA",      "relevantChunks": [] },
    { "id": "q21", "query": "CHIP 和私人保险的覆盖范围有什么不同", "queryType": "comparison",  "docId": "PLACEHOLDER_CHIP",     "relevantChunks": [] },
    { "id": "q22", "query": "德克萨斯州 Medicaid 和联邦 Medicaid 有什么区别", "queryType": "comparison", "docId": "PLACEHOLDER_MEDICAID", "relevantChunks": [] },
    { "id": "q23", "query": "保费补贴和成本分担补贴的区别",        "queryType": "comparison",  "docId": "PLACEHOLDER_ACA",      "relevantChunks": [] }
  ]
  ```

  Note: q07 was changed from `"CHIP 申请表 H1205 如何填写"` (a form number not in seeded text) to `"CHIP申请流程是什么"` — a query that retrieves actual content. Similarly q10 was changed from the TDI form number to `"TDI如何处理保险投诉"`. This avoids queries guaranteed to score 0.

- [ ] **Step 2: Commit the template (with placeholder docIds and empty relevantChunks)**

  ```bash
  git add eval/ground-truth.json
  git commit -m "feat: add eval ground-truth template with 23 queries"
  ```

---

## Task 8: Write `eval/run-eval.js`

**Context:** The script is run from `node-backend/` so that dotenv finds `.env` correctly. ES module imports inside `ragService.js` resolve relative to the file's location, not CWD — this is correct Node.js ESM behavior.

**Run command:** `cd node-backend && node ../eval/run-eval.js`

**Files:**
- Create: `eval/run-eval.js`

- [ ] **Step 1: Write `eval/run-eval.js`**

  ```js
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
   *
   * Run from node-backend/:
   *   cd node-backend && node ../eval/run-eval.js
   */

  import { fileURLToPath } from 'url';
  import path from 'path';
  import fs from 'fs';

  // Import strategy functions from ragService (path relative to this file's location)
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
      console.error('\nLabel relevantChunks before running eval (see Task 9 in the plan).');
      process.exit(1);
    }
  }

  // ── Metrics ────────────────────────────────────────────────────────────────

  /**
   * Compute Recall@5 (binary) and MRR for a single strategy.
   *
   * Recall@5: 1 if ANY relevant chunk appears in top-5, else 0. Binary per query.
   * MRR: 1/rank of the FIRST relevant chunk. Subsequent relevant chunks are ignored.
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
    // Validate ground truth before starting
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
    console.log('Strategy          Recall@5    MRR');
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
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add eval/run-eval.js
  git commit -m "feat: add eval runner script"
  ```

---

## Task 9: Seed, label, and run

**This task is manual labeling work.** It requires Elasticsearch, the embedding service, and the reranker service to be running.

**Files:**
- Modify: `eval/ground-truth.json` (fill in docIds and `relevantChunks`)

- [ ] **Step 1: Seed the documents**

  ```bash
  cd node-backend
  node scripts/seedDocs.js <your-username>
  ```

  Expected output includes:
  ```
  Wrote eval/seed-doc-ids.json: { chip: '...', medicaid: '...', tdi: '...', aca: '...' }
  ```

- [ ] **Step 2: Replace `PLACEHOLDER_*` in `eval/ground-truth.json`**

  Read `eval/seed-doc-ids.json` and replace:
  - `PLACEHOLDER_CHIP` → value of `chip`
  - `PLACEHOLDER_MEDICAID` → value of `medicaid`
  - `PLACEHOLDER_TDI` → value of `tdi`
  - `PLACEHOLDER_ACA` → value of `aca`

- [ ] **Step 3: Label `relevantChunks` for each query**

  For each query, find the relevant chunk(s) by searching ES directly. Use a helper query to see which chunks exist for a given doc:

  ```bash
  curl -s "http://localhost:9200/healthcare_chunks/_search" \
    -H "Content-Type: application/json" \
    -d '{
      "query": { "term": { "doc_id": "<REAL_DOC_ID>" } },
      "size": 50,
      "_source": ["chunk_index", "content"]
    }' | jq '.hits.hits[] | {idx: ._source.chunk_index, preview: ._source.content[:80]}'
  ```

  Read each chunk preview and identify which `chunk_index` value(s) contain the answer to the query. Add them to `relevantChunks`:

  ```json
  "relevantChunks": [{ "chunkIndex": 2 }]
  ```

  Typical documents have 5–10 chunks. Label 1–2 relevant chunks per query. Aim for at least one clearly correct answer.

- [ ] **Step 4: Validate and run eval**

  ```bash
  cd node-backend && node ../eval/run-eval.js
  ```

  Expected: no validation errors, table printed, `eval/results.json` written.

- [ ] **Step 5: Copy the headline numbers into README.md**

  Find the "Evaluation framework" roadmap item in `README.md` and add a results line, e.g.:

  ```markdown
  - [x] Evaluation framework — Recall@5 and MRR across 4 retrieval strategies
        (BM25: 0.71 / Hybrid+Rerank: 0.92 on 23 Chinese healthcare queries)
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add eval/ground-truth.json README.md
  git commit -m "feat: label eval ground truth and add headline numbers to README"
  ```

---

## Quick Reference: Running the Eval

```bash
# Prerequisites
./bin/elasticsearch &           # port 9200
cd services/embedding-service && python main.py &   # port 8001
cd services/reranker-service  && python main.py &   # port 8002

# Seed (first time only)
cd node-backend && node scripts/seedDocs.js <username>
# → writes eval/seed-doc-ids.json

# Replace placeholders in eval/ground-truth.json, then label relevantChunks

# Run eval
cd node-backend && node ../eval/run-eval.js
```
