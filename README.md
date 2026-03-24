# Multilingual Healthcare Regulatory Assistant

## Overview

A RAG-powered platform for navigating U.S. healthcare policy, insurance regulations, and benefits documentation. Users can ask questions in Chinese or English and receive answers grounded in official regulatory documents — Medicare, Medicaid, CHIP, ACA marketplace guides, and Texas Department of Insurance resources.

**Repository:** [https://github.com/xil324/Chat-AI](https://github.com/xil324/Chat-AI)

---

## Key Engineering Decisions

- **Cross-lingual search** — Chinese queries are translated to English before BM25 retrieval, while the original Chinese query drives semantic (kNN) search. Both results are fused via weighted RRF, so a user asking "我的孩子能申请CHIP吗" correctly retrieves English regulatory documents.
- **Two-stage retrieval** — Hybrid BM25 + kNN fusion (weighted RRF) followed by cross-encoder reranking. BM25 captures exact regulatory terms and form numbers; kNN captures paraphrased questions; the reranker scores query-passage pairs jointly for final precision.
- **Agentic RAG with query rewriting** — Follow-up questions ("what about that regulation?") are rewritten into standalone queries using conversation history before retrieval. If the first retrieval round is insufficient, the LLM proposes a refined query and the pipeline retries (up to 3 rounds), accumulating and deduplicating chunks across rounds before generating a cited answer.
- **LLM Factory pattern** — Swappable LLM backends (Claude / Ollama) via a factory, so the system is not locked to a single provider.

---

## Tech Stack

| Component      | Technology                                                    |
| :------------- | :------------------------------------------------------------ |
| **Frontend**   | React 18 + Vite + MUI                                         |
| **Backend**    | Node.js + Express                                             |
| **Database**   | MongoDB                                                       |
| **Cache**      | Redis                                                         |
| **AI / LLM**   | Claude (Anthropic) / Ollama (swappable via factory)           |
| **RAG**        | Elasticsearch 8 (hybrid BM25 + kNN + RRF)                     |
| **Embeddings** | `paraphrase-multilingual-MiniLM-L12-v2` (Python microservice) |
| **Reranker**   | `cross-encoder/ms-marco-MiniLM-L-6-v2` (Python microservice)  |
| **i18n**       | react-i18next — bilingual UI (Chinese / English)              |

---

## Features

- **Multilingual Q&A** — Ask in Chinese or English; cross-lingual retrieval finds relevant content across language boundaries
- **Document RAG** — Upload PDFs (insurance policies, denial letters, regulatory guides), attach to a session, retrieve relevant context via hybrid search
- **Agentic RAG** — When a document is attached, a ReAct-style pipeline iteratively refines the search query (up to 3 rounds) until the LLM deems the retrieved context sufficient, returning a cited answer
- **Two-stage retrieval** — Hybrid BM25 + kNN fusion (weighted RRF) → cross-encoder reranking → top-5 context chunks
- **Bilingual UI** — Full Chinese/English interface with persistent language toggle
- **User Authentication** — Email verification (captcha via Redis TTL), JWT-based sessions
- **Multi-session conversations** — History persists in MongoDB; hydrated into memory on startup

---

## System Architecture

```
Client (React, port 8080)
  ↓ Vite proxy: /api/* → http://localhost:9090/api/v1/*
Express Server (port 9090)
  /api/v1/user/*     — auth (no JWT)
  /api/v1/chat/*     — AI chat (JWT required)
  /api/v1/document/* — PDF upload & management (JWT required)
  ↓
Services → DAOs → MongoDB
         → Redis (captcha TTL cache)
         → Elasticsearch (chunk storage + hybrid search)
         → AIHelperManager (in-memory session history)
            → ClaudeModel (@anthropic-ai/sdk)
            → OllamaModel (HTTP)

Python Microservices (services/)
  Embedding Service (port 8001) — multilingual sentence embeddings
  Reranker Service  (port 8002) — cross-encoder reranking
```

### RAG Pipeline

1. **Upload** — PDF parsed → overlapping chunks → language detection per chunk → embedded via Python service → bulk-indexed into Elasticsearch with metadata (title, source, category, language)
2. **Attach** — User attaches a document to a chat session
3. **Query rewrite** — Follow-up questions are rewritten into standalone queries using the last 10 turns of conversation history (in-memory, with DB fallback after server restart). First-turn queries pass through unchanged.
4. **Agentic retrieval loop** (up to 3 rounds):
   - Detect query language; if Chinese, translate to English for BM25 coverage
   - Run BM25 + kNN in parallel; fuse with weighted RRF (semantic: 0.6, fulltext: 0.4)
   - Rerank top-20 candidates via cross-encoder → top-5 chunks
   - LLM evaluates whether chunks are sufficient; if not, proposes a refined query for the next round
   - Chunks are deduplicated and accumulated across rounds (capped at 15)
5. **Answer** — LLM generates a cited answer from accumulated chunks; response is flagged `partial: true` if the loop exhausted all rounds without full confidence

Elasticsearch is optional — if unavailable at startup, RAG is silently disabled and chat continues without document context.

### AI Factory Pattern

`node-backend/src/utils/aihelper/` implements a factory for multiple LLM backends:

- Model type `"2"` → Ollama
- Model type `"3"` → Claude (default: `claude-haiku-4-5-20251001`)

To add a new provider: implement a class with `generateResponse(history, systemPrompt)`, register it in `AIModelFactory.js`.

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- MongoDB, Redis running locally
- Claude API key (from [console.anthropic.com](https://console.anthropic.com))
- Elasticsearch 8 (for document Q&A)
- Python 3.9+ with `sentence-transformers` (for embedding/reranker microservices)

### Install services (macOS)

```bash
brew install mongodb-community redis
brew services start mongodb-community
brew services start redis
```

### Python Microservices

```bash
# Embedding service (port 8001)
cd services/embedding-service
pip install -r requirements.txt
python main.py

# Reranker service (port 8002)
cd services/reranker-service
pip install -r requirements.txt
python main.py
```

### Elasticsearch

```bash
tar -xzf elasticsearch-8.x.x-darwin-aarch64.tar.gz
# Disable security for local dev in config/elasticsearch.yml:
#   xpack.security.enabled: false
./bin/elasticsearch
```

> **Note:** ES blocks shard allocation when disk usage exceeds 90%. Temporarily disable the threshold if needed:
>
> ```bash
> curl -X PUT "http://localhost:9200/_cluster/settings" -H "Content-Type: application/json" -d @es-settings.json
> ```

### Backend

```bash
cd node-backend
npm install
cp .env.example .env   # add CLAUDE_API_KEY
node index.js
```

### Frontend

```bash
cd react-frontend
npm install
npm run dev   # http://localhost:8080
```

### Seed Sample Documents

```bash
cd node-backend
node scripts/seedDocs.js <your-username>
```

Inserts 4 sample Texas healthcare documents (CHIP, Medicaid, TDI complaints, ACA tax credits) directly into MongoDB + Elasticsearch for testing without needing real PDF uploads.

### Environment Variables

```env
# Required
CLAUDE_API_KEY=your-claude-api-key
CLAUDE_MODEL=claude-haiku-4-5-20251001

# Optional: local Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL_NAME=llama3

# Optional: Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200

# Optional: Python microservices
EMBEDDING_SERVICE_URL=http://localhost:8001
RERANKER_SERVICE_URL=http://localhost:8002

# Optional: email captcha
EMAIL_ADDRESS=your@email.com
EMAIL_APP_PASSWORD=your-app-password
```

---

## API Routes

All routes prefixed `/api/v1/`. Frontend proxies `/api/*` → `/api/v1/*`.

### User (no auth)

| Method | Path             | Description                              |
| ------ | ---------------- | ---------------------------------------- |
| POST   | `/user/login`    | Returns `{ token }`                      |
| POST   | `/user/register` | Email + captcha + password → `{ token }` |
| POST   | `/user/captcha`  | Sends 6-digit code to email (2min TTL)   |

### Chat (JWT required)

| Method | Path                     | Description                            |
| ------ | ------------------------ | -------------------------------------- |
| GET    | `/chat/sessions`         | List user's sessions                   |
| POST   | `/chat/send-new-session` | New session → `{ sessionId, message }` |
| POST   | `/chat/send`             | Continue session → `{ message }`       |
| POST   | `/chat/history`          | Session message history                |

### Document (JWT required)

| Method | Path               | Description                     |
| ------ | ------------------ | ------------------------------- |
| GET    | `/document/list`   | List uploaded documents         |
| POST   | `/document/upload` | Upload PDF → `{ id, filename }` |
| DELETE | `/document/:id`    | Delete document + ES chunks     |
| POST   | `/document/attach` | Attach document to session      |
| POST   | `/document/detach` | Detach document from session    |

---

## Roadmap

- [x] Citation/source attribution — answer includes `citations` array with title, source, and chunk index for each referenced chunk
- [x] Query rewriting — follow-up questions rewritten into standalone queries using conversation history (in-memory + DB fallback); first-turn queries pass through unchanged
- [x] Agentic RAG — ReAct-style retrieval loop refines the search query across up to 3 rounds; accumulated chunks capped at 15; best-effort answer on exhaustion
- [ ] Multi-tenant isolation — separate knowledge bases per organization with role-based access
- [x] Evaluation framework — Recall@5 and MRR across 4 retrieval strategies on 23 labeled Chinese healthcare queries (4 documents, ~12–16 chunks each; 56 total chunks)
  | Strategy | Recall@5 | MRR |
  |---|---|---|
  | BM25 only | 0.91 | 0.65 |
  | kNN only | 0.83 | 0.65 |
  | Hybrid (BM25+kNN) | 0.91 | 0.65 |
  | **Hybrid + Rerank** | **0.96** | **0.84** |

  Recall@5 measures whether any relevant chunk appears in the top-5 results (out of 12–16 per document); MRR measures rank of the first relevant chunk. Hybrid + Rerank leads in both metrics — the reranker's cross-lingual penalty was eliminated by translating Chinese queries to English before reranking (the translated query was already computed for BM25, so no extra latency). MRR jump from 0.65 → 0.84 shows the reranker dramatically improves ranking quality once given an English query. BM25 and Hybrid tie on Recall@5 because keyword overlap is strong for regulatory terms; kNN underperforms slightly on Recall@5 because multilingual embeddings cluster some queries at lower recall positions.
