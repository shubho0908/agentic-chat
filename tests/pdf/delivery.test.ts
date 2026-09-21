import test from "node:test";
import assert from "node:assert/strict";

import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { UTApi } from "uploadthing/server";

import { CallbackManager } from "@langchain/core/callbacks/manager";
import { createPdfTool } from "@/lib/tools/pdf";
import { createToolNode } from "@/lib/orchestrator/nodes/tools";
import { createStreamEventMapper } from "@/lib/orchestrator/streaming";

const pdfInput = {
  title: "Hanuman Ansh (2026): Box-Office Collection",
  sections: [
    {
      heading: "Overview",
      blocks: [{ type: "paragraph", text: "Test **bold** and *italic* body." }],
    },
  ],
};

function stubUploadThing() {
  const original = (UTApi.prototype as { uploadFiles: unknown }).uploadFiles;
  (UTApi.prototype as { uploadFiles: unknown }).uploadFiles = async (file: File) => ({
    data: {
      ufsUrl: `https://utfs.io/f/${file.name}`,
      name: file.name,
      size: file.size,
      key: "test-key",
      url: `https://utfs.io/f/${file.name}`,
    },
    error: null,
  });
  return () => {
    (UTApi.prototype as { uploadFiles: unknown }).uploadFiles = original;
  };
}

const TestState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
});

async function runGraphAndCollectSse(
  tools: DynamicStructuredTool[],
  firstCalls: { name: string; args: Record<string, unknown>; id: string }[],
): Promise<string[]> {
  const toolNode = createToolNode(tools, { model: "test-model" });
  let round = 0;
  const agent = async () => {
    round += 1;
    if (round === 1) {
      return { messages: [new AIMessage({ content: "", tool_calls: firstCalls })] };
    }
    return { messages: [new AIMessage({ content: "Bhai, PDF taiyaar hai!" })] };
  };
  const graph = new StateGraph(TestState)
    .addNode("agent", agent)
    .addNode("tools", toolNode as never)
    .addEdge("__start__", "agent")
    .addConditionalEdges(
      "agent",
      (state) => {
        const last = state.messages[state.messages.length - 1] as AIMessage;
        return last.tool_calls && last.tool_calls.length > 0 ? "tools" : END;
      },
      { tools: "tools", [END]: END },
    )
    .addEdge("tools", "agent")
    .compile();

  const chunks: string[] = [];
  const writer = { enqueue: (chunk: Uint8Array) => chunks.push(new TextDecoder().decode(chunk)) };
  const mapper = createStreamEventMapper();
  const stream = await graph.streamEvents(
    { messages: [] },
    { version: "v2", configurable: { thread_id: `test-${Date.now()}-${Math.random()}` } },
  );
  for await (const event of stream) {
    mapper.map(writer as never, event as Record<string, unknown>);
  }
  mapper.flush(writer as never);
  return chunks;
}

function pdfReadyEvents(chunks: string[]): Record<string, unknown>[] {
  return chunks
    .filter((chunk) => chunk.includes('"PDF ready"'))
    .map((chunk) => JSON.parse(chunk.replace(/^data: /, "").trim()) as Record<string, unknown>);
}

test("orchestrator stream delivers a PDF card event for a successful create_pdf call", async () => {
  const restore = stubUploadThing();
  try {
    const chunks = await runGraphAndCollectSse(
      [createPdfTool as never],
      [{ name: "create_pdf", args: pdfInput, id: "call_pdf" }],
    );
    const ready = pdfReadyEvents(chunks);
    assert.equal(ready.length, 2, "custom event + tool-result artifact both deliver");
    const details = ready[0].details as { pdf: { url: string; name: string } };
    assert.match(details.pdf.url, /^https:\/\/utfs\.io\/f\/.*\.pdf$/);
    const toolResult = chunks.find(
      (chunk) => chunk.includes('"tool_result"') && chunk.includes("create_pdf"),
    );
    assert.ok(toolResult, "expected a create_pdf tool result");
    assert.match(toolResult, /PDF created/);
  } finally {
    restore();
  }
});

test("the card survives custom events being completely lost (artifact channel)", async () => {
  // Simulates runtimes where dispatchCustomEvent silently no-ops: the file
  // only travels as a ToolMessage artifact on the deterministic data channel.
  const artifactOnlyTool = new DynamicStructuredTool({
    name: "create_pdf",
    description: "probe",
    schema: z.object({ title: z.string() }),
    responseFormat: "content_and_artifact",
    func: async (input) => [
      `PDF created: "${input.title}". The user has received a download card.`,
      {
        pdf: {
          url: "https://utfs.io/f/artifact-only.pdf",
          name: "artifact-only.pdf",
          size: 100,
          pageCount: 1,
          title: input.title,
        },
      },
    ],
  });
  const chunks = await runGraphAndCollectSse(
    [artifactOnlyTool as never],
    [{ name: "create_pdf", args: { title: "T" }, id: "call_pdf" }],
  );
  const ready = pdfReadyEvents(chunks);
  assert.equal(ready.length, 1);
  const details = ready[0].details as { pdf: { url: string } };
  assert.equal(details.pdf.url, "https://utfs.io/f/artifact-only.pdf");
});

test("create_pdf dispatches the card event through explicit config without any run context", async () => {
  const restore = stubUploadThing();
  const received: { name: string; payload: unknown }[] = [];
  const callbacks = new CallbackManager("test-parent-run", {
    handlers: [
      {
        handleCustomEvent: (name: string, payload: unknown) => {
          received.push({ name, payload });
        },
      } as never,
    ],
  });
  try {
    const [content, artifact] = (await createPdfTool.func(
      pdfInput,
      undefined as never,
      { callbacks } as never,
    )) as [string, { pdf: { url: string } }];
    assert.match(content, /PDF created/);
    assert.ok(artifact?.pdf?.url, "artifact carries the file");
    assert.equal(received.length, 1);
    assert.equal(received[0].name, "pdf_file");
  } finally {
    restore();
  }
});

test("create_pdf returns the failure as content with a null artifact", async () => {
  const [content, artifact] = (await createPdfTool.func(
    { title: "", sections: [] },
    undefined as never,
    {} as never,
  )) as [string, unknown];
  assert.match(content, /PDF creation failed/);
  assert.equal(artifact, null);
});
