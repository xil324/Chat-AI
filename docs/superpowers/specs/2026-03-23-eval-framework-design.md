# RAG Evaluation Framework — Design Spec

**Date:** 2026-03-23
**Status:** Approved for implementation

---

## Overview

Add a retrieval evaluation framework that measures Recall@5 and MRR across four retrieval strategies: BM25-only, kNN-only, Hybrid (BM25+kNN via weighted RRF), and Hybrid+Rerank. The output is a comparison table with real numbers (e.g. "Hybrid+Rerank achieved 92% Recall@5 vs 71% for BM25-only") that demonstrates intentional measurement of the RAG pipeline.

---

## Decisions Made

| Question | Decision |
|---|---|
| Ground truth storage | JSON file committed to repo (`eval/ground-truth.json`) |
| Ground truth granularity | `{ docId, chunkIndex }` — chunk-level labels, stable across environments |
| Query set | 23 Chinese queries generated to cover BM25 vs kNN tradeoffs |
| Strategy implementation | Add 3 new variant functions to `ragService.js` (Option A) |
| Eval runner | Standalone Node.js script (`eval/run-eval.js`) |
| Output | Stdout comparison table + `eval/results.json` |

---

## File Layout

```
eval/
  ground-truth.json       ← 23 labeled queries
  run-eval.js             ← standalone eval script
  results.json            ← committed output artifact

node-backend/src/services/ragService.js
  + retrieveChunksBM25Only(query, documentId)
  + retrieveChunksKNNOnly(query, documentId)
  + retrieveChunksHybridOnly(query, documentId)
  retrieveChunks()                              ← unchanged (hybrid + rerank)
```

---

## Ground Truth Dataset

### Schema

```json
[
  {
    "id": "q01",
    "query": "我的孩子能申请CHIP吗",
    "queryType": "eligibility",
    "relevantChunks": [
      { "docId": "PLACEHOLDER_CHIP_DOC_ID", "chunkIndex": 3 },
      { "docId": "PLACEHOLDER_CHIP_DOC_ID", "chunkIndex": 4 }
    ]
  }
]
```

`docId` values are placeholders — replace with actual MongoDB IDs after running `node scripts/seedDocs.js`.

### Query Distribution (23 total)

| Type | Count | Retrieval Characteristic |
|---|---|---|
| `eligibility` | 6 | Paraphrased questions — favors kNN |
| `exact-term` | 6 | Regulatory terms / form numbers — favors BM25 |
| `procedure` | 6 | How-to questions — favors hybrid |
| `comparison` | 5 | Compare programs — favors hybrid |

### The 23 Queries

**eligibility (6)**
- q01: 我的孩子能申请CHIP吗
- q02: 低收入家庭可以申请医疗补助吗
- q03: 没有工作的人可以参加Medicaid吗
- q04: 移民儿童有资格申请CHIP吗
- q05: 怀孕期间可以申请Medicaid吗
- q06: 残疾人能享受哪些医疗保障

**exact-term (6)**
- q07: CHIP 申请表 H1205 如何填写
- q08: ACA 保费税收抵免 premium tax credit 计算方式
- q09: Medicaid STAR 计划覆盖哪些服务
- q10: TDI 投诉表格 FIN546 提交流程
- q11: 联邦贫困线 FPL 200% 对应的收入是多少
- q12: CHIP Perinate 计划的申请条件

**procedure (6)**
- q13: 如何申诉保险公司拒赔决定
- q14: 怎么更换我的Medicaid主治医生
- q15: 如何申请ACA市场保险的特殊注册期
- q16: 保险公司拒绝理赔后我该怎么办
- q17: 如何查看我的医疗补助申请状态
- q18: 怎么续保德克萨斯州儿童健康保险

**comparison (5)**
- q19: Medicaid 和 CHIP 的区别是什么
- q20: ACA 市场保险和 Medicaid 哪个更适合我
- q21: CHIP 和私人保险的覆盖范围有什么不同
- q22: 德克萨斯州 Medicaid 和联邦 Medicaid 有什么区别
- q23: 保费补贴和成本分担补贴的区别

---

## Retrieval Strategy Variants

Three new exported functions added to `node-backend/src/services/ragService.js`:

### `retrieveChunksBM25Only(query, documentId)`
- Translate Chinese query to English
- Run BM25 `multi_match` search only
- Return top-5 by BM25 score (no fusion, no reranker)

### `retrieveChunksKNNOnly(query, documentId)`
- Embed original query (no translation)
- Run kNN vector search only
- Return top-5 by cosine similarity (no fusion, no reranker)

### `retrieveChunksHybridOnly(query, documentId)`
- Run BM25 + kNN in parallel (same as existing `retrieveChunks`)
- Apply weighted RRF fusion (semantic: 0.6, fulltext: 0.4)
- Return top-5 — **no reranker**

### `retrieveChunks(query, documentId)` — unchanged
- Hybrid RRF → cross-encoder reranker → top-5

All four functions return: `{ chunkId, content, chunkIndex, title, source, url }[]`

---

## Eval Runner (`eval/run-eval.js`)

### Algorithm

```
1. Load eval/ground-truth.json
2. Init ES client; validate that all docIds in ground truth exist in the index
3. For each strategy in [bm25, knn, hybrid, hybrid+rerank]:
     recallHits = 0, reciprocalRankSum = 0
     For each query q in ground-truth:
       results = strategy(q.query, docId)   // top-5 chunks
       For rank 1..5:
         if results[rank].chunkIndex ∈ q.relevantChunks[].chunkIndex
           AND results[rank].docId matches:
             recallHits += 1
             reciprocalRankSum += 1 / rank
             break   // only score first hit
     Recall@5 = recallHits / 23
     MRR      = reciprocalRankSum / 23
4. Print comparison table to stdout
5. Write eval/results.json
```

### Output Table (example)

```
Strategy          Recall@5    MRR
──────────────────────────────────
BM25 only          0.71       0.58
kNN only           0.74       0.61
Hybrid             0.83       0.70
Hybrid + Rerank    0.92       0.81
```

### `eval/results.json` Schema

```json
{
  "runAt": "2026-03-23T10:00:00Z",
  "totalQueries": 23,
  "strategies": {
    "bm25": { "recall5": 0.71, "mrr": 0.58 },
    "knn":  { "recall5": 0.74, "mrr": 0.61 },
    "hybrid": { "recall5": 0.83, "mrr": 0.70 },
    "hybrid+rerank": { "recall5": 0.92, "mrr": 0.81 }
  }
}
```

---

## Metrics Definitions

**Recall@5:** Fraction of queries where at least one relevant chunk appeared in the top-5 results. Binary per query — position within top-5 does not matter.

**MRR (Mean Reciprocal Rank):** Mean of `1/rank` of the first relevant chunk across all queries. Rewards systems that surface relevant chunks near the top. Score of 0 if no relevant chunk in top-5.

| First hit at rank | MRR contribution |
|---|---|
| 1 | 1.00 |
| 2 | 0.50 |
| 3 | 0.33 |
| 4 | 0.25 |
| 5 | 0.20 |
| not found | 0.00 |

---

## Prerequisites for Running

1. Elasticsearch running with seeded documents (`node scripts/seedDocs.js <username>`)
2. Embedding service running (port 8001)
3. Reranker service running (port 8002)
4. `eval/ground-truth.json` docId placeholders replaced with real IDs
5. `node eval/run-eval.js` from the project root

---

## Out of Scope

- Frontend visualization of eval results
- Automated CI eval runs
- Evaluating answer quality (LLM-as-judge) — this spec covers retrieval only
