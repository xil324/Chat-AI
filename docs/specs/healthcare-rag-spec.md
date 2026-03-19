# Multilingual Healthcare Regulatory Assistant — Project Spec

## Project Vision

A RAG-powered platform that helps non-English-speaking users (primarily Chinese speakers) navigate U.S. healthcare policy, insurance regulations, and benefits documentation. Users can ask questions in Chinese and receive accurate, cited answers grounded in official regulatory documents.

---

## Architecture Overview

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  React UI   │────▶│  Node.js/Express │────▶│  LLM Service Layer  │
│ (Bilingual)  │     │   API Gateway     │     │  (Factory Pattern)  │
└─────────────┘     └──────┬───────────┘     └─────────┬───────────┘
                           │                           │
                    ┌──────▼───────────┐       ┌───────▼──────────┐
                    │  Auth & Session   │       │  RAG Pipeline    │
                    │  JWT + Redis      │       │                  │
                    └──────────────────┘       │  1. Query Proc   │
                                               │  2. Hybrid Search│
                                               │  3. Rerank       │
                                               │  4. Generate     │
                                               │  5. Cite Sources │
                                               └───────┬──────────┘
                                                       │
                                          ┌────────────▼────────────┐
                                          │    Elasticsearch        │
                                          │  ┌──────┐ ┌──────────┐ │
                                          │  │Vector│ │Full-Text  │ │
                                          │  │Index │ │Inv. Index │ │
                                          │  └──────┘ └──────────┘ │
                                          └────────────┬────────────┘
                                                       │
                                          ┌────────────▼────────────┐
                                          │      MongoDB            │
                                          │  Users, Tenants, Docs   │
                                          │  Chat History, Metadata │
                                          └─────────────────────────┘
```

---

## Tech Stack

| Layer         | Technology                                  | Purpose                                           |
| ------------- | ------------------------------------------- | ------------------------------------------------- |
| Frontend      | React                                       | Bilingual UI (Chinese/English)                    |
| API Server    | Node.js + Express                           | Main application server, routing, middleware      |
| Auth          | JWT + Redis                                 | Token-based auth, session caching                 |
| Database      | MongoDB                                     | Users, tenants, chat history, document metadata   |
| Search/Vector | Elasticsearch                               | Hybrid retrieval (full-text + vector)             |
| Embedding     | Python microservice (sentence-transformers) | Local embedding model, no external API dependency |
| Reranker      | Python microservice (cross-encoder)         | Second-pass result ranking                        |
| LLM           | Claude / Ollama (swappable via Factory)     | Response generation                               |

---

## Phase 1: Foundation (Current State → Baseline)

**Goal:** Refactor your existing Chat-AI platform to establish the healthcare domain and clean architecture.

### 1.1 Project Structure Refactor

```
/server
  /src
    /routes          # Express route handlers
    /middleware       # Auth, rate limiting, error handling
    /services
      /llm           # Factory pattern for LLM providers
      /rag           # RAG pipeline orchestrator
      /embedding     # Embedding service client
      /reranker      # Reranker service client
    /models          # MongoDB schemas (User, Tenant, Document, ChatHistory)
    /config          # Environment configs
  /tests
/client              # React frontend
/services
  /embedding-service # Python: sentence-transformers microservice
  /reranker-service  # Python: cross-encoder microservice
/documents           # Sample healthcare regulatory docs for testing
/scripts             # Document ingestion scripts
docker-compose.yml   # ES, Redis, MongoDB, Python services
```

### 1.2 Domain Setup

- [ ] Collect 20-30 sample healthcare regulatory documents (publicly available)
  - Medicare/Medicaid policy summaries
  - ACA marketplace guides
  - State insurance regulation PDFs
  - CMS fact sheets and notices
  - Bilingual healthcare resources from HHS
- [ ] Organize documents by category in MongoDB metadata

### 1.3 LLM Factory Pattern (Existing — Verify)

- [ ] Ensure `LLMServiceFactory` supports:
  - `createProvider('claude')` → Anthropic API
  - `createProvider('ollama')` → Local Ollama instance
- [ ] Unified interface: `generateResponse(prompt, context, options)`
- [ ] Add streaming support to the interface
- [ ] Add provider health check and fallback logic

---

## Phase 2: Document Pipeline & Ingestion

**Goal:** Build the data pipeline that converts raw healthcare documents into searchable knowledge.

### 2.1 Document Parser

- [ ] Support PDF parsing (use `pdf-parse` for Node or `PyMuPDF` in Python service)
- [ ] Support basic Office doc parsing (.docx)
- [ ] Extract metadata: title, source agency, date, category, language
- [ ] Detect document language (Chinese vs English)

### 2.2 Chunking Strategy

- [ ] Implement recursive text splitter with configurable chunk size (target: 512 tokens)
- [ ] Preserve section headers as chunk metadata
- [ ] Overlap: 50-100 tokens between chunks to avoid splitting mid-context
- [ ] Handle bilingual documents: detect language per chunk
- [ ] Store chunk-to-document mapping for citation tracing

### 2.3 Vectorization & Indexing

- [ ] Set up Python embedding microservice:
- [ ] Expose REST endpoint: `POST /embed` → accepts text, returns vector
- [ ] Batch embedding endpoint: `POST /embed/batch` → for ingestion pipeline
- [ ] Node ingestion script that:
  1. Parses document → chunks
  2. Calls embedding service for each chunk
  3. Indexes into Elasticsearch with both text and vector fields

### 2.4 Elasticsearch Index Design

```json
{
	"mappings": {
		"properties": {
			"content": { "type": "text", "analyzer": "standard" },
			"content_en": { "type": "text", "analyzer": "english" },
			"content_zh": { "type": "text", "analyzer": "standard" },
			"embedding": {
				"type": "dense_vector",
				"dims": 384,
				"index": true,
				"similarity": "cosine"
			},
			"metadata": {
				"properties": {
					"doc_id": { "type": "keyword" },
					"tenant_id": { "type": "keyword" },
					"title": { "type": "text" },
					"source": { "type": "keyword" },
					"category": { "type": "keyword" },
					"language": { "type": "keyword" },
					"chunk_index": { "type": "integer" },
					"date": { "type": "date" }
				}
			}
		}
	}
}
```

---

## Phase 3: Hybrid Retrieval & Reranking

**Goal:** Implement production-grade retrieval that combines keyword precision with semantic understanding.

### 3.1 Hybrid Retrieval

- [ ] **Full-text search path:** ES BM25 query with ICU analyzer for Chinese support
- [ ] **Semantic search path:** Embed user query → ES kNN vector search
- [ ] **Query processor:**
  - Detect query language
  - If Chinese: also generate English translation for cross-lingual search
  - Run both search paths in parallel
- [ ] **Score fusion:** Weighted Reciprocal Rank Fusion (RRF)

  ```
  RRF_score = Σ 1 / (k + rank_i)
  ```

  - Configurable weights: `{ fulltext: 0.4, semantic: 0.6 }` as starting point
  - Tune based on evaluation

### 3.2 Cross-Encoder Reranker

- [ ] Set up Python reranker microservice:
- [ ] Expose endpoint: `POST /rerank` → accepts query + candidate passages, returns re-scored list
- [ ] Node RAG pipeline calls reranker with top-20 from hybrid retrieval
- [ ] Return top-5 reranked passages as LLM context

### 3.3 Retrieval Pipeline Orchestrator (Node.js)

```javascript
// /server/src/services/rag/pipeline.js
class RAGPipeline {
	async retrieve(query, tenantId, options = {}) {
		// 1. Process query (language detection, translation)
		const processedQuery = await this.queryProcessor.process(query);

		// 2. Embed query
		const queryVector = await this.embeddingService.embed(
			processedQuery.searchText,
		);

		// 3. Hybrid search (parallel)
		const [fullTextResults, semanticResults] = await Promise.all([
			this.esClient.fullTextSearch(processedQuery, tenantId),
			this.esClient.vectorSearch(queryVector, tenantId),
		]);

		// 4. Score fusion
		const merged = this.scoreFusion(
			fullTextResults,
			semanticResults,
			options.weights,
		);

		// 5. Rerank top-K
		const reranked = await this.rerankerService.rerank(
			processedQuery.original,
			merged.slice(0, 20),
		);

		// 6. Return top results with metadata for citation
		return reranked.slice(0, options.topK || 5);
	}
}
```

---

## Phase 4: Response Generation & Citation

**Goal:** Generate accurate, cited responses using retrieved context.

### 4.1 Prompt Template Design

- [ ] System prompt that instructs the LLM to:
  - Answer in the same language as the user's question
  - Only use information from provided context
  - Cite sources using bracket notation [1], [2], etc.
  - Say "I don't have enough information" rather than hallucinate
  - Use plain, accessible language (the user may not be fluent in English)
- [ ] Context formatting:

  ```
  [Source 1: {title} - {source agency} ({date})]
  {chunk content}

  [Source 2: ...]
  {chunk content}
  ```

### 4.2 Citation Extraction & Mapping

- [ ] Parse LLM response for citation markers [1], [2], etc.
- [ ] Map back to source documents with:
  - Document title
  - Source URL or file reference
  - Relevant page/section number
  - Direct link to original document when available
- [ ] Return structured response:
  ```json
  {
  	"answer": "Based on Medicare guidelines...",
  	"language": "zh",
  	"citations": [
  		{
  			"index": 1,
  			"title": "Medicare & You 2024",
  			"source": "CMS",
  			"page": 23
  		}
  	],
  	"confidence": 0.87
  }
  ```

### 4.3 Conversation History

- [ ] Store chat history in MongoDB per user per session
- [ ] Include recent conversation turns in LLM context for follow-up questions
- [ ] Implement context window management (truncate old turns when approaching token limit)

---

## Phase 5: Multi-Tenant Data Isolation

**Goal:** Support separate knowledge bases with permission-based access.

### 5.1 Tenant Model

```javascript
// MongoDB Schema
{
  tenantId: String,           // e.g., "healthcare", "immigration" (future)
  name: String,
  description: String,
  documentCount: Number,
  allowedUsers: [ObjectId],   // Users with access
  esIndexName: String,        // Separate ES index per tenant
  settings: {
    defaultLanguage: String,
    llmProvider: String,      // Tenant-specific LLM preference
  }
}
```

### 5.2 Access Control

- [ ] Middleware that extracts tenant context from JWT claims
- [ ] All ES queries scoped by `tenant_id` filter
- [ ] Document upload restricted to tenant admins
- [ ] API routes: `/api/tenants/:tenantId/query`, `/api/tenants/:tenantId/documents`

---

## Phase 6: Frontend (React)

**Goal:** Clean bilingual interface for querying and viewing cited results.

### 6.1 Core Pages

- [ ] **Login / Register** — language selector (Chinese/English)
- [ ] **Chat Interface** — primary query experience
  - Input box with language auto-detection
  - Response display with inline citation highlights
  - Clickable citations that expand to show source details
  - Chat history sidebar
- [ ] **Document Browser** — browse ingested documents by category
- [ ] **Admin Panel** — document upload, tenant management (if admin role)

### 6.2 Bilingual Support

- [ ] i18n setup with `react-i18next` or similar
- [ ] All UI chrome in Chinese/English
- [ ] Response language matches query language automatically

---

## Phase 7: Testing & Evaluation

### 7.1 Retrieval Quality

- [ ] Build evaluation dataset: 50+ question-answer pairs with source references
- [ ] Measure: Recall@5, Recall@10, MRR (Mean Reciprocal Rank)
- [ ] Compare: full-text only vs semantic only vs hybrid vs hybrid+rerank
- [ ] Document the results — great for interviews

### 7.2 End-to-End Quality

- [ ] Evaluate answer accuracy against ground truth
- [ ] Measure hallucination rate (answers not grounded in retrieved context)
- [ ] Test citation accuracy: does [1] actually correspond to the right source?

### 7.3 Integration Tests

- [ ] Document ingestion pipeline end-to-end
- [ ] Query → retrieval → rerank → generate → cite flow
- [ ] Multi-tenant isolation (user A cannot see tenant B's documents)
- [ ] Auth flow (expired tokens, invalid tokens, permission denied)

---

## Phase 8: Session Management & Conversational Context (Enhancement)

**Goal:** Support multi-turn conversations so users can ask follow-up questions naturally.

### 8.1 Why This Matters

Healthcare users rarely ask one-shot questions. A typical flow:

```
User: "CHIP的年费是多少？"           → RAG answers about CHIP fees
User: "我的孩子符合条件吗？"          → Without session context, "我的孩子" has no link to CHIP
User: "那copay呢？"                  → Without context, "那" and "copay" are too vague for retrieval
```

Without session management, each query is independent and follow-ups return irrelevant results.

### 8.2 Session Schema (MongoDB)

```javascript
{
  sessionId: String,
  userId: ObjectId,
  tenantId: String,
  turns: [
    {
      role: "user" | "assistant",
      content: String,
      timestamp: Date,
      citations: [],           // for assistant turns
      retrievedChunks: [],     // what RAG found (for debugging & evaluation)
      rewrittenQuery: String   // the standalone query after rewriting (for user turns)
    }
  ],
  createdAt: Date,
  updatedAt: Date,
  expiresAt: Date              // TTL index for auto-cleanup (24h default)
}
```

### 8.3 Query Rewriter

The key component. Uses a lightweight LLM call to rewrite follow-up queries into standalone questions before retrieval.

```javascript
// /server/src/services/rag/queryRewriter.js
class QueryRewriter {
	async rewrite(currentQuery, recentTurns) {
		if (recentTurns.length === 0) return currentQuery;

		const prompt = `Given the conversation history below, rewrite the user's latest question
as a standalone, self-contained search query. Include all necessary context from the
conversation. If the query is already standalone, return it unchanged.
Output ONLY the rewritten query, nothing else.

Conversation history:
${recentTurns.map((t) => `${t.role}: ${t.content}`).join("\n")}

Latest question: ${currentQuery}

Rewritten query:`;

		const rewritten = await this.llmService.generate(prompt, {
			maxTokens: 150,
		});
		return rewritten.trim();
	}
}
```

Example:

```
History: [user: "CHIP的年费是多少？", assistant: "CHIP enrollment fees are $50 or less..."]
Current: "我的孩子符合条件吗？"
Rewritten: "What are the eligibility requirements for children to qualify for CHIP in Texas?"
```

### 8.4 Updated Pipeline Flow

```
User query
  → Load session (last 3-5 turns)
  → Query Rewriter: rewrite follow-up into standalone query
  → Hybrid Retrieval (uses rewritten query)
  → Reranker
  → LLM Generation (prompt includes retrieved context + conversation history)
  → Save turn to session (store both original query and rewritten query)
  → Return response
```

### 8.5 Implementation Checklist

- [ ] Session CRUD endpoints:
  - `POST /api/sessions` — create new session
  - `GET /api/sessions/:sessionId` — load session
  - `DELETE /api/sessions/:sessionId` — end session
- [ ] MongoDB TTL index on `expiresAt` for automatic cleanup (24h)
- [ ] Query rewriter service with conversation context
- [ ] Update RAG pipeline to accept session context
- [ ] Update LLM generation prompt to include recent turns
- [ ] Context window management: limit to last 3-5 turns to preserve token budget for retrieved documents
- [ ] Store `rewrittenQuery` and `retrievedChunks` per turn for debugging
- [ ] Frontend: session sidebar showing chat history, ability to start new session

### 8.6 Design Decisions

| Decision                             | Choice                      | Why                                                                                        |
| ------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------ |
| Window size                          | Last 3-5 turns              | Preserves token budget for retrieved documents; healthcare conversations are usually short |
| Query rewriting vs. history stuffing | Rewrite to standalone query | Cleaner retrieval results; avoids noise from old turns polluting the search                |
| Session TTL                          | 24 hours                    | Healthcare queries are usually one sitting, not ongoing                                    |
| Store retrieved chunks               | Yes                         | Essential for debugging and Phase 7 evaluation                                             |
| Rewriter model                       | Same LLM via Factory        | No need for separate model; rewriting is a lightweight task                                |

---

## Texas Healthcare Document Corpus

All publicly available. Organized by category to match realistic user queries.

### Priority 1: Start Here (Core Pipeline Testing)

These 5 documents cover the most common questions a non-English-speaking user would ask.

| #   | Document                                                         | Source         | URL                                                                                                | Why It's Important                                                                                                                          |
| --- | ---------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Texas Medicaid & CHIP Reference Guide, 15th Ed ("Pink Book")** | Texas HHS      | `hhs.texas.gov/sites/default/files/documents/texas-medicaid-chip-reference-guide-15th-edition.pdf` | 170+ page PDF — richest single document. Covers eligibility, benefits, managed care, financials. Enough to test entire pipeline end-to-end. |
| 2   | **CHIP Program Overview**                                        | Texas HHS      | `hhs.texas.gov/services/health/medicaid-chip/medicaid-chip-members/chip`                           | Eligibility, copays, enrollment fees, benefits, choosing a health plan.                                                                     |
| 6   | **How to File a Health Insurance Complaint**                     | TDI            | `tdi.texas.gov/consumer/file-health-cmplnt.html`                                                   | Step-by-step complaint filing process with the Texas Dept of Insurance.                                                                     |
| 8   | **How to File an Appeal or Request External Review**             | TDI            | `tdi.texas.gov/consumer/complaint-health.html`                                                     | What to do when your plan denies treatment — appeal timelines, external review.                                                             |
| 11  | **Consumer Insurance Complaints Guide**                          | Texas Law Help | `texaslawhelp.org/article/consumer-insurance-complaints-and-the-texas-department-of-insurance`     | Plain-language guide: what TDI can/can't do, how to prepare, what to expect.                                                                |

### Eligibility & Enrollment (Medicaid / CHIP / ACA)

| #   | Document                                                         | Source              | URL                                                                                                |
| --- | ---------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | **Texas Medicaid & CHIP Reference Guide, 15th Ed ("Pink Book")** | Texas HHS           | `hhs.texas.gov/sites/default/files/documents/texas-medicaid-chip-reference-guide-15th-edition.pdf` |
| 2   | **CHIP Program Overview**                                        | Texas HHS           | `hhs.texas.gov/services/health/medicaid-chip/medicaid-chip-members/chip`                           |
| 3   | **Medicaid and CHIP Members Guide**                              | Texas HHS           | `hhs.texas.gov/services/health/medicaid-chip/medicaid-chip-members`                                |
| 4   | **Texas ACA Marketplace Guide**                                  | healthinsurance.org | `healthinsurance.org/aca-marketplace/texas/`                                                       |
| 5   | **Medicaid Eligibility in Texas**                                | healthinsurance.org | `healthinsurance.org/medicaid/texas/`                                                              |

### Filing Claims & Complaints

| #   | Document                                                         | Source | URL                                              |
| --- | ---------------------------------------------------------------- | ------ | ------------------------------------------------ |
| 6   | **How to File a Health Insurance Complaint**                     | TDI    | `tdi.texas.gov/consumer/file-health-cmplnt.html` |
| 7   | **Health Insurance Complaints Overview**                         | TDI    | `tdi.texas.gov/consumer/health-complaints.html`  |
| 8   | **How to File an Appeal or Request External Review**             | TDI    | `tdi.texas.gov/consumer/complaint-health.html`   |
| 9   | **TDI Complaint Form (PDF)**                                     | TDI    | `tdi.texas.gov/consumer/complfrm.html`           |
| 10  | **How to File a Provider Complaint About Health Claim Payments** | TDI    | `tdi.texas.gov/hprovider/providercompl.html`     |

### Consumer Rights & Protections

| #   | Document                                  | Source              | URL                                                                                            |
| --- | ----------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| 11  | **Consumer Insurance Complaints Guide**   | Texas Law Help      | `texaslawhelp.org/article/consumer-insurance-complaints-and-the-texas-department-of-insurance` |
| 12  | **Insurance Consumer Protection**         | TX Attorney General | `texasattorneygeneral.gov/consumer-protection/financial-and-insurance-scams/insurance`         |
| 13  | **Texas Health and Safety Code Overview** | HSE Prof            | `hseprof.com/2025/05/22/texas-health-and-safety-code-2025/`                                    |

### Policy & Regulation

| #   | Document                                  | Source                | URL                                                                                                                                   |
| --- | ----------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 14  | **HHSC Strategic Plan 2025–2029**         | Texas HHS             | `hhs.texas.gov/sites/default/files/documents/hhsc-strategic-plan-2025-2029-part-1.pdf`                                                |
| 15  | **Texas HHS Policies and Rules Hub**      | Texas HHS             | `hhs.texas.gov/regulations/policies-rules`                                                                                            |
| 16  | **2025 TX Healthcare Legislative Update** | Norton Rose Fulbright | `nortonrosefulbright.com/-/media/files/nrf/nrfweb/knowledge-pdfs/the-89th-texas-legislature---2025-healthcare-legislative-update.pdf` |

### Provider-Specific

| #   | Document                             | Source            | URL                                                                                                  |
| --- | ------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------- |
| 17  | **2025 New Healthcare Laws Summary** | Weaver Johnston   | `weaverjohnston.com/legislative-regulatory-updates/2025-texas-healthcare-legislative-updateroundup/` |
| 18  | **THA State Policy Priorities 2025** | TX Hospital Assoc | `tha.org/advocacy/state-policy-priorities/`                                                          |

### Taxes & Premium Tax Credits

| #   | Document                                            | Source         | URL                                                                                                    |
| --- | --------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| 19  | **2025 Health Coverage & Your Federal Taxes**       | HealthCare.gov | `healthcare.gov/taxes/`                                                                                |
| 20  | **Premium Tax Credit — The Basics**                 | IRS            | `irs.gov/affordable-care-act/individuals-and-families/the-premium-tax-credit-the-basics`               |
| 21  | **Eligibility for the Premium Tax Credit**          | IRS            | `irs.gov/affordable-care-act/individuals-and-families/eligibility-for-the-premium-tax-credit`          |
| 22  | **Questions and Answers on the Premium Tax Credit** | IRS            | `irs.gov/affordable-care-act/individuals-and-families/questions-and-answers-on-the-premium-tax-credit` |
| 23  | **Topic No. 612: The Premium Tax Credit**           | IRS            | `irs.gov/taxtopics/tc612`                                                                              |
| 24  | **Premium Tax Credit (PTC) Overview**               | IRS            | `irs.gov/credits-deductions/premium-tax-credit-ptc-overview`                                           |

Key concepts these documents cover:

- Form 1095-A (Health Insurance Marketplace Statement) — received from Marketplace
- Form 8962 (Premium Tax Credit) — must file to reconcile advance payments
- Advance Premium Tax Credit (APTC) — monthly payments to insurer to lower premiums
- Reconciliation — if income changed, you may owe or get a refund
- Income thresholds — 100%–400% FPL for eligibility (expanded through 2025 by ARP/IRA)
- Reporting life changes to the Marketplace to avoid repayment surprises

### Benefits Coverage & What Plans Cover

| #   | Document                                    | Source                                | URL                                                  |
| --- | ------------------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| 25  | **Health Plan Types: HMOs, PPOs, and More** | HealthCare.gov                        | `healthcare.gov/choose-a-plan/plan-types/`           |
| 26  | **Health Care Coverage Guide (Texas)**      | TDI                                   | `tdi.texas.gov/pubs/consumer/cb005.html`             |
| 27  | **Getting Individual Health Insurance**     | TX Office of Public Insurance Counsel | `opic.texas.gov/health-insurance/basics/individual/` |

### Choosing a Provider / Network

| #   | Document                                        | Source     | URL                                                                      |
| --- | ----------------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| 28  | **How to Choose the Right Health Plan (Texas)** | TDI        | `tdi.texas.gov/blog/how-to-choose-the-right-health-plan.html`            |
| 29  | **PPO and EPO Networks in Texas**               | TDI        | `tdi.texas.gov/hmo/mcqa/epbp-ppbp-network.html`                          |
| 30  | **Texas Health Exchange Networks Explained**    | TexasPlans | `texasplans.com/Texas-health-exchange-obamacare-networks-explained.html` |

### Surprise Medical Bills & Billing Protections

| #   | Document                                                    | Source | URL                                                                            |
| --- | ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| 31  | **How Consumers Are Protected from Surprise Medical Bills** | TDI    | `tdi.texas.gov/tips/texas-protects-consumers-from-surprise-medical-bills.html` |
| 32  | **How to Get Help with a Surprise Medical Bill**            | TDI    | `tdi.texas.gov/medical-billing/surprise-balance-billing.html`                  |
| 33  | **Balance Billing: Independent Dispute Resolution**         | TDI    | `tdi.texas.gov/medical-billing/index.html`                                     |

### Ingestion Notes

- **Document 1 (Pink Book)** is a large PDF — test your chunking strategy here first. It has clear chapter/section structure which is ideal for metadata extraction.
- **Documents 6–10 (TDI)** are web pages — you'll need to scrape and convert to clean text. They have simple, well-structured HTML.
- **Documents 4–5** are comprehensive guides with tables and statistics — good for testing how your chunker handles mixed content.
- **Documents 19–24 (IRS/Tax)** are structured Q&A and reference pages — great for testing retrieval precision since users will ask very specific tax questions.
- **Documents 25–30 (Coverage/Provider)** are comparison-heavy with plan type breakdowns — test how your chunker handles tables and side-by-side comparisons.
- **Documents 31–33 (Surprise Billing)** are procedural guides — test how well your system handles "what should I do if..." queries.
- **PDF documents (1, 9, 14, 16)** will exercise your PDF parsing pipeline.
- **Web pages (all others)** will exercise your web scraping / HTML-to-text pipeline.

### Sample User Queries to Test Against

These are realistic questions a Chinese-speaking user in Texas might ask:

```
# Eligibility
- "我的家庭收入是联邦贫困线的150%，孩子能申请什么保险？"
  (My household income is 150% FPL, what insurance can my child apply for?)

- "我是绿卡持有者，可以申请Texas Medicaid吗？"
  (I'm a green card holder, can I apply for Texas Medicaid?)

- "CHIP的年费是多少？看医生要付copay吗？"
  (What's the CHIP annual fee? Do I need to pay copay for doctor visits?)

# Filing Claims
- "保险公司拒绝了我的手术申请，我该怎么上诉？"
  (Insurance denied my surgery request, how do I appeal?)

- "我要向TDI投诉保险公司，需要准备什么材料？"
  (I want to complain to TDI about my insurer, what documents do I need?)

- "保险公司没有按时付款给我的医生，怎么办？"
  (Insurance didn't pay my doctor on time, what should I do?)

# Benefits & Coverage
- "Medicaid包括牙科和眼科吗？"
  (Does Medicaid cover dental and vision?)

- "ACA marketplace的Silver和Gold plan有什么区别？"
  (What's the difference between Silver and Gold plans on ACA marketplace?)

# Rights
- "保险公司可以因为我有pre-existing condition拒绝我吗？"
  (Can the insurer deny me for a pre-existing condition?)

- "医院给我一个surprise bill，Texas法律怎么保护我？"
  (Hospital gave me a surprise bill, how does Texas law protect me?)

# Taxes & Premium Tax Credits
- "我拿了premium tax credit，报税的时候要填什么表？"
  (I received premium tax credit, what forms do I need when filing taxes?)

- "Form 1095-A是什么？我什么时候能收到？"
  (What is Form 1095-A? When will I receive it?)

- "我的收入变了，会影响我的保险补贴吗？要还钱吗？"
  (My income changed, will it affect my insurance subsidy? Do I have to pay back?)

- "我的家庭收入要报多少才能拿到保险税收抵免？"
  (How much household income do I need to report to get the insurance tax credit?)

- "如果我没有报Form 8962会怎么样？"
  (What happens if I don't file Form 8962?)

# Choosing a Provider / Plan
- "HMO和PPO有什么区别？在Texas哪个更划算？"
  (What's the difference between HMO and PPO? Which is more cost-effective in Texas?)

- "我怎么知道我的医生是不是在保险的network里？"
  (How do I know if my doctor is in my insurance network?)

- "我要换保险计划，什么时候可以换？"
  (I want to switch insurance plans, when can I do that?)

- "EPO plan是什么？和HMO有什么不一样？"
  (What is an EPO plan? How is it different from an HMO?)

# Surprise Bills
- "我去了in-network的医院但是收到了out-of-network的账单，这合法吗？"
  (I went to an in-network hospital but got an out-of-network bill, is this legal?)

- "Texas的surprise bill保护法适用于我的保险吗？怎么查？"
  (Does Texas surprise bill protection law apply to my insurance? How do I check?)

- "我收到了surprise bill，我该怎么投诉？"
  (I received a surprise bill, how do I file a complaint?)
```

---

## Implementation Priority

| Priority | Phase                           | Why                                                             |
| -------- | ------------------------------- | --------------------------------------------------------------- |
| 1        | Phase 1 (Foundation)            | Clean architecture before adding complexity                     |
| 2        | Phase 2 (Document Pipeline)     | No RAG without data                                             |
| 3        | Phase 3 (Hybrid Retrieval)      | Core differentiator vs basic RAG                                |
| 4        | Phase 4 (Generation + Citation) | Completes the user-facing loop                                  |
| 5        | Phase 6 (Frontend)              | Needs to be demo-ready                                          |
| 6        | Phase 5 (Multi-Tenant)          | Important but can be added incrementally                        |
| 7        | Phase 7 (Evaluation)            | Polish — but great interview material                           |
| 8        | Phase 8 (Session Management)    | Enhancement — adds conversational context for follow-up queries |

---

## Interview Talking Points

When discussing this project, emphasize:

1. **Why you built it:** "My family member needed to navigate U.S. healthcare regulations but doesn't speak English. Existing tools assume English fluency. I built this to solve a real problem."

2. **Technical depth:** "I implemented hybrid retrieval because regulatory language needs both keyword precision (exact policy numbers, form names) and semantic understanding (paraphrased questions). The reranker was critical because in healthcare, wrong answers have real consequences."

3. **Architecture decisions:** "I chose Node.js for the main API layer for consistency with my production stack, and Python microservices for ML-specific tasks like embedding and reranking. The Factory pattern lets me swap LLM providers without touching business logic."

4. **Trade-offs:** "Local embedding model trades some accuracy for zero external API dependency and predictable latency. For the reranker, I chose a smaller cross-encoder model that adds ~50ms latency but significantly improves precision in the top-5 results."
