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

test("interrupt events are buffered separately from lifecycle events", () => {
  const mapper = createStreamEventMapper();
  const encoder = new TextEncoder();
  mapper.bufferEvent(encoder.encode('data: {"type":"tool_progress"}\n\n'), { type: "tool_progress" });
  mapper.bufferInterrupt(encoder.encode('data: {"type":"human_in_the_loop_request"}\n\n'));

  const output = mapper.takeAssistantOutput();
  assert.equal(output.events.length, 1);
  assert.equal(output.interruptEvents.length, 1);
  assert.ok(!output.eventText.includes("human_in_the_loop_request"));
});

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

  assert.equal(chunks.length, 0);
  const output = mapper.takeAssistantOutput();
  const messages = decodeSseChunks(output.events);
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


test("stream mapper buffers sensitive event payloads and artifact metadata", () => {
  const mapper = createStreamEventMapper();
  const chunks: Uint8Array[] = [];
  const writer = { enqueue: (chunk: Uint8Array) => { chunks.push(chunk); } };
  mapper.map(writer, {
    event: StreamEventType.CHAT_MODEL_STREAM,
    metadata: { langgraph_node: "agent" },
    data: { chunk: { content: '<artifact type="code" title="private-title" language="secret-lang">private-body</artifact>', additional_kwargs: { reasoning_content: "private-reasoning" } } },
  });
  mapper.map(writer, {
    event: StreamEventType.TOOL_START,
    name: ToolName.WEB_SEARCH,
    run_id: "call-1",
    metadata: { langgraph_node: "tools" },
    data: { input: { query: "private-query" } },
  });
  mapper.flush(writer);
  assert.equal(chunks.length, 0);
  const output = mapper.takeAssistantOutput();
  assert.match(output.eventText, /private-reasoning/);
  assert.match(output.eventText, /private-query/);
  assert.match(output.artifactText, /private-title/);
  assert.match(output.artifactText, /secret-lang/);
  assert.match(output.artifactText, /private-body/);
});
