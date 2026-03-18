import test from "node:test";
import assert from "node:assert/strict";

import { isMermaidCodeBlock, shouldRenderMarkdownContent } from "@/lib/markdown/rendering";

test("detects common markdown syntax", () => {
  assert.equal(shouldRenderMarkdownContent("1. Distance metric"), true);
  assert.equal(shouldRenderMarkdownContent("> quoted text"), true);
  assert.equal(shouldRenderMarkdownContent("plain sentence"), false);
});

test("detects display math as markdown", () => {
  assert.equal(
    shouldRenderMarkdownContent("$$ d_E(u,v) = \\|u-v\\|_2 $$"),
    true,
  );
});

test("detects inline math as markdown", () => {
  assert.equal(
    shouldRenderMarkdownContent("The score is $x^2 + y^2$ for this point."),
    true,
  );
});

test("does not misclassify currency as markdown", () => {
  assert.equal(
    shouldRenderMarkdownContent("The API plan costs $100 per month."),
    false,
  );
});

test("detects mermaid fences", () => {
  assert.equal(isMermaidCodeBlock("language-mermaid"), true);
  assert.equal(isMermaidCodeBlock("language-mermaidjs"), true);
  assert.equal(isMermaidCodeBlock("hljs language-mermaid"), true);
  assert.equal(isMermaidCodeBlock("language-mermaid hljs"), true);
  assert.equal(isMermaidCodeBlock("language-js"), false);
});
