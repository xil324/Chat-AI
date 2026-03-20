# ReAct Loop & Citation Feature — Design Spec

**Date:** 2026-03-19
**Phase:** 4 (Agentic RAG — per healthcare-rag-spec.md)
**Status:** Approved for implementation

---

## Overview

Upgrade the RAG pipeline from single-pass retrieval to an agentic ReAct (Reason-Act-Observe) loop that self-corrects when retrieved context is insufficient, and returns structured citations the frontend can display as inline superscript popovers.

**Deviation from Phase 4 plan:** The original spec shows `AgenticRAGPipeline(ragPipeline, llmService, queryRewriter)`. Here, `queryRewriter` is extracted as a pre-step in `chatService.js` rather than injected into the pipeline. This simplifies the pipeline class and makes it easier to call the rewriter conditionally.

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
  → queryRewriter.rewrite(query, helper.history, sessionId)   [new]
  → agenticPipeline.query(userQuery, rewrittenQuery, docId)   [new]
      ├─ round 1..3:
      │   retrieveChunks(currentQuery, docId) → structured chunks
      │   deduplicate + merge → allChunks (cap 15)
      │   if allChunks empty after round 1 → return "no documents" response immediately
      │   LLM evaluate(userQuery, allChunks) → parsed JSON
      │   YES (sufficient) → { answer, citations, rounds, chunksUsed }
      │   NO  → currentQuery = refined_query → next round
      └─ max rounds hit → generateBestEffort(userQuery, allChunks)
  → helper.loadMessage('user', query)      [sync in-memory history]
  → helper.loadMessage('assistant', answer) [DO NOT call helper.generateResponse — would double-append]
  → persist messages with citations + rounds
  → { message: answer, citations, rounds }
```

### Non-document path (unchanged)
```
sendMessage
  → helper.generateResponse(question)   [appends to history automatically]
  → persist messages (no citations)
  → { message }
```

### `sendNewSession` path
`sendNewSession` always follows the non-document path regardless of document state. The session has no `attached_document_id` at creation time, so the agentic branch never fires here.

---

## New Files

### `node-backend/src/services/rag/queryRewriter.js`

Rewrites follow-up queries into standalone questions using session history.

**Logic:**
1. If `recentTurns` is empty → return query unchanged (first turn)
2. Try in-memory `helper.history` (pass from `chatService`)
3. If empty, load last 5 messages from MongoDB via `getMessagesBySessionId(sessionId)`
4. Call LLM, wrapping the prompt as a single-element messages array:
   ```js
   await llmModel.generateResponse([{ role: 'user', content: rewritePrompt }], null)
   ```
5. Return the trimmed string output (the rewritten query only)

> **Limitation (document in code):** In-memory history is lost on server restart. The DB fallback covers subsequent turns if messages were persisted, but this adds one extra DB read per agentic turn. A proper session hydration on startup (Phase 8) would eliminate this.

**Prompt:**
```
Given the conversation history below, rewrite the user's latest question as a standalone,
self-contained search query. Include all necessary context from the conversation.
If the query is already standalone, return it unchanged.
Output ONLY the rewritten query, nothing else.

Conversation history:
{recentTurns as role: content lines}

Latest question: {currentQuery}

Rewritten query:
```

### `node-backend/src/services/rag/agenticPipeline.js`

Implements the ReAct loop.

**Constructor:** `AgenticRAGPipeline(llmModel)` — takes a model instance (from `AIModelFactory`).

**`query(userQuery, rewrittenQuery, docId)`** → `{ answer, citations, rounds, chunksUsed, partial }`

**LLM call convention:** All LLM calls in this file use:
```js
await this.llmModel.generateResponse([{ role: 'user', content: prompt }], null)
```
Never call `.generate()` — that method does not exist on `ClaudeModel` or `OllamaModel`.

**Loop (max 3 rounds):**
1. `currentQuery` starts as `rewrittenQuery`
2. Call `retrieveChunks(currentQuery, docId)` → new chunks (see ragService section)
3. Merge into `allChunks`, deduplicating by `chunkId`, cap at 15 total
4. **If `allChunks` is empty after round 1** → return immediately:
   ```js
   { answer: "No relevant documents found.", citations: [], rounds: 1, chunksUsed: 0, partial: true }
   ```
5. Call `evaluate(userQuery, allChunks)`:
   - Build evaluation prompt numbering chunks `[1]`, `[2]`, ... in `allChunks` order
   - Pass the same `allChunks` array (do not mutate between `evaluate` and `mapCitations`)
   - Call LLM; parse result with `parseEvaluation()`
6. If `sufficient: true` → return `{ answer, citations: mapCitations(evaluation.citations, allChunks), rounds, chunksUsed: allChunks.length }`
7. If `sufficient: false` → `currentQuery = evaluation.refined_query`, continue loop
8. After max rounds → call `generateBestEffort(userQuery, allChunks)`

**`evaluate(userQuery, allChunks)`** — evaluation prompt (single LLM call):
```
Context from knowledge base:
[1] (Source: {title} - {source})
{content}

[2] (Source: ...)
...

User question: {userQuery}

Instructions:
1. Evaluate whether the provided context contains enough information to answer.
2. Answer in the same language as the user's question.
3. Only use information from the provided context.
4. Cite sources using [1], [2], etc. for every claim.
5. If information is insufficient, provide a refined search query.

Respond ONLY with valid JSON:
{
  "sufficient": true | false,
  "answer": "Your cited answer (only if sufficient)",
  "citations": [
    { "index": 1, "title": "...", "source": "..." }
  ],
  "refined_query": "Better search query (only if not sufficient)",
  "missing_info": "What information is missing (only if not sufficient)"
}
```

The caller (`query()`) must catch any exception thrown by the LLM call before passing the string output to `parseEvaluation`. If the LLM call throws, treat it as a failed round and continue (or short-circuit to best-effort on repeated failures).

**`parseEvaluation(llmOutputString)`** — receives a string (the LLM text response):
```js
function parseEvaluation(llmOutput) {
  try {
    const cleaned = llmOutput.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    return { sufficient: true, answer: llmOutput, citations: [], refined_query: null };
  }
}
```

**`mapCitations(citationIndices, allChunks)`** — maps citation indices back to chunk metadata.
`allChunks` must be the same array (same ordering) that was passed to `evaluate()`. Do not mutate `allChunks` between the two calls.
```js
citationIndices.map(c => ({
  index: c.index,
  title: allChunks[c.index - 1]?.title || 'Unknown',
  source: allChunks[c.index - 1]?.source || 'Unknown',
  url: allChunks[c.index - 1]?.url || null,
}))
```

Note: no `page` field — the ES index has no `page` mapping so it is omitted from citations.

**`generateBestEffort(userQuery, allChunks)`** — same prompt as `evaluate()` but with added instruction: "Answer with available information. If the answer is incomplete, clearly state what information could not be found." Returns `{ answer, citations, rounds: MAX_ROUNDS, partial: true }`.

---

## Modified Files

### `ragService.js`

Add `retrieveChunks(query, docId)`:

Same BM25+kNN+RRF+rerank logic as `retrieveContext()` with two changes:

**1. Expand `_source` projection in both ES queries:**
```js
_source: ['content', 'title', 'source', 'chunk_index']
```
These are **top-level fields** on the ES document (not nested under `metadata`).

**2. Preserve metadata through the reranker.** The reranker accepts text strings and returns `{ index, passage, score }[]` — it does not carry ES `_id` or metadata. Use a parallel metadata map:
```js
// Build parallel maps before reranking
const idToContent = {};
const idToMeta = {};   // NEW

bm25Response.hits.hits.forEach((hit, idx) => {
  idToContent[hit._id] = hit._source.content;
  idToMeta[hit._id] = {             // NEW
    title: hit._source.title || '',
    source: hit._source.source || '',
    url: null,                       // ES index has no url field yet
    chunkIndex: hit._source.chunk_index,
  };
  // ... RRF scoring
});
// same for kNN response

// Filter on idToContent only — ensures both arrays stay in sync.
// Independent .filter(Boolean) on each would desync if one map has a falsy entry the other doesn't.
const filteredIds   = topIds.filter(id => idToContent[id]);
const candidates    = filteredIds.map(id => idToContent[id]);
const candidateMeta = filteredIds.map(id => idToMeta[id]);   // parallel array, same indices

const reranked = await rerank(query, candidates, TOP_K);

// Re-attach metadata by original position index
return reranked.map(r => ({
  chunkId: topIds[r.index],         // r.index = position in candidates array
  content: r.passage,
  title: candidateMeta[r.index]?.title || '',
  source: candidateMeta[r.index]?.source || '',
  url: candidateMeta[r.index]?.url || null,
}));
```

> Note: Citation `url` will be `null` for all chunks until the ingestion pipeline is updated to store source URLs in the ES index.

**Keep `retrieveContext()` unchanged** — it calls `retrieveChunks` internally and joins content strings:
```js
export async function retrieveContext(query, documentId) {
  if (!esAvailable) return '';
  const chunks = await retrieveChunks(query, documentId);
  return chunks.map(c => c.content).join('\n\n---\n\n');
}
```

If ES is unavailable, `retrieveChunks` returns `[]`.

### `chatService.js` — `sendMessage()`

```js
export async function sendMessage(userName, sessionId, question, modelType) {
  const helper = aiHelperManager.getOrCreate(userName, sessionId, modelType);
  const session = await getSessionById(sessionId);

  if (session?.attached_document_id) {
    // Agentic path
    // IMPORTANT: do NOT call helper.generateResponse() here — it would double-append to history
    const rewrittenQuery = await queryRewriter.rewrite(question, helper.history, sessionId);

    const pipeline = new AgenticRAGPipeline(createAIModel(modelType));
    const result = await pipeline.query(question, rewrittenQuery, session.attached_document_id);

    // Sync in-memory history manually
    helper.loadMessage('user', question);
    helper.loadMessage('assistant', result.answer);

    await saveMessages(sessionId, userName, question, result.answer, result.citations, result.rounds);
    return { message: result.answer, citations: result.citations, rounds: result.rounds };
  }

  // Non-agentic path (unchanged)
  const reply = await helper.generateResponse(question);
  await saveMessages(sessionId, userName, question, reply);
  return { message: reply };
}
```

### `chatController.js`

No logic changes. `{ message, citations, rounds }` passes through from service to response automatically.

### `messageDao.js` — `getMessagesBySessionId()`

Update to return `citations` alongside existing fields. This ensures `getHistory` can serve citation data back to the frontend for session reload.

### `Message.js` (Mongoose schema)

Add optional fields:
```js
citations: { type: Array, default: [] },
rounds:    { type: Number, default: null },
```
Existing messages without these fields load fine (defaults apply).

### `chatService.js` — `getHistory()`

Update to return `citations` per message:
```js
return messages.map(m => ({ is_user: m.is_user, content: m.content, citations: m.citations || [] }));
```

### `saveMessages()` helper

Update signature to accept `citations` and `rounds`:
```js
async function saveMessages(sessionId, userName, userContent, aiContent, citations = [], rounds = null) {
  // user message: no citations, no rounds
  // assistant message: citations, rounds
}
```

---

## Frontend Changes

### `chatApi.js`

Map `citations` from send responses:
```js
// sendMessage response:
{ message: response.data.message, citations: response.data.citations || [] }

// getChatHistory response item:
{ role: item.is_user ? 'user' : 'assistant', content: item.content, citations: item.citations || [] }
```

### `AIChat.jsx`

**Message state shape** — add `citations` to all message objects (empty array for user messages):
```js
{ role: 'user' | 'assistant', content: string, citations: [] }
```

**Update both `currentMessages` and `sessions` map.** In `handleNormal`, when constructing `aiMessage`:
```js
const aiMessage = { role: 'assistant', content: response.data.message, citations: response.data.citations || [] }
```
Both `setCurrentMessages(...)` and the `sessions` map assignment must use this shape.

When loading history in `switchSession`, map `citations` through:
```js
const messages = response.data.history.map(item => ({
  role: item.is_user ? 'user' : 'assistant',
  content: item.content,
  citations: item.citations || [],
}))
```

**Citation rendering** — for assistant messages, replace the `dangerouslySetInnerHTML` block with a React renderer that parses `[N]` markers:

Split the answer text on `/\[(\d+)\]/g`. Render text segments interleaved with `<sup>` elements. Each `<sup>` is a button that opens an MUI `Popover` anchored to itself.

Per-message popover state: `const [citationAnchor, setCitationAnchor] = useState({ el: null, index: null })` — stored as component-level state (or in the message loop with a stable key).

Popover content (from `message.citations[index - 1]`):
- Document title
- Source agency
- URL as a clickable `<a>` link (only if `url` is non-null)

If `message.citations` is empty or `index` is out of range, render `[N]` as plain text (no popover).

---

## API Response Shape

### `POST /chat/send`
```json
{
  "message": "...",
  "citations": [
    { "index": 1, "title": "...", "source": "...", "url": null }
  ],
  "rounds": 1
}
```
For non-document sessions, `citations` and `rounds` are absent — the frontend defaults both to `[]` / `null`.

### `GET /chat/history` response item
```json
{ "is_user": false, "content": "...", "citations": [...] }
```

### `partial` flag
`partial: true` is returned by `agenticPipeline.query()` internally when best-effort mode fires, but is **not** threaded to the API response in this iteration. It is available for logging/debugging only. If a disclaimer UI is desired in future, add `partial` to the API response shape and handle it in the frontend at that time.

---

## Limitations & Notes

1. **In-memory history lost on restart** — query rewriter falls back to DB (one extra read per agentic turn). Acceptable for now; Phase 8 session hydration would eliminate this.
2. **`sendNewSession` always non-agentic** — agentic path only fires in `sendMessage` when a document is attached. First message of a new session never runs the ReAct loop.
3. **Citation URLs are `null`** — the ES index has no `url` field. Citations show title + source only until the ingestion pipeline stores source URLs.
4. **Token budget** — capped at 15 chunks across all rounds. With `claude-haiku-4-5`, this stays well within limits.
5. **`partial` flag** — not in API response this iteration. Internal only.

---

## Out of Scope

- Multi-tenant (`tenantId`) filtering — Phase 5
- Session TTL / MongoDB TTL index — Phase 8
- Streaming responses — future enhancement
- `sendNewSession` agentic path — future enhancement
- Citation URL display (requires ingestion pipeline update) — future enhancement