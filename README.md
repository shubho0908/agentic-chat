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
- **GPT-5 Series**: GPT-5, GPT-5 Mini, GPT-5 Nano (with reasoning)
- **GPT-4.1 Series**: GPT-4.1, GPT-4.1 Mini, GPT-4.1 Nano
- **GPT-4o Series**: GPT-4o, GPT-4o Mini
- Context windows up to 1M+ tokens

### 🛠️ Specialized Tools

#### Web Search
- Real-time internet search via Tavily API

### YouTube Analysis
- Transcript extraction, chapter parsing, and video insights

#### Deep Research
- Multi-step autonomous research with usage limits (3/month)

### 📚 Document Intelligence (RAG)
- **Multi-format Support**: PDF, DOCX, DOC, TXT, XLS, XLSX, CSV, MD
- **Image Processing**: JPG, PNG, GIF, WEBP, BMP, SVG, TIFF, ICO
- **Semantic Search** - pgvector-powered embeddings
- **Re-ranking** - Cohere reranker for improved relevance
- **Chunking & Tokenization** - Optimized text splitting

### 🧠 Memory & Context
- **Semantic Caching** - Response caching based on similarity
- **Conversation Memory** - Cross-conversation context retention via mem0
- **Message Versioning** - Branch conversations with version history
- **Context Router** - Intelligent context injection

### 📤 Export & Sharing
- **Export Formats**: JSON, Markdown, PDF
- **Public Sharing** - Share conversations via unique links
- **Conversation Management** - Rename, delete, organize

### 💬 Chat Features
- **Real-time Streaming** - Progressive response generation
- **File Attachments** - Up to 5 files per message
- **Citations Display** - Source tracking for RAG responses
- **Follow-up Questions** - AI-generated conversation prompts
- **Message Actions** - Edit, regenerate, copy
- **Image Lightbox** - Full-screen image viewing
- **Dark/Light Theme** - System-aware theme switching

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
- **OpenAI API** - LLM inference
- **LangChain** - Agent orchestration
- **LangGraph** - Multi-agent workflows
- **Cohere** - Reranking
- **Tavily** - Web search
- **mem0** - Conversation memory

### Document Processing
- **pdf-parse** - PDF text extraction
- **mammoth** - DOCX processing
- **word-extractor** - DOC files
- **xlsx** - Spreadsheet parsing
- **canvas** - Image manipulation

## Architecture

**Query Classification & Routing**  
Incoming queries are analyzed and routed to specialized handlers (direct response, RAG, web search, YouTube, deep research) based on intent classification.

**Semantic Caching Layer**  
Implements similarity-based caching to reduce redundant API calls and improve response times for similar queries.

**RAG Pipeline**  
Documents are processed through OCR (if needed), chunked, embedded, stored in pgvector, and retrieved with semantic search + reranking during inference.

**Multi-Agent Orchestration**  
LangGraph-powered agent workflows enable autonomous task execution with access to tools (RAG, web search, YouTube) while maintaining conversation state.

**Server-side API Proxy**  
All OpenAI API calls route through Next.js API routes, keeping user API keys secure and enabling server-side rate limiting.