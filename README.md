# Chat-AI Platform (Node.js + React)

## Overview

**Chat-AI** (Sixi AI) is a full-stack AI chat platform with user authentication, multi-session conversations, document Q&A via RAG, and support for both cloud (Claude) and local (Ollama) LLMs.

**Repository:** [https://github.com/xil324/Chat-AI](https://github.com/xil324/Chat-AI)

---

## Tech Stack

| Component | Technology |
| :--- | :--- |
| **Frontend** | React 18 + Vite + MUI |
| **Backend** | Node.js + Express |
| **Database** | MongoDB |
| **Cache** | Redis |
| **AI / LLM** | Claude (Anthropic) / Ollama |
| **RAG** | Elasticsearch 8 (hybrid BM25 + kNN + RRF) |
| **Embeddings** | `all-MiniLM-L6-v2` via `@xenova/transformers` |

---

## Features

- **User Authentication** — Registration with email verification (captcha via Redis), JWT-based login
- **AI Chat** — Multi-session conversations with Claude or local Ollama models; history persists in MongoDB
- **Document Q&A (RAG)** — Upload PDFs, attach them to a chat session, and ask questions with relevant context retrieved via hybrid search
- **Dark UI** — Minimal black-themed interface with differentiated user (blue) and AI (green) message bubbles

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
```

The `AIHelperManager` holds per-user, per-session conversation history in memory. On startup it is hydrated from MongoDB so history survives restarts.

### AI Factory Pattern

`node-backend/src/utils/aihelper/` implements a factory for multiple LLM backends:
- Model type `"2"` → Ollama
- Model type `"3"` → Claude (default: `claude-haiku-4-5-20251001`)

To add a new provider: implement a class with `generateResponse(history)`, register it in [AIModelFactory.js](node-backend/src/utils/aihelper/AIModelFactory.js).

### RAG Pipeline

1. **Upload** — PDF is parsed, split into overlapping chunks, embedded with `all-MiniLM-L6-v2`, and bulk-indexed into Elasticsearch
2. **Attach** — User attaches a document to a chat session (stored in MongoDB session record)
3. **Retrieve** — On each message, `ragService.retrieveContext()` runs hybrid BM25 + kNN search and fuses results with RRF
4. **Augment** — Top-K chunks are injected as a system prompt into the LLM call

Elasticsearch is optional — if unavailable at startup, RAG is silently disabled and chat works without document context.

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- MongoDB, Redis running locally
- Claude API key (from [console.anthropic.com](https://console.anthropic.com))
- Elasticsearch 8 (optional, for document Q&A)

### Install services (macOS)

```bash
brew install mongodb-community@4.4 redis
brew services start mongodb-community@4.4
brew services start redis
```

### Elasticsearch (optional)

Download Elasticsearch 8 and start it locally:

```bash
# Download from https://www.elastic.co/downloads/elasticsearch
tar -xzf elasticsearch-8.x.x-darwin-aarch64.tar.gz
cd elasticsearch-8.x.x
./bin/elasticsearch
```

> **Note:** Elasticsearch requires free disk space. If your disk is above 90% full, shard allocation will be blocked. Either free up space or temporarily disable the threshold:
> ```bash
> curl -X PUT "http://localhost:9200/_cluster/settings" \
>   -H "Content-Type: application/json" \
>   -d '{"transient":{"cluster.routing.allocation.disk.threshold_enabled":false}}'
> ```

### Backend Setup

```bash
cd node-backend
npm install
cp .env.example .env
# Edit .env and add your CLAUDE_API_KEY
node index.js
```

### Frontend Setup

```bash
cd react-frontend
npm install
npm run dev   # http://localhost:8080
```

### Environment Variables

See [node-backend/.env.example](node-backend/.env.example) for all options.

```env
# Required for Claude chat
CLAUDE_API_KEY=your-claude-api-key
CLAUDE_MODEL=claude-haiku-4-5-20251001

# Optional: local Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL_NAME=llama3

# Optional: Elasticsearch RAG
ELASTICSEARCH_URL=http://localhost:9200

# Optional: email (captcha logs to console if not set)
EMAIL_ADDRESS=your@email.com
EMAIL_APP_PASSWORD=your-app-password
```

---

## API Routes

All routes prefixed `/api/v1/`. Frontend proxies `/api/*` → `/api/v1/*`.

### User (no auth)
| Method | Path | Description |
|---|---|---|
| POST | `/user/login` | Returns `{ token }` |
| POST | `/user/register` | Email + captcha + password → `{ token }` |
| POST | `/user/captcha` | Sends 6-digit code to email (2min TTL) |

### Chat (JWT required)
| Method | Path | Description |
|---|---|---|
| GET | `/chat/sessions` | List user's sessions |
| POST | `/chat/send-new-session` | New session → `{ sessionId, message }` |
| POST | `/chat/send` | Continue session → `{ message }` |
| POST | `/chat/history` | Session message history |

### Document (JWT required)
| Method | Path | Description |
|---|---|---|
| GET | `/document/list` | List uploaded documents |
| POST | `/document/upload` | Upload PDF → `{ id, filename }` |
| DELETE | `/document/:id` | Delete document + ES chunks |
| POST | `/document/attach` | Attach document to session |
| POST | `/document/detach` | Detach document from session |
