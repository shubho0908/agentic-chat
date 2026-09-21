import test from "node:test";
import assert from "node:assert/strict";

import { parseInlineMarkdown, sanitizePdfText, splitScriptRuns, isSafeHttpUrl } from "@/lib/pdf/text";

test("sanitizePdfText strips emoji, controls, format chars and lone surrogates", () => {
  const dirty = "Hello 😀 world hidden‍\uD800ok";
  assert.equal(sanitizePdfText(dirty), "Hello  world hiddenok");
});

test("sanitizePdfText keeps Devanagari and collapses blank lines", () => {
  const input = "पहला पैरा\n\n\n\n\nदूसरा पैरा";
  assert.equal(sanitizePdfText(input), "पहला पैरा\n\nदूसरा पैरा");
});

test("splitScriptRuns separates Devanagari from Latin", () => {
  const runs = splitScriptRuns("Hello नमस्ते world");
  assert.deepEqual(runs, [
    { text: "Hello ", devanagari: false },
    { text: "नमस्ते", devanagari: true },
    { text: " world", devanagari: false },
  ]);
});

test("parseInlineMarkdown parses bold, italic, code and links", () => {
  const segments = parseInlineMarkdown("A **bold** *it* `code` [site](https://example.com) end");
  assert.deepEqual(segments, [
    { text: "A " },
    { text: "bold", bold: true },
    { text: " " },
    { text: "it", italic: true },
    { text: " " },
    { text: "code", code: true },
    { text: " " },
    { text: "site", link: "https://example.com" },
    { text: " end" },
  ]);
});

test("parseInlineMarkdown rejects non-http link targets as plain text", () => {
  const segments = parseInlineMarkdown("click [me](javascript:alert(1))");
  assert.equal(segments.some((s) => s.link), false);
});

test("isSafeHttpUrl accepts http(s) and rejects other schemes", () => {
  assert.equal(isSafeHttpUrl("https://example.com/x.png"), true);
  assert.equal(isSafeHttpUrl("http://example.com"), true);
  assert.equal(isSafeHttpUrl("ftp://example.com"), false);
  assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpUrl("not a url"), false);
});
