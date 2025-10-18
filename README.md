# Agentic Chat

Multi-modal AI chat platform with intelligent query routing, semantic caching, RAG-powered document intelligence, and autonomous research capabilities.

## Overview

A production-ready conversational AI system built with Next.js 15, React 19, and PostgreSQL. Features dynamic query classification, specialized tool routing, multi-agent orchestration, and comprehensive document processing with OCR support.

## Core Features

### 🔐 Authentication & Security
- **Google OAuth Integration** via Better Auth
- **BYOK (Bring Your Own Key)** - AES-256-GCM encrypted API key storage
- **Server-side API Proxy** - Eliminates client-side key exposure
- **Rate Limiting & Usage Tracking** - Built-in cost management

### 🤖 Multi-Model Support
- **GPT-5 Series**: GPT-5, GPT-5 Mini, GPT-5 Nano (with extended reasoning)
- **GPT-4.1 Series**: GPT-4.1, GPT-4.1 Mini, GPT-4.1 Nano
- **GPT-4o Series**: GPT-4o, GPT-4o Mini
- **Vision Capabilities**: All models support multimodal input (text + images)
- Context windows up to 1M+ tokens

### 🛠️ Specialized Tools

#### Web Search
- Real-time internet search via Tavily API

#### YouTube Analysis
- Transcript extraction with multi-language support
- Automatic chapter parsing from video descriptions
- YouTube video search (with API key)
- Batch video processing
- Timestamp-aware transcript formatting

#### Google Suite Integration
- **Gmail**: Search, read, send, reply, delete emails, modify labels, get attachments
- **Google Calendar**: List, create, update, delete events with attendees
- **Google Drive**: Search, list folders, read/create/delete files, move, copy, share
- **Google Docs**: Create, read, append, find-and-replace
- **Google Sheets**: Create, read, write, append, clear ranges
- **Google Slides**: Create, read, add slides
- OAuth 2.0 authentication with automatic token refresh

#### Deep Research
- Multi-step autonomous research with usage limits (3/month)
- LangGraph-powered workflow: gate check → planning → parallel research → aggregation → evaluation → formatting
- Intelligent gate system to determine research necessity
- Iterative quality evaluation with adjustable strictness

### 📚 Document Intelligence (RAG)
- **Multi-format Support**: PDF, DOCX, DOC, TXT, XLS, XLSX, CSV, MD
- **Image Processing**: JPG, PNG, GIF, WEBP, BMP, SVG, TIFF, ICO
- **Semantic Search** - pgvector-powered embeddings
- **Re-ranking** - Cohere reranker for improved relevance
- **Chunking & Tokenization** - Optimized text splitting

### 🧠 Memory & Context
- **Semantic Caching** - Response caching based on query similarity with pgvector
- **Conversation Memory** - Cross-conversation context retention via mem0
- **Message Versioning & Branching** - Tree-based conversation versioning with sibling management
- **Intelligent Context Router** - Dynamic routing with 5 modes:
  - **MemoryOnly**: Uses conversation memory
  - **DocumentsOnly**: RAG-based document retrieval
  - **VisionOnly**: Image-only analysis
  - **Hybrid**: Combined vision + document context
  - **ToolOnly**: Direct tool execution without context
- **Automatic Context Selection** - Smart detection of referential queries

### 📤 Export & Sharing
- **Export Formats**: JSON, Markdown, PDF
- **Customizable Export Options**: Include/exclude attachments, versions, metadata
- **Public Sharing** - Share conversations via unique links with OpenGraph previews
- **Conversation Management** - Rename, delete, organize
- **Version History Export** - Include edit history in exports

### 💬 Chat Features
- **Real-time Streaming** - Progressive response generation with abort support
- **File Attachments** - Up to 5 files per message (documents + images)
- **Clipboard Image Paste** - Direct image paste from clipboard with auto-naming
- **Processing Status Tracking** - Real-time document processing progress (PENDING → PROCESSING → COMPLETED/FAILED)
- **Citations Display** - Source tracking for RAG responses with relevance scores
- **Follow-up Questions** - AI-generated conversation prompts
- **Message Actions** - Edit, regenerate, copy, delete after point
- **Version Navigation** - Navigate between message versions with visual indicators
- **Image Lightbox** - Full-screen image viewing with keyboard shortcuts
- **Dark/Light Theme** - System-aware theme switching
- **Tool Selection UI** - Visual tool picker with gradient indicators

## Tech Stack

### Frontend
- **Next.js 15** - React framework with App Router
- **React 19** - Latest React features
- **TanStack Query** - Data fetching and caching
- **Tailwind CSS 4** - Utility-first styling
- **Radix UI** - Accessible components
- **Framer Motion** - Animations
- **Shiki** - Syntax highlighting

### Backend
- **PostgreSQL** - Primary database
- **Prisma** - ORM and migrations
- **pgvector** - Vector similarity search
- **Better Auth** - Authentication
- **UploadThing** - File uploads

### AI & ML
- **OpenAI API** - LLM inference with vision support
- **LangChain** - Agent orchestration
- **LangGraph** - Multi-agent workflows
- **Cohere** - Reranking
- **Tavily** - Web search
- **mem0** - Conversation memory
- **Google APIs** - YouTube Data API & Google Workspace APIs

### Document Processing
- **pdf-parse** - PDF text extraction
- **mammoth** - DOCX processing
- **word-extractor** - DOC files
- **xlsx** - Spreadsheet parsing
- **canvas** - Image manipulation
- **youtube-transcript** - YouTube caption extraction

## Architecture

**Intelligent Context Router**  
Incoming queries are analyzed for images, document attachments, and intent to determine the optimal routing strategy (Memory, Documents, Vision, Hybrid, or Tool-specific). Supports referential query detection for automatic document retrieval.

**Semantic Caching Layer**  
Implements pgvector-based similarity caching to reduce redundant API calls and improve response times for semantically similar queries.

**RAG Pipeline**  
Documents are processed through format-specific loaders, chunked with token-aware splitting, embedded, stored in pgvector, and retrieved with semantic search + Cohere reranking during inference. Supports processing status tracking and batch operations.

**Multi-Agent Orchestration**  
LangGraph-powered agent workflows enable autonomous task execution with access to tools (RAG, web search, YouTube, Google Suite) while maintaining conversation state. Deep research uses a multi-phase workflow with quality evaluation.

**Vision Processing**  
Multimodal support across all GPT models enables image analysis, OCR, and hybrid vision+document workflows through the context router.

**Google Suite Integration**  
OAuth 2.0-authenticated access to Gmail, Calendar, Drive, Docs, Sheets, and Slides with automatic token refresh and scope-based permissions.

**Message Versioning System**  
Tree-based message storage with parent-child relationships and sibling indexing enables conversation branching, version navigation, and soft deletion.

**Server-side API Proxy**  
All OpenAI API calls route through Next.js API routes, keeping user API keys encrypted (AES-256-GCM) and enabling server-side rate limiting.