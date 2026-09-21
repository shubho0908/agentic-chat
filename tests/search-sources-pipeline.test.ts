import test from "node:test";
import assert from "node:assert/strict";

import { createStreamEventMapper } from "@/lib/orchestrator/streaming";
import {
  CustomEventName,
  StreamEventType,
} from "@/lib/orchestrator/constants";
import { ToolName } from "@/lib/tools/constants";
import { extractMetadataFromProgress } from "@/hooks/chat/streamingHandler";

function decodeSseChunks(chunks: Uint8Array[]): Array<Record<string, unknown>> {
  const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString(
    "utf8"
  );
  return text
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => JSON.parse(block.replace(/^data: /, "")));
}

test("search_sources custom event is forwarded as tool_progress carrying details.sources", () => {
  const mapper = createStreamEventMapper();
  const chunks: Uint8Array[] = [];
  const writer = {
    enqueue: (chunk: Uint8Array) => {
      chunks.push(chunk);
    },
  };

  mapper.map(writer, {
    event: StreamEventType.CUSTOM_EVENT,
    name: CustomEventName.SEARCH_SOURCES,
    data: {
      type: CustomEventName.SEARCH_SOURCES,
      tool: ToolName.WEB_SEARCH,
      sources: [
        {
          title: "Example",
          url: "https://example.test/article",
          snippet: "Relevant snippet",
          domain: "example.test",
        },
      ],
    },
  });

  const messages = decodeSseChunks(chunks);
  const progress = messages.find(
    (message) =>
      message.type === "tool_progress" &&
      typeof message.details === "object" &&
      message.details !== null &&
      Array.isArray((message.details as Record<string, unknown>).sources)
  );
  assert.ok(progress, "expected a tool_progress event carrying details.sources");
  assert.equal(
    ((progress as Record<string, unknown>).details as Record<string, unknown[]>)
      .sources.length,
    1
  );
});

test("progress metadata accumulates sources across events instead of last-wins", () => {
  const first = extractMetadataFromProgress(
    {
      details: {
        sources: [{ title: "A", url: "https://a.test", domain: "a.test" }],
      },
    },
    undefined
  );
  const merged = extractMetadataFromProgress(
    {
      details: {
        sources: [{ title: "B", url: "https://b.test", domain: "b.test" }],
      },
    },
    first
  );

  assert.deepEqual(
    (merged?.sources ?? []).map((source) => source.url),
    ["https://a.test", "https://b.test"]
  );
});

test("progress metadata does not duplicate a repeated source url", () => {
  const first = extractMetadataFromProgress(
    {
      details: {
        sources: [{ title: "A", url: "https://a.test", domain: "a.test" }],
      },
    },
    undefined
  );
  const merged = extractMetadataFromProgress(
    {
      details: {
        sources: [{ title: "A again", url: "https://a.test", domain: "a.test" }],
      },
    },
    first
  );

  assert.deepEqual(
    (merged?.sources ?? []).map((source) => source.url),
    ["https://a.test"]
  );
});
