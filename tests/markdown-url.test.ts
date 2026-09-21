import test from "node:test";
import assert from "node:assert/strict";

import {
  isSafeMarkdownImageSrc,
  markdownUrlTransform,
} from "@/lib/markdown/url";

test("url transform keeps http, https, mailto and relative links", () => {
  for (const url of [
    "https://example.com/page",
    "http://example.com",
    "mailto:a@b.com",
    "/local/path",
    "#anchor",
    "relative/page",
  ]) {
    assert.equal(markdownUrlTransform(url), url, url);
  }
});

test("url transform strips scriptable and data schemes", () => {
  for (const url of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ]) {
    assert.equal(markdownUrlTransform(url), "", url);
  }
});

test("image src allows https and same-origin paths only", () => {
  assert.equal(isSafeMarkdownImageSrc("https://cdn.example.com/a.png"), true);
  assert.equal(isSafeMarkdownImageSrc("/uploads/a.png"), true);
  for (const src of [
    "http://example.com/a.png",
    "data:image/png;base64,AAAA",
    "javascript:alert(1)",
    "//protocol-relative.example.com/a.png",
    "",
    undefined,
  ]) {
    assert.equal(isSafeMarkdownImageSrc(src), false, String(src));
  }
});
