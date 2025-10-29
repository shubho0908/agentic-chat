# Setup Guide

## Prerequisites

- Node.js 18+ and pnpm
- PostgreSQL database with pgvector extension
- Google OAuth credentials
- OpenAI API key (users provide their own via BYOK)

## Installation

1. **Clone and install dependencies**
```bash
git clone https://github.com/shubho0908/agentic-chat.git
cd agentic-chat
pnpm install
```

2. **Setup environment variables**
```bash
cp .env.example .env
```

3. **Configure required environment variables**

Edit `.env` and set:

```bash
# Encryption (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY=your-64-character-hex-key

# Database
DATABASE_URL=postgresql://user:password@host-pooler:5432/dbname
DIRECT_DATABASE_URL=postgresql://user:password@host:5432/dbname

# Auth
BETTER_AUTH_SECRET=your-secret  # Generate with: openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# Mem0 (AI Memory)
MEM0_API_KEY=m0-xxx

# pgvector
EMBEDDING_MODEL=text-embedding-3-large
EMBEDDING_DIMENSIONS=3072

# UploadThing
UPLOADTHING_TOKEN=your-token
```

4. **Setup database**
```bash
pnpm db:push
```

## Optional Services

Configure these in `.env` for additional features:

- **COHERE_API_KEY** - Enhanced RAG retrieval with reranking
- **TAVILY_API_KEY** - Web search capability
- **YOUTUBE_API_KEY** - YouTube metadata enrichment

## Running the App

**Development**
```bash
pnpm dev
```

**Production**
```bash
pnpm build
pnpm start
```

**Database Studio**
```bash
pnpm db:studio
```

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (dev)
   - `https://yourdomain.com/api/auth/callback/google` (prod)
4. Add scopes:
   - `email`
   - `profile`
   - `gmail.readonly`
   - `gmail.send`
   - `gmail.modify`
   - `gmail.labels`
   - Google Calendar, Drive, Docs, Sheets, Slides (optional)

## Database Requirements

Your PostgreSQL database must have:
- pgvector extension enabled: `CREATE EXTENSION IF NOT EXISTS vector;`
- pgvector >= 0.7.0 for 3072-dimension embeddings
- Check version: `SELECT extversion FROM pg_extension WHERE extname = 'vector';`

## Troubleshooting

**Database connection issues**
- Ensure pgvector extension is enabled
- For Neon: Use pooled URL for DATABASE_URL, direct URL for DIRECT_DATABASE_URL

**OAuth issues**
- Verify redirect URIs match exactly
- Check that required scopes are enabled in Google Cloud Console

**Build issues**
- Clear `.next` folder and rebuild
- Ensure all required environment variables are set
