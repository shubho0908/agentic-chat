import assert from "node:assert/strict";
import test from "node:test";
import { shouldBypassSemanticCacheForToolIntent } from "@/lib/orchestrator/cacheIntent";

test("fresh and tool-backed requests bypass semantic caching", () => {
  for (const query of [
    "Search the web for current TypeScript releases",
    "Deep research the latest battery technology",
    "Read https://example.com/report",
    "Fetch active projects from Notion",
    "Create a PDF summary",
  ]) {
    assert.equal(shouldBypassSemanticCacheForToolIntent(query), true, query);
  }
  assert.equal(shouldBypassSemanticCacheForToolIntent("Explain a binary search tree"), false);
});
