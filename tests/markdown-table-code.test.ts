import test from "node:test";
import assert from "node:assert/strict";

import { classifyTableCell } from "@/components/ai-elements/response/markdownTableUtils";
import {
  countCodeLines,
  getDiffLineKind,
  isDiffLanguage,
  normalizeCodeText,
  shouldCollapseCode,
  shouldShowCodeLineNumbers,
} from "@/components/ai-elements/response/markdownCodeBlockUtils";

test("classifies check cells", () => {
  for (const value of ["yes", "Yes", " YES ", "true", "supported", "included", "available", "✓", "✔", "✅"]) {
    assert.equal(classifyTableCell(value), "check", `expected check for ${JSON.stringify(value)}`);
  }
});

test("classifies cross cells", () => {
  for (const value of ["no", "No", " NO ", "false", "unsupported", "not included", "not available", "✗", "✘", "❌", "×"]) {
    assert.equal(classifyTableCell(value), "cross", `expected cross for ${JSON.stringify(value)}`);
  }
});

test("classifies dash cells", () => {
  for (const value of ["—", "–", "-", "n/a", "N/A", " na ", "none"]) {
    assert.equal(classifyTableCell(value), "dash", `expected dash for ${JSON.stringify(value)}`);
  }
});

test("leaves real data as text (no over-inference)", () => {
  for (const value of ["", "   ", "Yes please continue", "x", "X", "+1", "-5", "Partial", "12", "$100", "See line 12"]) {
    assert.equal(classifyTableCell(value), "text", `expected text for ${JSON.stringify(value)}`);
  }
});

test("normalizes CRLF and strips one trailing newline", () => {
  assert.equal(normalizeCodeText("a\r\nb\r\n"), "a\nb");
  assert.equal(normalizeCodeText("a\rb"), "a\nb");
  assert.equal(normalizeCodeText("a\n"), "a");
  assert.equal(normalizeCodeText(""), "");
  assert.equal(normalizeCodeText("a\n\n"), "a\n");
});

test("counts code lines", () => {
  assert.equal(countCodeLines(""), 0);
  assert.equal(countCodeLines("a"), 1);
  assert.equal(countCodeLines("a\nb\nc"), 3);
});

test("collapse + line-number guards", () => {
  assert.equal(shouldCollapseCode(10, 100), false);
  assert.equal(shouldCollapseCode(31, 100), true);
  assert.equal(shouldCollapseCode(10, 4001), true);
  assert.equal(shouldShowCodeLineNumbers(1000), true);
  assert.equal(shouldShowCodeLineNumbers(1001), false);
});

test("diff detection is language-gated", () => {
  assert.equal(isDiffLanguage("language-diff"), true);
  assert.equal(isDiffLanguage("language-diff-python"), true);
  assert.equal(isDiffLanguage("language-python"), false);
  assert.equal(isDiffLanguage(undefined), false);
  assert.equal(getDiffLineKind("+ added", "language-diff"), "addition");
  assert.equal(getDiffLineKind("- removed", "language-diff"), "deletion");
  assert.equal(getDiffLineKind("+++ b/file", "language-diff"), null);
  assert.equal(getDiffLineKind("--- a/file", "language-diff"), null);
  assert.equal(getDiffLineKind("+1", "language-js"), null);
  assert.equal(getDiffLineKind("-x", "language-python"), null);
  assert.equal(getDiffLineKind("context", "language-diff"), null);
});
