# ReAct Loop & Citation Feature — Design Spec

**Date:** 2026-03-19
**Phase:** 4 (Agentic RAG — per healthcare-rag-spec.md)
**Status:** Approved for implementation

---

## Overview

Upgrade the RAG pipeline from single-pass retrieval to an agentic ReAct (Reason-Act-Observe) loop that self-corrects when retrieved context is insufficient, and returns structured citations the frontend can display as inline superscript popovers.

---


## Decisions Made

| Question | Decision |
|---|---|
| When does the agentic loop activate? | Only when a document is attached to the session |
| Session history for query rewriter | Hybrid: in-memory first, fall back to DB if empty |
| Citation UI | Inline `[N]` superscripts with MUI Popover on click |
| Non-document sessions | Unchanged — go through existing `AIHelper.generateResponse()` |

---

## Data Flow

### Current (single-pass)
```
sendMessage
  → retrieveContext(query, docId) → string
  → helper.generateResponse(question, contextString)
  → { message: string }
```

### New (agentic, when doc attached)
```
sendMessage
  → queryRewriter.rewrite(query, sessionHistory)         [new]
  → agenticPipeline.query(rewrittenQuery, docId)         [new]
      ├─ round 1..3:
      │   retrieveChunks() → structured chunks
      │   LLM evaluate (JSON) → sufficient?
      │   YES → { answer, citations, rounds, chunksUsed }
      │   NO  → refined_query → next round
      └─ best-effort answer if max rounds hit
  → helper.loadMessage(user), helper.loadMessage(assistant)   [history sync]
  → { message, citations, rounds }
```

### Non-document path (unchanged)
```
sendMessage
  → helper.generateResponse(question)
  → { message }
```

---

## New Files

### `node-backend/src/services/rag/queryRewriter.js`

Rewrites follow-up queries into standalone questions using session history.

**Logic:**
1. If `recentTurns` is empty → return query unchanged (first turn, no rewriting needed)
2. Try in-memory `helper.history` first
3. If empty, load last 5 messages from MongoDB (`messageDao.getMessagesBySessionId`)
4. Call LLM with conversation history + current query → output is the rewritten query only

**Limitation note (in code):** In-memory history is lost on server restart. After restart, the DB fallback covers it, but only if messages were persisted. First turn after restart always works; follow-ups work if messages were saved to DB.

**Prompt:**
```
Given the conversation history, rewrite the user's latest question as a standalone,
self-contained search query. Include all necessary context. If already standalone,
return it unchanged. Output ONLY the rewritten query.
```

### `node-backend/src/services/rag/agenticPipeline.js`

Implements the ReAct loop.

**Class: `AgenticRAGPipeline`**
- Constructor: `(llmModel, ragRetrieveFn)` — takes a model instance and the `retrieveChunks` function
- `query(userQuery, rewrittenQuery, docId)` → `{ answer, citations, rounds, chunksUsed, partial }`

**Loop (max 3 rounds):**
1. Call `retrieveChunks(currentQuery, docId)` → new chunks
2. Merge + deduplicate by `chunkId`, cap at 15 total
3. Call `evaluate(userQuery, allChunks)` → parsed JSON
4. If `sufficient: true` → return `{ answer, citations: mapCitations(citations, allChunks), rounds, chunksUsed }`
5. If `sufficient: false` → set `currentQuery = refined_query`, continue loop
6. After max rounds → call `generateBestEffort(userQuery, allChunks)` with disclaimer instruction

**`evaluate()` prompt** (single LLM call):
```
Context chunks: [1] (Source: title - agency)\ncontent\n\n[2]...

User question: {userQuery}

Instructions:
1. Evaluate whether context is sufficient to answer.
2. Answer in the same language as the user's question.
3. Only use provided context. Cite with [N] for every claim.
4. If insufficient, provide a refined search query.

Respond ONLY with valid JSON:
{
  "sufficient": true|false,
  "answer": "...",
  "citations": [{ "index": 1, "title": "...", "source": "..." }],
  "refined_query": "...",
  "missing_info": "..."
}
```

**`parseEvaluation(llmOutput)`** — strips markdown fences, `JSON.parse`. On failure → `{ sufficient: true, answer: llmOutput, citations: [] }`.

**`mapCitations(citationIndices, chunks)`** — maps citation index back to chunk metadata:
```js
{ index, title, source, url, page }
```

---

## Modified Files

### `ragService.js`

Add `retrieveChunks(query, docId)` — same BM25+kNN+RRF+rerank logic as `retrieveContext()`, but returns:
```js
[{ chunkId: hit._id, content, metadata: { title, source, url, chunkIndex } }]
```

Keep `retrieveContext()` unchanged (internally call `retrieveChunks` and join content strings).

### `chatService.js` — `sendMessage()`

```
if session has attached_document_id:
  rewrittenQuery = queryRewriter.rewrite(query, helper.history, sessionId)
  result = agenticPipeline.query(query, rewrittenQuery, docId)
  helper.loadMessage('user', query)
  helper.loadMessage('assistant', result.answer)
  persist messages with citations + rounds fields
  return { message: result.answer, citations: result.citations, rounds: result.rounds }
else:
  reply = helper.generateResponse(question)
  persist messages (no citations)
  return { message: reply }
```

### `chatController.js`

No logic changes. Pass `{ message, citations, rounds }` through from service to response.

### `Message.js` (Mongoose schema)

Add optional fields:
```js
citations: { type: Array, default: [] }
rounds: { type: Number, default: null }
```
Existing messages without these fields load fine (defaults apply).

### `messageDao.js`

Update `createMessage()` to accept and persist `citations` and `rounds`.

---

## Frontend Changes

### `AIChat.jsx`

**Message state shape change:**
```js
{ role, content, citations: [] }  // citations populated for assistant messages
```

**Citation rendering — replace `dangerouslySetInnerHTML` block for assistant messages:**

Parse `[N]` markers in `content`. Render as React nodes: text segments interleaved with `<sup>` elements. Each `<sup>` opens an MUI `Popover` on click showing:
- Document title
- Source agency
- URL (as clickable link if present)

**Implementation approach:**
- Split answer text on `/\[(\d+)\]/g`
- For each match, render a styled `<sup>[N]</sup>` button
- `Popover` anchor state: `{ anchorEl, citationIndex }` per message
- Popover content pulled from `message.citations[index - 1]`

### `chatApi.js`

Map `response.data.citations` (default `[]`) alongside `message` when processing `sendMessage` and `sendNewSession` responses.

---

## API Response Shape Change

`POST /chat/send` response changes from:
```json
{ "message": "..." }
```
to:
```json
{
  "message": "...",
  "citations": [
    { "index": 1, "title": "...", "source": "...", "url": "..." }
  ],
  "rounds": 1
}
```
`citations` and `rounds` are absent (or `[]`/`null`) for non-document sessions — frontend should handle both shapes.

---

## Limitations & Notes

1. **In-memory history lost on restart** — query rewriter falls back to DB, but this adds one extra DB read per agentic turn. Acceptable for now; a proper session hydration on startup (Phase 8) would eliminate this.
2. **`sendNewSession` path** — the first message of a new session goes through `sendNewSession()` which currently bypasses RAG entirely. Agentic RAG for new sessions is out of scope here; the document must be attached to an existing session before the agentic path fires.
3. **Citation URLs** — current ES index does not store a `url` field. Citations will show title + source but URL will be `null` until the ingestion pipeline is updated to store source URLs.
4. **Token budget** — capped at 15 chunks across all rounds. Each evaluation call consumes both the chunk tokens and the JSON response tokens. With `claude-haiku-4-5`, this stays well within limits.

---

## Out of Scope

- Multi-tenant (`tenantId`) filtering — Phase 5
- Session TTL / MongoDB TTL index — Phase 8
- Streaming responses — future enhancement
- `sendNewSession` agentic path — future enhancement