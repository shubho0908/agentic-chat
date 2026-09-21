import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("native PDF frames are not sandboxed", () => {
  const source = readFileSync(join(process.cwd(), "components/chat/documentPreview.tsx"), "utf8");
  const pdfBranch = source.match(/isPDF \? \(([\s\S]*?)\) : isTextFile/)?.[1] ?? "";
  assert.match(pdfBranch, /<EmbeddedFrame/);
  assert.doesNotMatch(pdfBranch, /sandbox=/);
});

test("Office web viewer keeps a scoped sandbox", () => {
  const source = readFileSync(join(process.cwd(), "components/chat/documentPreview.tsx"), "utf8");
  const officeBranch = source.match(/isOfficeDoc \? \(([\s\S]*?)\) : \(/)?.[1] ?? "";
  assert.match(officeBranch, /sandbox="allow-scripts allow-popups allow-same-origin allow-forms"/);
});
