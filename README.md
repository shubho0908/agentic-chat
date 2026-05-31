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
- Cross-conversation memory retention (mem0)
- Message versioning with tree-based branching

**Multi-Model Support**
- GPT-5.5, GPT-5.4, GPT-5.2, and legacy GPT-5 family (up to 1.05M context)
- Vision capabilities across all models
- Extended thinking with configurable effort levels

**Document Intelligence (RAG)**
- Supports PDF, DOCX, DOC, TXT, XLS, XLSX, CSV, and common image formats
- Semantic search with pgvector embeddings (text-embedding-3-large)
- Cohere reranking (rerank-v3.5) for relevance scoring
- Batch processing up to 5 files per message

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