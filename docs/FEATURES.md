# Feature Demos

Visual walkthroughs showcasing the key capabilities of Agentic Chat.

## 📹 Quick Navigation

| Feature | Description |
|---------|-------------|
| [Web Search](#web-search) | Real-time internet search with AI planning |
| [RAG Document Intelligence](#rag-document-intelligence) | Multi-format document processing with semantic search |
| [URL Scraping](#url-scraping) | Automatic web page content extraction |
| [Composio Integrations](#composio-integrations) | Gmail, Calendar, Drive, Docs, Sheets, Slack, Notion, GitHub, Linear |

---

## Web Search

Real-time internet search powered by Exa API with intelligent query planning.

**Key Features:**
- Basic mode: 6 focused results
- Advanced mode: 10-25 results with AI-powered multi-search planning
- Image results with gallery view
- Source deduplication and relevance scoring

https://github.com/user-attachments/assets/062a477c-f577-4ca6-ad3c-c3a1aafa60da

---

## RAG Document Intelligence

Semantic search across documents with pgvector embeddings and Cohere reranking.

**Supported Formats:**
- Documents: PDF, DOCX, DOC, TXT, CSV, XLS, XLSX
- Images: JPG, PNG, GIF, WEBP, BMP, SVG, TIFF, ICO (with OCR)

**Key Features:**
- Semantic search with relevance scoring
- Source citations with chunk tracking
- Real-time processing status
- Batch document uploads (up to 5 files)

**Demos:**
- Query single document


https://github.com/user-attachments/assets/c7cf2457-b8fc-45b4-b9b7-9744e83129e5


- Cross-document intelligence


https://github.com/user-attachments/assets/b368b5c0-0bc1-462d-bad7-a8a25710deba


---


## URL Scraping

Automatic detection and extraction of web page content (up to 5 URLs per message).

**Key Features:**
- 3-tier scraping: Readability → Firecrawl (JS-rendered) → Jina Reader
- SSRF-hardened fetch with DNS pinning
- Rich metadata and Open Graph link previews
- Content bounded to 3000 chars per tool output
- Automatic context injection into queries

https://github.com/user-attachments/assets/283deac3-d207-434b-a315-0b86a500c648

---

## Composio Integrations

OAuth 2.0 per-user connections to 9 services via Composio SDK with intent-based routing.

**Supported Services:**
- **Gmail** - Profile, threads, send, reply, drafts, labels
- **Google Calendar** - Events, free slots, create, update, delete, quick add
- **Google Drive** - Files, folders, upload, copy, move, delete, share
- **Google Docs** - Search, read, create markdown, insert text, find-and-replace
- **Google Sheets** - Search, schema, query, lookup, create, batch update, append, clear
- **Slack** - Channels, users, messages, search, schedule, reactions, topics
- **Notion** - Pages, databases, blocks, rows, search, archive
- **GitHub** - Repos, issues, PRs, commits, releases, file operations, labels
- **Linear** - Issues, projects, teams, users, states, comments, search

**Safety:**
- Dangerous actions (send, delete, create, update, share, archive) require explicit user approval
- Side-effect verb detection as additional safety layer


https://github.com/user-attachments/assets/b84a87a1-2da6-48f5-aada-4b7819f7326d


---

## Additional Features

### Deep Research
- Sub-agent powered comprehensive research
- Triggered by research-intent queries ("research", "compare", "in-depth", "pros and cons")
- Multi-step investigation with synthesis using user's API key and selected model

### Human-in-the-Loop
- Ask User tool presents decision cards with structured options (2-4 choices)
- Recommendation field for suggested option
- Approval workflows for dangerous Composio actions

### Extended Thinking
- Toggleable chain-of-thought reasoning
- Animated thinking indicator with duration display
- Collapsible thinking accordion in responses
- Configurable reasoning effort levels

### Message Versioning & Branching
- Tree-based conversation structure
- Navigate between message versions
- Edit and regenerate with version history
- Soft deletion with recovery

### Semantic Caching
- pgvector-based similarity caching
- Reduces API calls for similar queries
- Tool-intent queries automatically bypass cache
- Configurable TTL with automatic cleanup

### Conversation Memory
- Cross-conversation context retention via mem0
- AI-mediated memory intent classification
- Pattern-based detection of referential queries ("it", "this", "that")

### Export & Sharing
- Export as JSON, Markdown, or PDF (server-side generation)
- Public sharing with unique links and OpenGraph previews
- Privacy redaction strips metadata and attachments
- Include/exclude attachments and versions

### Chat Experience
- Real-time SSE streaming with abort support
- Continue/resume incomplete conversations
- Clipboard image paste and drag-and-drop uploads
- Citations and source tracking with relevance scores
- Follow-up question suggestions
- Dark/light theme (system-aware)
- Image lightbox with keyboard shortcuts
- Mermaid diagrams and LaTeX/KaTeX rendering
- Link previews with Open Graph metadata
- Tool activity display during streaming
- Routing badges showing active context mode
- Context limit warnings with visual banner

---

## Getting Started

Ready to try these features? Check out the [Setup Guide](../SETUP.md) for installation instructions.

## Architecture Details

For technical implementation details, see the Architecture section in the main [README](../README.md).
