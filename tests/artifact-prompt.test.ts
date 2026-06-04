import test from "node:test";
import assert from "node:assert/strict";

import {
  ARTIFACT_QUALITY_PROMPT,
  DEFAULT_ASSISTANT_PROMPT,
} from "@/lib/prompts";
import { buildSystemPrompt } from "@/lib/orchestrator/nodes/agent";

test("direct and orchestrated chat share the same artifact quality contract", () => {
  const orchestratorPrompt = buildSystemPrompt([]);

  assert.ok(DEFAULT_ASSISTANT_PROMPT.includes(ARTIFACT_QUALITY_PROMPT));
  assert.ok(orchestratorPrompt.includes(ARTIFACT_QUALITY_PROMPT));
});

test("artifact quality contract encodes renderer-safe runtime limits", () => {
  assert.match(ARTIFACT_QUALITY_PROMPT, /Tailwind utilities are available automatically/);
  assert.match(ARTIFACT_QUALITY_PROMPT, /do not add Tailwind CDN scripts/i);
  assert.match(ARTIFACT_QUALITY_PROMPT, /export default/);
  assert.match(ARTIFACT_QUALITY_PROMPT, /Do not import unsupported packages/);
  assert.match(ARTIFACT_QUALITY_PROMPT, /lucide, shadcn\/ui, Radix/);
  assert.match(ARTIFACT_QUALITY_PROMPT, /Mermaid syntax inside the artifact, no code fences/);
  assert.match(ARTIFACT_QUALITY_PROMPT, /GitHub Flavored Markdown tables\/lists\/task lists/);
  assert.match(ARTIFACT_QUALITY_PROMPT, /fenced Mermaid diagrams/);
});

test("artifact quality contract requires complete polished artifacts", () => {
  assert.match(ARTIFACT_QUALITY_PROMPT, /complete, functional, and runnable\/renderable as-is/);
  assert.match(ARTIFACT_QUALITY_PROMPT, /No placeholders, TODOs/);
  assert.match(ARTIFACT_QUALITY_PROMPT, /responsive mobile\/desktop layout/);
  assert.match(ARTIFACT_QUALITY_PROMPT, /accessible contrast/);
  assert.match(ARTIFACT_QUALITY_PROMPT, /Use attached image URLs exactly/);
  assert.match(ARTIFACT_QUALITY_PROMPT, /silently self-audit/);
});
