# Chat-AI Platform (Node.js + React)

## Overview

**Chat-AI** is a full-stack AI chat platform with user authentication, intelligent conversation via Claude, local image recognition, and an optional Ollama integration for local LLMs.

**Repository:** [https://github.com/xil324/Chat-AI](https://github.com/xil324/Chat-AI)

---

## Tech Stack

| Component | Technology |
| :--- | :--- |
| **Frontend** | React 18 + Vite |
| **Backend** | Node.js + Express |
| **Database** | MongoDB |
| **Cache** | Redis |
| **AI / LLM** | Claude (Anthropic) / Ollama |
| **Inference** | ONNX Runtime (MobileNetV2) |

---

## Features

- **User Authentication** — Registration with email verification (captcha via Redis), JWT-based login
- **AI Chat** — Multi-session conversations with Claude or local Ollama models; history persists in MongoDB
- **Image Recognition** — Local MobileNetV2 ONNX model for ImageNet classification (optional)

---

## System Architecture

```
Client (React, port 8080)
  ↓ Vite proxy: /api/* → http://localhost:9090/api/v1/*
Express Server (port 9090)
  /api/v1/user/*   — auth (no JWT)
  /api/v1/chat/*   — AI chat (JWT required)
  /api/v1/image/*  — image recognition (JWT required)
  ↓
Services → DAOs → MongoDB
         → Redis (captcha TTL cache)
         → AIHelperManager (in-memory session history)
            → ClaudeModel (@anthropic-ai/sdk)
            → OllamaModel (HTTP)
```

The `AIHelperManager` holds per-user, per-session conversation history in memory. On startup it is hydrated from MongoDB so history survives restarts.

### AI Factory Pattern

`node-backend/src/utils/aihelper/` implements a factory for multiple LLM backends:
- Model type `"2"` → Ollama
- Model type `"3"` → Claude

To add a new provider: implement a class with `generateResponse(history)`, register it in [AIModelFactory.js](node-backend/src/utils/aihelper/AIModelFactory.js).

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- MongoDB, Redis running locally
- Claude API key (from [console.anthropic.com](https://console.anthropic.com))

### Install services (macOS)

```bash
brew install mongodb-community@4.4 redis
brew services start mongodb-community@4.4
brew services start redis
```

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

See [node-backend/.env.example](node-backend/.env.example) for all options. Required for chat:

```env
CLAUDE_API_KEY=your-claude-api-key
CLAUDE_MODEL=claude-sonnet-4-5
```

Image recognition is disabled unless `IMAGE_MODEL_PATH` and `IMAGE_LABEL_PATH` are set.

Email is optional in development — captcha codes are printed to the server console if not configured.

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

### Image (JWT required)
| Method | Path | Description |
|---|---|---|
| POST | `/image/recognize` | Multipart image → `{ class_name }` |
