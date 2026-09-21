import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("PDF card is rendered after assistant content and artifacts", () => {
  const source = readFileSync(join(process.cwd(), "components/chat/chatMessage.tsx"), "utf8");
  const content = source.indexOf("<MessageContentSurface");
  const artifacts = source.indexOf("<ArtifactButtons");
  const pdf = source.indexOf("<PdfDocuments", artifacts);
  assert.ok(content >= 0 && artifacts > content && pdf > artifacts);
});
