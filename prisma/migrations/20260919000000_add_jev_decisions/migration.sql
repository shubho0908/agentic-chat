-- Durable store for redacted Jev decision records (all checkpoints).
-- Metadata only: no user content, no raw evaluation state.
CREATE TABLE "jev_decisions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "checkpoint" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "probabilities" JSONB,
    "confidence" DOUBLE PRECISION,
    "fallback_used" BOOLEAN NOT NULL,
    "fallback_reason" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "latency_ms" INTEGER NOT NULL,
    "request_id" TEXT,
    "conversation_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jev_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "jev_decisions_checkpoint_created_idx" ON "jev_decisions"("checkpoint", "created_at" DESC);
CREATE INDEX "jev_decisions_created_at_idx" ON "jev_decisions"("created_at");
