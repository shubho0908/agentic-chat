-- Scope semantic cache entries by the model and reasoning effort that produced
-- them, so a cached answer is only served to the configuration that created it.
ALTER TABLE "semantic_cache" ADD COLUMN "model" TEXT,
ADD COLUMN "reasoning_effort" TEXT;
