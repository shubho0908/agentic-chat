# Feature Demos

Visual walkthroughs showcasing the key capabilities of Agentic Chat.

## 📹 Quick Navigation

| Feature | Description | Demo |
|---------|-------------|------|
| [Web Search](#web-search) | Real-time internet search with AI planning | [▶️ Watch](./demos/websearch-tool.mp4) |
| [YouTube Analysis](#youtube-analysis) | Transcript extraction & video intelligence | [▶️ Search](./demos/youtube-search.mp4) • [▶️ Tool](./demos/youtube-tool.mp4) |
| [RAG Document Intelligence](#rag-document-intelligence) | Multi-format document processing with semantic search | [▶️ Single](./demos/rag.mp4) • [▶️ Multi-file](./demos/rag-multi-files.mp4) |
| [Deep Research](#deep-research) | Autonomous multi-step research workflows | [▶️ Watch](./demos/deep-research.mp4) |
| [URL Scraping](#url-scraping) | Automatic web page content extraction | [▶️ Watch](./demos/scrape.mp4) |
| [Google Suite Integration](#google-suite-integration) | Gmail, Calendar, Drive, Docs, Sheets, Slides | [▶️ Watch](./demos/google-tool.mp4) |

---

## Web Search

Real-time internet search powered by Tavily API with intelligent query planning.

**Key Features:**
- Basic mode: 6 focused results
- Advanced mode: 10-25 results with AI-powered multi-search planning
- Image results with gallery view
- Source deduplication and relevance scoring

**[▶️ Watch Demo](./demos/websearch-tool.mp4)**

---

## YouTube Analysis

Extract transcripts, parse chapters, and analyze video content.

**Key Features:**
- Multi-language transcript extraction
- Automatic chapter parsing from descriptions
- Video search and batch processing
- Metadata enrichment via YouTube Data API

**Demos:**
- **[▶️ YouTube Search](./demos/youtube-search.mp4)** - Search and analyze videos
- **[▶️ YouTube Tool](./demos/youtube-tool.mp4)** - Transcript extraction & analysis

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
- **[▶️ Single Document RAG](./demos/rag.mp4)** - Query single document
- **[▶️ Multi-file RAG](./demos/rag-multi-files.mp4)** - Cross-document intelligence

---

## Deep Research

Autonomous multi-step research using LangGraph workflows (3 uses/month).

**Workflow Phases:**
1. **Gate Check** - Determines if deep research is necessary
2. **Planning** - Breaks down query into research steps
3. **Parallel Research** - Executes searches concurrently
4. **Aggregation** - Synthesizes findings
5. **Evaluation** - Quality assessment with iterative refinement
6. **Formatting** - Structured output generation

**[▶️ Watch Demo](./demos/deep-research.mp4)**

---

## URL Scraping

Automatic detection and extraction of web page content (up to 5 URLs per message).

**Key Features:**
- Smart content extraction with Readability + Cheerio
- Rich metadata and Open Graph link previews
- 1-hour content caching for performance
- Automatic context injection into queries

**[▶️ Watch Demo](./demos/scrape.mp4)**

---

## Google Suite Integration

OAuth 2.0 access to your Google Workspace with automatic token refresh.

**Supported Services:**
- **Gmail** - Search, read, send, reply, delete, modify labels, attachments
- **Google Calendar** - List, create, update, delete events with attendees
- **Google Drive** - Search, list folders, read/create/delete files, move, copy, share
- **Google Docs** - Create, read, append, find-and-replace
- **Google Sheets** - Create, read, write, append, clear ranges
- **Google Slides** - Create, read, add slides

**[▶️ Watch Demo](./demos/google-tool.mp4)**

---

## Additional Features

### Message Versioning & Branching
- Tree-based conversation structure
- Navigate between message versions
- Edit and regenerate with version history

### Semantic Caching
- pgvector-based similarity caching
- Reduces API calls for similar queries
- Cross-conversation memory via mem0

### Export & Sharing
- Export as JSON, Markdown, or PDF
- Public sharing with unique links
- Include/exclude attachments and versions

### Chat Experience
- Real-time streaming responses
- Clipboard image paste
- File attachments (documents + images)
- Citations and source tracking
- Follow-up question suggestions
- Dark/light theme
- Image lightbox with keyboard shortcuts

---

## Getting Started

Ready to try these features? Check out the [Setup Guide](../SETUP.md) for installation instructions.

## Architecture Details

For technical implementation details, see the Architecture section in the main [README](../README.md).
