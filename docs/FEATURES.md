# Feature Demos

Visual walkthroughs showcasing the key capabilities of Agentic Chat.

## 📹 Quick Navigation

| Feature | Description
|---------|-------------|
| [Web Search](#web-search) | Real-time internet search with AI planning |
| [YouTube Analysis](#youtube-analysis) | Transcript extraction & video intelligence |
| [RAG Document Intelligence](#rag-document-intelligence) | Multi-format document processing with semantic search |
| [Deep Research](#deep-research) | Autonomous multi-step research workflows |
| [URL Scraping](#url-scraping) | Automatic web page content extraction |
| [Google Suite Integration](#google-suite-integration) | Gmail, Calendar, Drive, Docs, Sheets, Slides |

---

## Web Search

Real-time internet search powered by Tavily API with intelligent query planning.

**Key Features:**
- Basic mode: 6 focused results
- Advanced mode: 10-25 results with AI-powered multi-search planning
- Image results with gallery view
- Source deduplication and relevance scoring

https://github.com/user-attachments/assets/062a477c-f577-4ca6-ad3c-c3a1aafa60da

---

## YouTube Analysis

Extract transcripts, parse chapters, and analyze video content.

**Key Features:**
- Multi-language transcript extraction
- Automatic chapter parsing from descriptions
- Video search and batch processing
- Metadata enrichment via YouTube Data API

**Demos:**
- Search and analyze videos
  
https://github.com/user-attachments/assets/60163e7e-f414-4295-9d00-302418b3757e


- Transcript extraction & analysis

https://github.com/user-attachments/assets/151f3774-c3bb-45cc-80c7-a57eeb526390


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

## Deep Research

Autonomous multi-step research using LangGraph workflows (3 uses/month).

**Workflow Phases:**
1. **Gate Check** - Determines if deep research is necessary
2. **Planning** - Breaks down query into research steps
3. **Parallel Research** - Executes searches concurrently
4. **Aggregation** - Synthesizes findings
5. **Evaluation** - Quality assessment with iterative refinement
6. **Formatting** - Structured output generation


https://github.com/user-attachments/assets/4cb42b81-a6da-47a6-813b-991d4a3ba28f

---

## URL Scraping

Automatic detection and extraction of web page content (up to 5 URLs per message).

**Key Features:**
- Smart content extraction with Readability + Cheerio
- Rich metadata and Open Graph link previews
- 1-hour content caching for performance
- Automatic context injection into queries

https://github.com/user-attachments/assets/283deac3-d207-434b-a315-0b86a500c648

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


https://github.com/user-attachments/assets/b84a87a1-2da6-48f5-aada-4b7819f7326d


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
