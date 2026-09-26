import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { MessageRole } from "@/lib/schemas/chat";
import { getConversationResourceCatalog } from "@/lib/chat/resourceCatalog";

const now = new Date("2026-09-26T05:30:00.000Z");
const attachment = (id: string) => ({ id, kind: "document", fileName: `${id}.pdf`, fileUrl: `https://example.com/${id}.pdf`, fileType: "application/pdf", fileSize: 100 });
async function withMessageMock<T>(current: unknown, history: unknown[], run: (calls: { current: Array<{where: Record<string, unknown>}>; history: Array<{where: Record<string, unknown>; take: number}> }) => Promise<T>) {
  const first = prisma.message.findFirst;
  const many = prisma.message.findMany;
  const calls: { current: Array<{where: Record<string, unknown>}>; history: Array<{where: Record<string, unknown>; take: number}> } = { current: [], history: [] };
  Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: async (args: unknown) => { calls.current.push(args as {where: Record<string, unknown>}); return current; } });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async (args: unknown) => { calls.history.push(args as {where: Record<string, unknown>; take: number}); return history; } });
  try { return await run(calls); }
  finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
  }
}
test("root resource search includes older persisted roots beyond the prompt window with owner and time constraints", async () => {
  await withMessageMock({ id: "now", createdAt: now, parentMessageId: null, attachments: [] }, [{ id: "long-ago", attachments: [attachment("old")] }], async (calls) => {
    const result = await getConversationResourceCatalog({ conversationId: "conv", userId: "owner", currentMessageId: "now", visibleMessages: [] });
    assert.equal(result.complete, true);
    assert.deepEqual(result.resources.map((item) => item.id), ["old"]);
    assert.deepEqual(calls.current[0].where, { id: "now", conversationId: "conv", conversation: { userId: "owner" }, role: "USER", isDeleted: false });
    assert.deepEqual(calls.history[0].where.OR, [
      { createdAt: { lt: now } },
      { createdAt: now, id: { lt: "now" } },
    ]);
    assert.equal(calls.history[0].where.parentMessageId, null);
    assert.equal(calls.history[0].take, 501);
  });
});
test("edited branch refuses unverified historical IDs even if the client supplied them", async () => {
  await withMessageMock({ id: "now", createdAt: now, parentMessageId: "original", attachments: [] }, [], async (calls) => {
    const result = await getConversationResourceCatalog({ conversationId: "conv", userId: "owner", currentMessageId: "now", branchId: "branch", visibleMessages: [
      { id: "unverified", role: MessageRole.USER, content: "hi" },
    ] });
    assert.deepEqual(result.resources, []);
    assert.equal(calls.history.length, 0);
  });
  await withMessageMock(null, [], async (calls) => {
    const result = await getConversationResourceCatalog({ conversationId: "conv", userId: "owner", currentMessageId: "missing", visibleMessages: [] });
    assert.equal(result.foundCurrent, false);
    assert.equal(calls.history.length, 0);
  });
});
test("more than 500 historical attachment turns fails closed instead of implying exhaustive search", async () => {
  await withMessageMock({ id: "now", createdAt: now, parentMessageId: null, attachments: [] }, Array.from({ length: 501 }, (_, i) => ({ id: `old-${i}`, attachments: [attachment(`a-${i}`)] })), async () => {
    const result = await getConversationResourceCatalog({ conversationId: "conv", userId: "owner", currentMessageId: "now", visibleMessages: [] });
    assert.equal(result.complete, false);
    assert.equal(result.resources.length, 500);
  });
});

test("a deleted prior version and an attachment from another conversation cannot pass the scoped query", async () => {
  await withMessageMock({ id: "now", createdAt: now, parentMessageId: null, attachments: [] }, [], async (calls) => {
    await getConversationResourceCatalog({ conversationId: "conv", userId: "owner", currentMessageId: "now", visibleMessages: [] });
    assert.deepEqual(calls.history[0].where.conversation, { userId: "owner" });
    assert.equal(calls.history[0].where.conversationId, "conv");
    assert.equal(calls.history[0].where.isDeleted, false);
    assert.equal(calls.history[0].where.parentMessageId, null);
  });
});
