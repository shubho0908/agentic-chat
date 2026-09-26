import assert from "node:assert/strict";
import test from "node:test";

import {
  extractUrls,
  getHrefFromCandidateUrl,
  splitTrailingPunctuation,
} from "@/lib/url-normalization";

test("normalizes sentence punctuation and schemeless preview URLs", () => {
  assert.deepEqual(extractUrls("Visit https://example.com). Then try www.example.com/path"), [
    "https://example.com/",
    "https://www.example.com/path",
  ]);
  assert.deepEqual(splitTrailingPunctuation("https://example.com/a_(b))"), {
    normalizedUrl: "https://example.com/a_(b)",
    trailingText: ")",
  });
});

test("preserves balanced parentheses and URL query components", () => {
  assert.deepEqual(extractUrls("https://example.com/a_(b) and https://example.com/?q=a,b#section"), [
    "https://example.com/a_(b)",
    "https://example.com/?q=a,b#section",
  ]);
});

test("deduplicates normalized variants and rejects malformed candidates", () => {
  assert.deepEqual(
    extractUrls("https://www.example.com) www.example.com https://www.example.com"),
    ["https://www.example.com/"],
  );
  assert.equal(getHrefFromCandidateUrl("https://example.com:bad"), null);
  assert.equal(getHrefFromCandidateUrl("https://?q=1"), null);
  assert.equal(getHrefFromCandidateUrl("ftp://example.com/file"), null);
});

test("normalizes a Markdown link destination without its closing delimiter", () => {
  assert.deepEqual(extractUrls("[site](https://example.com)"), ["https://example.com/"]);
});
