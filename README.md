<div align="center">
  <img src="public/logo.png" alt="Agentic Chat" width="80" />
  <h1>Agentic Chat</h1>
  <p>Multi-modal AI chat platform with intelligent routing, RAG-powered document intelligence, and tool integrations.</p>

  <p>
    <a href="./SETUP.md"><strong>Setup Guide</strong></a> ·
    <a href="./docs/FEATURES.md"><strong>Features</strong></a>
  </p>

  <br />
</div>

---

## Features

**Intelligent Routing & Context**
- Dynamic query classification routes to optimal context mode (memory, documents, vision, hybrid, tools, URL content)
- Semantic caching via pgvector reduces redundant LLM calls
- Jev checkpoints can observe or gate planner, tool routing, cache, retrieval, and HITL decisions
- Cross-conversation memory retention (mem0)
- Message versioning with tree-based branching

**Multi-Model Support**
- GPT-5.5, GPT-5.4, GPT-5.2, and legacy GPT-5 family (up to 1.05M context)
- Vision capabilities across all models
- Extended thinking with configurable effort levels

**Document Intelligence (RAG)**
- Supports PDF, DOCX, DOC, TXT, XLS, XLSX, CSV, and common image formats
- Hybrid semantic and PostgreSQL lexical retrieval with reciprocal rank fusion (RRF)
- Cohere reranking (rerank-v3.5), with a Jev A/B or active reranker path
- Citation match percentages come only from bounded semantic or reranker scores; lexical-only evidence has no percentage
- Optional Jev passage filtering evaluates relevance, usable evidence, contradictions, and prompt injection with a four-request concurrency limit
- Batch processing up to 5 files per message

**Jev Decision Layer**
- Phase 0: shared TypeSafe API client, typed questions and answers, deadlines, retry, response validation, circuit breaking, and fail-open fallbacks
- Phase 1: planner shadow evaluation compares Jev decisions with the production planner without changing the route
- Phase 2: tool-router shadow evaluation records routing comparisons and diagnoses failed tool rounds without changing execution
- Phase 3: the RAG reranker supports deterministic A/B cohorts and an active Jev path, with Cohere fallback
- Phase 4: the passage gate runs after reranking; shadow and A/B modes observe, while active mode filters passages
- Phase 5: the cache gate can veto a semantic-cache hit in active mode, and HITL escalation can add review when the deterministic blocklist did not
- Jev can add a HITL interrupt but cannot suppress one required by the deterministic dangerous-action blocklist
- Redacted decision metadata is stored in `jev_decisions`; raw evaluation state is not stored there
- Authenticated `GET /api/jev/stats` reports outcomes, fallback rate, and p50/p95 latency by checkpoint for a 1-90 day window

**Tools**
- **Web Search** — Real-time search via Exa with basic/advanced depth modes
- **Web Scraping** — 3-tier extraction (Readability → Firecrawl → Jina Reader), SSRF-hardened
- **Deep Research** — Sub-agent powered multi-step investigation and synthesis
- **Human-in-the-Loop** — Decision cards, clarification requests, approval workflows

**Composio Integrations**
- Connect via OAuth 2.0 to Gmail, Google Calendar, Drive, Docs, Sheets, Slack, Notion, GitHub, and Linear
- Intent-based routing automatically selects relevant toolkits

**Security**
- Google OAuth via Better Auth
- BYOK with AES-256-GCM encryption; server-side API proxy (no client-side key exposure)
- Rate limiting (sliding window), SSRF protection (DNS pinning, private IP blocking)
- Zod validation on all inputs

**Chat UX**
- SSE streaming with abort support
- File attachments, clipboard paste, drag-and-drop
- Export to JSON, Markdown, or PDF
- Public sharing with privacy redaction
- Dark/light theme, LaTeX/KaTeX, Mermaid diagrams, syntax highlighting

---

## Jev Configuration

Set `TYPESAFE_API_KEY` in deployment secrets to enable Jev calls. Each checkpoint has its own mode variable. Every checkpoint defaults to `off` when its variable is missing or invalid.

| Checkpoint | Environment variable | Implemented modes |
|------------|----------------------|-------------------|
| Planner | `JEV_PLANNER_MODE` | `off`, `shadow` |
| Tool router | `JEV_TOOL_ROUTER_MODE` | `off`, `shadow` |
| RAG reranker | `JEV_RERANK_MODE` | `off`, `ab`, `active` |
| Passage gate | `JEV_PASSAGE_GATE_MODE` | `off`, `shadow`, `ab`, `active` |
| Cache gate | `JEV_CACHE_GATE_MODE` | `off`, `shadow`, `ab`, `active` |
| HITL escalation | `JEV_HITL_ESCALATION_MODE` | `off`, `shadow`, `ab`, `active` |

The shared mode parser accepts `off`, `shadow`, `ab`, and `active`. A checkpoint only changes production behavior in the modes listed above. Shadow and A/B gate modes record decisions without filtering. Provider errors fail open. The RAG reranker falls back to Cohere when a Jev request fails.

Use `GET /api/jev/stats?days=30` for all checkpoints or add `&checkpoint=planner` to filter the report. The endpoint requires an authenticated user. `days` defaults to 30 and is capped at 90.

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | Next.js 16, React 19, TanStack Query/Virtual, Tailwind CSS 4, Radix UI, Framer Motion |
| Backend | PostgreSQL (pgvector, pgcrypto), Prisma v6, Better Auth, UploadThing, Zod v4 |
| AI/ML | OpenAI SDK v6, LangChain, LangGraph, LangSmith, Cohere, Exa, Composio, mem0, tiktoken |
| Documents | pdf-parse, mammoth, word-extractor, xlsx, @react-pdf/renderer |

---

## Getting Started

See the [Setup Guide](./SETUP.md) for installation, environment configuration, and database setup.