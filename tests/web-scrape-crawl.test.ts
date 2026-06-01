import test from "node:test";
import assert from "node:assert/strict";

import {
  extractLinks,
  formatLinksAsMarkdown,
} from "@/lib/url-scraper/scraper";
import { extractDomain } from "@/lib/utils";
import { hasWebActionIntent, shouldBypassSemanticCacheForToolIntent } from "@/lib/orchestrator/tools";

test("extractLinks resolves relative URLs, drops non-http(s), dedupes, and caps", () => {
  const html = `
    <a href="/about">About</a>
    <a href="https://other.com/x">X</a>
    <a href="mailto:a@b.com">Mail</a>
    <a href="javascript:void(0)">JS</a>
    <a href="/about#team">About anchor (dup after hash strip)</a>
    <a href="https://other.com/x">X again (dup)</a>
  `;
  const links = extractLinks(html, "https://example.com/home", 10);
  const urls = links.map((l) => l.url);

  assert.ok(urls.includes("https://example.com/about"), "relative resolved to absolute");
  assert.ok(urls.includes("https://other.com/x"), "absolute external kept");
  assert.ok(!urls.some((u) => u.startsWith("mailto")), "mailto dropped");
  assert.ok(!urls.some((u) => u.startsWith("javascript")), "javascript dropped");
  assert.equal(new Set(urls).size, urls.length, "no duplicates after hash strip");
  assert.equal(urls.filter((u) => u === "https://example.com/about").length, 1);
});

test("extractLinks honors the max cap", () => {
  const html = Array.from({ length: 20 }, (_, i) => `<a href="/p${i}">p${i}</a>`).join("");
  assert.equal(extractLinks(html, "https://example.com", 5).length, 5);
});

test("extractLinks returns empty on malformed input instead of throwing", () => {
  assert.deepEqual(extractLinks("", "https://example.com"), []);
});

test("formatLinksAsMarkdown renders labeled and bare links with indent", () => {
  const md = formatLinksAsMarkdown(
    [
      { url: "https://a.com", text: "A" },
      { url: "https://b.com", text: "" },
    ],
    10,
    "  "
  );
  assert.equal(md, "  - [A](https://a.com)\n  - https://b.com");
});

test("extractDomain strips www and returns empty on invalid input", () => {
  assert.equal(extractDomain("https://www.example.com/path"), "example.com");
  assert.equal(extractDomain("not a url"), "");
});

test("hasWebActionIntent matches URLs and whole-word scrape/crawl intent", () => {
  assert.equal(hasWebActionIntent("scrape https://example.com"), true);
  assert.equal(hasWebActionIntent("crawl my website and list links"), true);
  assert.equal(hasWebActionIntent("what is a binary tree"), false);
});

test("intent matching uses word boundaries (no substring false positives)", () => {
  assert.equal(hasWebActionIntent("explain the opposite of recursion"), false);
  assert.equal(hasWebActionIntent("tell me about cobweb diagrams"), false);
  assert.equal(
    shouldBypassSemanticCacheForToolIntent("define the opposite of mutable", []),
    false
  );
});

test("intent matching does not trigger on bare nouns ('site', 'link', 'website') without action verbs", () => {
  assert.equal(
    hasWebActionIntent("explain my website redesign goals for next quarter"),
    false,
  );
  assert.equal(
    hasWebActionIntent("what is a back link in graph theory"),
    false,
  );
  assert.equal(
    hasWebActionIntent("share a link to your screen with the team"),
    false,
  );
  assert.equal(
    hasWebActionIntent("the missing link between birds and dinosaurs"),
    false,
  );
  assert.equal(
    hasWebActionIntent("on-site interview tips"),
    false,
  );
  assert.equal(
    shouldBypassSemanticCacheForToolIntent("on-site interview tips", []),
    false,
  );
  assert.equal(
    shouldBypassSemanticCacheForToolIntent(
      "explain my website redesign goals for next quarter",
      [],
    ),
    false,
  );
});

test("intent matching still triggers on verb+noun crawl phrases", () => {
  assert.equal(hasWebActionIntent("visit the site and summarize the homepage"), true);
  assert.equal(hasWebActionIntent("follow the link in the footer"), true);
  assert.equal(hasWebActionIntent("scrape the website for product prices"), true);
  assert.equal(hasWebActionIntent("crawl this site and find every blog post"), true);
  assert.equal(hasWebActionIntent("read the article about quantum computing"), true);
});
