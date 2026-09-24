import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CodeArtifact } from "@/components/artifacts/CodeArtifact";

test("code artifacts render an IDE-style, read-only source surface", () => {
  const html = renderToStaticMarkup(
    createElement(CodeArtifact, {
      content: "const answer: number = 42;\nconsole.log(answer);",
      language: "ts",
    }),
  );

  assert.match(html, /Read-only code viewer/);
  assert.match(html, /data-read-only="true"/);
  assert.match(html, /aria-label="Code content"/);
  assert.match(html, /contentEditable="false"/);
  assert.match(html, /hljs/);
  assert.match(html, /const/);
  assert.match(html, /2 lines/);
});

test("code artifacts expose complete light and dark editor surfaces", () => {
  const html = renderToStaticMarkup(
    createElement(CodeArtifact, {
      content: "const answer = 42;",
      language: "ts",
    }),
  );

  assert.match(html, /bg-slate-50/);
  assert.match(html, /dark:bg-zinc-950/);
  assert.match(html, /bg-slate-100/);
  assert.match(html, /dark:bg-zinc-900/);
  assert.match(html, /text-slate-800/);
  assert.match(html, /dark:text-zinc-200/);
});

test("code artifacts defer gutter DOM and highlighting while streaming", () => {
  const html = renderToStaticMarkup(
    createElement(CodeArtifact, {
      content: "const answer = 42;\nconsole.log(answer);",
      language: "ts",
      isStreaming: true,
    }),
  );

  assert.match(html, /Streaming…/);
  assert.doesNotMatch(html, /2 lines/);
  assert.doesNotMatch(html, /class="sticky left-0/);
  assert.doesNotMatch(html, /hljs-keyword/);
});

test("code artifacts keep the line-number gutter bounded for very large files", () => {
  const html = renderToStaticMarkup(
    createElement(CodeArtifact, {
      content: Array.from({ length: 1_001 }, (_, index) => `line ${index + 1}`).join("\n"),
      language: "text",
    }),
  );

  assert.match(html, /1,001 lines/);
  assert.doesNotMatch(html, /class="sticky left-0/);
});

test("code artifacts ignore a trailing line break in line counts", () => {
  const html = renderToStaticMarkup(
    createElement(CodeArtifact, {
      content: "const answer = 42;\nconsole.log(answer);\n",
      language: "ts",
    }),
  );

  assert.match(html, /2 lines/);
  assert.doesNotMatch(html, />3<\//);
});
