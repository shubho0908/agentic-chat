import test from "node:test";
import assert from "node:assert/strict";

import { handleStreamingResponse } from "@/hooks/chat/streamingHandler";
import { getPersistableAssistantContent, PDF_ONLY_ASSISTANT_CONTENT } from "@/hooks/chat/conversationManager";
import { MessageRole, type Message, type MessageMetadata } from "@/lib/schemas/chat";

const PDF_A = { url: "https://utfs.io/f/a.pdf", name: "a.pdf", size: 100, pageCount: 1, title: "A" };
const PDF_B = { url: "https://utfs.io/f/b.pdf", name: "b.pdf", size: 200, pageCount: 2, title: "B" };

function sse(events: Record<string, unknown>[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function memoryStatusEvent() {
  return { type: "memory_status", hasMemories: false, memoryCount: 0 };
}

function pdfReadyEvent(pdf: typeof PDF_A) {
  return { type: "tool_progress", toolName: "create_pdf", status: "completed", message: "PDF ready", details: { pdf } };
}

interface HarnessResult {
  finalMessages: Message[];
  cacheSaves: unknown[];
}

async function runHarness(events: Record<string, unknown>[]): Promise<HarnessResult> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    if (url.includes("/api/chat/completions")) return sse(events);
    return new Response(JSON.stringify({ assistantMessageId: "saved-asst-1", messageId: "saved-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  let messages: Message[] = [];
  const cacheSaves: unknown[] = [];
  const queryClientStub = { invalidateQueries: async () => {}, refetchQueries: async () => {} };
  try {
    const result = await handleStreamingResponse(
      {
        messages: [],
        conversationId: "conv-test",
        userMessageContent: "make me a pdf please",
        userTimestamp: Date.now(),
        model: "test-model",
        abortSignal: new AbortController().signal,
        queryClient: queryClientStub as never,
      },
      {
        onMessagesUpdate: (updater) => {
          messages = updater(messages);
        },
        saveToCacheMutate: (data) => {
          cacheSaves.push(data);
        },
        onMemoryStatusUpdate: () => {},
      },
    );
    assert.equal(result.success, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { finalMessages: messages, cacheSaves };
}

function finalMetadata(messages: Message[]): MessageMetadata | undefined {
  const assistant = messages.find((m) => m.role === MessageRole.ASSISTANT);
  assert.ok(assistant, "expected an assistant message");
  return assistant.metadata;
}

test("PDF progress event merges into metadata when memory status arrived (orchestrator path)", async () => {
  const { finalMessages } = await runHarness([
    memoryStatusEvent(),
    { type: "tool_call", toolName: "create_pdf", toolCallId: "c1", args: { title: "A" } },
    pdfReadyEvent(PDF_A),
    { type: "tool_result", toolName: "create_pdf", toolCallId: "c1", result: "PDF created" },
    { content: "Bhai, PDF taiyaar hai!" },
  ]);
  const pdfs = finalMetadata(finalMessages)?.pdfs;
  assert.equal(pdfs?.length, 1);
  assert.equal(pdfs?.[0].url, PDF_A.url);
  assert.equal(pdfs?.[0].title, "A");
});

test("REGRESSION: PDF metadata merges even when no memory_status event ever arrives", async () => {
  const { finalMessages } = await runHarness([
    { type: "tool_call", toolName: "create_pdf", toolCallId: "c1", args: { title: "A" } },
    pdfReadyEvent(PDF_A),
    { content: "done" },
  ]);
  assert.equal(finalMetadata(finalMessages)?.pdfs?.length, 1);
});

test("dual-channel duplicate PDF events dedupe to one card", async () => {
  const { finalMessages } = await runHarness([
    memoryStatusEvent(),
    pdfReadyEvent(PDF_A),
    pdfReadyEvent(PDF_A),
    { content: "done" },
  ]);
  assert.equal(finalMetadata(finalMessages)?.pdfs?.length, 1);
});

test("multiple PDFs in one turn render as multiple cards", async () => {
  const { finalMessages } = await runHarness([
    memoryStatusEvent(),
    pdfReadyEvent(PDF_A),
    pdfReadyEvent(PDF_B),
    { content: "done" },
  ]);
  const pdfs = finalMetadata(finalMessages)?.pdfs;
  assert.equal(pdfs?.length, 2);
  assert.deepEqual(pdfs?.map((p) => p.url), [PDF_A.url, PDF_B.url]);
});

test("PDF-delivering turns are never saved into the semantic cache", async () => {
  const { finalMessages, cacheSaves } = await runHarness([
    memoryStatusEvent(),
    pdfReadyEvent(PDF_A),
    { content: "PDF summary answer" },
  ]);
  assert.equal(finalMetadata(finalMessages)?.pdfs?.length, 1);
  assert.equal(cacheSaves.length, 0);
});

test("PDF-only messages still persist so the card survives a refresh", () => {
  const metadata: MessageMetadata = { pdfs: [PDF_A] };
  assert.equal(getPersistableAssistantContent("", metadata), PDF_ONLY_ASSISTANT_CONTENT);
  assert.equal(getPersistableAssistantContent("   ", metadata), PDF_ONLY_ASSISTANT_CONTENT);
  assert.equal(getPersistableAssistantContent("", undefined), null);
  assert.equal(getPersistableAssistantContent("text", undefined), "text");
});
