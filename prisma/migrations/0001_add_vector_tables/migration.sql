-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable: document_chunk
CREATE TABLE IF NOT EXISTS "document_chunk" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT "document_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable: semantic_cache
CREATE TABLE IF NOT EXISTS "semantic_cache" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "embedding" vector(1536),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT "semantic_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable: orchestration_job
CREATE TABLE IF NOT EXISTS "orchestration_job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "dedupe_key" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "error" TEXT,
    "attempts" INT NOT NULL DEFAULT 0,
    "max_attempts" INT NOT NULL DEFAULT 3,
    "lease_owner" TEXT,
    "last_heartbeat_at" TIMESTAMPTZ(6),
    "lease_expires_at" TIMESTAMPTZ(6),
    "next_attempt_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT "orchestration_job_pkey" PRIMARY KEY ("id")
);

-- HNSW vector indexes (Prisma cannot generate these)
CREATE INDEX IF NOT EXISTS "document_chunk_embedding_idx"
    ON "document_chunk" USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS "semantic_cache_embedding_idx"
    ON "semantic_cache" USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- GIN indexes for JSONB metadata
CREATE INDEX IF NOT EXISTS "document_chunk_metadata_idx"
    ON "document_chunk" USING GIN (metadata);

-- Expression indexes on JSONB fields
CREATE INDEX IF NOT EXISTS "document_chunk_user_id_idx"
    ON "document_chunk" ((metadata->>'userId'));

CREATE INDEX IF NOT EXISTS "document_chunk_conversation_id_idx"
    ON "document_chunk" ((metadata->>'conversationId'));

CREATE INDEX IF NOT EXISTS "document_chunk_attachment_id_idx"
    ON "document_chunk" ((metadata->>'attachmentId'));

-- Full-text search GIN index
CREATE INDEX IF NOT EXISTS "document_chunk_content_fts_idx"
    ON "document_chunk" USING GIN (to_tsvector('english', content));

-- Semantic cache standard indexes
ALTER TABLE "semantic_cache" ADD COLUMN IF NOT EXISTS "conversation_id" TEXT;

CREATE INDEX IF NOT EXISTS "semantic_cache_user_id_idx"
    ON "semantic_cache" ("user_id");

CREATE INDEX IF NOT EXISTS "semantic_cache_user_created_idx"
    ON "semantic_cache" ("user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "semantic_cache_user_conv_idx"
    ON "semantic_cache" ("user_id", "conversation_id");

CREATE INDEX IF NOT EXISTS "semantic_cache_created_at_idx"
    ON "semantic_cache" ("created_at");

-- Orchestration job indexes
CREATE UNIQUE INDEX IF NOT EXISTS "orchestration_job_dedupe_idx"
    ON "orchestration_job" ("type", "dedupe_key")
    WHERE "dedupe_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "orchestration_job_status_idx"
    ON "orchestration_job" ("type", "status", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "orchestration_job_retry_idx"
    ON "orchestration_job" ("type", "status", "next_attempt_at" ASC, "created_at" ASC);

