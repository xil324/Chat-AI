# Multilingual Healthcare Regulatory Assistant

## Overview

A RAG-powered platform for navigating U.S. healthcare policy, insurance regulations, and benefits documentation. Users can ask questions in Chinese or English and receive answers grounded in official regulatory documents — Medicare, Medicaid, CHIP, ACA marketplace guides, and Texas Department of Insurance resources.

**Repository:** [https://github.com/xil324/Chat-AI](https://github.com/xil324/Chat-AI)

---

## Key Engineering Decisions

- **Cross-lingual search** — Chinese queries are translated to English before BM25 retrieval, while the original Chinese query drives semantic (kNN) search. Both results are fused via weighted RRF, so a user asking "我的孩子能申请CHIP吗" correctly retrieves English regulatory documents.
- **Two-stage retrieval** — Hybrid BM25 + kNN fusion (weighted RRF) followed by cross-encoder reranking. BM25 captures exact regulatory terms and form numbers; kNN captures paraphrased questions; the reranker scores query-passage pairs jointly for final precision.
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
3. **Retrieve** — On each message:
   - Detect query language
   - If Chinese: translate to English for cross-lingual BM25 coverage
   - Run BM25 + kNN in parallel; fuse with weighted RRF (semantic: 0.6, fulltext: 0.4)
4. **Rerank** — Top-20 candidates passed to cross-encoder reranker → top-5 returned
5. **Augment** — Top-5 chunks injected as system prompt context into the LLM call

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

- [ ] Citation/source attribution — surface which document chunks grounded each answer
- [ ] Multi-tenant isolation — separate knowledge bases per organization with role-based access
- [ ] Query rewriting — rewrite follow-up questions into standalone queries using conversation history
- [ ] Evaluation framework — Recall@K, MRR metrics against a labeled healthcare Q&A dataset
