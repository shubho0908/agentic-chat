import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { createChatStreamHandler } from "@/lib/chat/streamHandler";
import type { MemoryStatus } from "@/types/chat";
import { MessageRole } from "@/lib/schemas/chat";

const empty: MemoryStatus = { hasMemories: false, hasDocuments: false, hasImages: false,
  memoryCount: 0, documentCount: 0, imageCount: 0 };

test("a confident none in a file-bearing chat sends deterministic SSE clarification, never calls answer model", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true,
    value: async () => ({ id: "now", createdAt: new Date(), parentMessageId: null, attachments: [] }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () => [{ id: "old", attachments: [{
    id: "pdf-1", fileName: "cv.pdf", fileUrl: "https://utfs.io/f/cv", fileType: "application/pdf", fileSize: 300, kind: "document",
  }] }] });
  let modelCalls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    id: "test", object: "chat.completion", model: "gpt-6-luna",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: '{"state":"none"}' } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  try {
    const source = createChatStreamHandler({
      messages: [{ id: "now", role: MessageRole.USER, content: "What is recursion?" }],
      model: "gpt-6-luna", apiKey: "test-key", userId: "owner", conversationId: "conv",
      memoryEnabled: false, memoryStatusInfo: empty,
      openai: { chat: { completions: { create: () => { modelCalls++; throw Error("answer model called"); } } } } as never,
    });
    const stream = new ReadableStream<Uint8Array>(source);
    const body = await new Response(stream).text();
    assert.match(body, /Were you asking about a file in this chat/);
    assert.match(body, /data: \[DONE\]/);
    assert.equal(modelCalls, 0);
  } finally {
    globalThis.fetch = original;
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
  }
});

test("classifier timeout yields deterministic clarification without answer model", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true,
    value: async () => ({ id: "now", createdAt: new Date(), parentMessageId: null, attachments: [] }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () => [{ id: "old", attachments: [{
    id: "pdf-1", fileName: "cv.pdf", fileUrl: "https://utfs.io/f/cv", fileType: "application/pdf", fileSize: 300, kind: "document",
  }] }] });
  let modelCalls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("classifier timeout"); }) as typeof fetch;
  try {
    const source = createChatStreamHandler({
      messages: [{ id: "now", role: MessageRole.USER, content: "Could you check whether his contact details are in that one?" }],
      model: "gpt-6-luna", apiKey: "test-key", userId: "owner", conversationId: "conv",
      memoryEnabled: false, memoryStatusInfo: empty,
      openai: { chat: { completions: { create: () => { modelCalls++; throw Error("answer model called"); } } } } as never,
    });
    const body = await new Response(new ReadableStream<Uint8Array>(source)).text();
    assert.match(body, /Which file in this chat did you mean/);
    assert.match(body, /data: \[DONE\]/);
    assert.equal(modelCalls, 0);
  } finally {
    globalThis.fetch = original;
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
  }
});
