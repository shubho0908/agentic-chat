import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { routeContext } from "@/lib/contextRouter";
import { validateResourceDecision, type DecideResources } from "@/lib/chat/semanticResourceSelection";
import type { ResourceCandidate } from "@/lib/chat/resourceSelection";
import { MessageRole } from "@/lib/schemas/chat";

const pdf: ResourceCandidate = { id: "pdf", kind: "document", current: false, messageId: "old-pdf", fileName: "resume.pdf", fileUrl: "https://utfs.io/f/pdf", fileType: "application/pdf", fileSize: 100 };
const image: ResourceCandidate = { id: "image", kind: "image", current: false, messageId: "later-image", fileName: "photo.png", fileUrl: "https://utfs.io/f/image", fileType: "image/png", fileSize: 100 };
const another: ResourceCandidate = { ...image, id: "another", messageId: "another-image", fileName: "another.png" };

test("semantic selection validates exact IDs, allowed kinds, counts and ambiguity", () => {
  assert.equal(validateResourceDecision({ state: "selected", ids: ["image", "alien"] }, [pdf, image]).state, "ambiguous");
  assert.equal(validateResourceDecision({ state: "selected", ids: ["image", "image"] }, [pdf, image]).state, "ambiguous");
  assert.equal(validateResourceDecision({ state: "selected", ids: [] }, [pdf]).state, "ambiguous");
  assert.equal(validateResourceDecision({ state: "selected", ids: Array.from({ length: 6 }, () => "image") }, [image]).state, "ambiguous");
  assert.equal(validateResourceDecision({ state: "selected", ids: ["pdf", "image"] }, [pdf, image]).state, "selected");
  assert.equal(validateResourceDecision({ state: "ambiguous" }, [pdf, image, another]).state, "ambiguous");
});

async function withCatalog(run: (queries: { historical: number; calls: string[] }, decision: DecideResources) => Promise<void>) {
  const first = prisma.message.findFirst, many = prisma.message.findMany, find = prisma.attachment.findMany, raw = prisma.$queryRaw;
  const queries = { historical: 0, calls: [] as string[] };
  Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: async (args: { select?: { attachments?: unknown; createdAt?: unknown } }) =>
    args.select?.attachments ? { id: "now", createdAt: new Date(), parentMessageId: null, attachments: [] } :
    args.select?.createdAt ? { id: "now", createdAt: new Date(), parentMessageId: null, attachments: [] } : { id: "old-pdf" } });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () => {
    queries.historical++;
    return [{ id: "later-image", attachments: [image] }, { id: "old-pdf", attachments: [pdf] }];
  } });
  Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: async () => [{ id: pdf.id, fileName: pdf.fileName, chunkCount: 1 }] });
  Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: async () => [{ id: "pdf:0", attachment_id: "pdf", file_name: "resume.pdf", chunk_index: 0, page: 1, content: "PDF FULL CONTENT" }] });
  const decision: DecideResources = async (input) => {
    queries.calls.push(input.phase);
    if (input.phase === "intent") return { state: "selected", ids: [] };
    return { state: "selected", ids: ["pdf", "image"] };
  };
  try { await run(queries, decision); }
  finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
    Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: find });
    Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: raw });
  }
}

test("historical image and PDF are resolved across languages without phrase rules", async () => {
  await withCatalog(async (queries, decision) => {
    for (const query of [
      "Is image mein aur maine jo PDF diya tha vo dono mein koi fark hai kya?",
      "Compare the image and PDF I uploaded.",
      "比較我之前傳的照片和 PDF 有何不同？",
      "قارن الصورة مع ملف PDF الذي أرسلته سابقاً",
      "तस्वीर और पिछली PDF में क्या अंतर है?",
    ]) {
      const result = await routeContext(query, "owner", [
        { role: MessageRole.USER, content: "Old PDF" },
        { role: MessageRole.ASSISTANT, content: "Answer" },
        { role: MessageRole.USER, content: "Unrelated question" },
        { role: MessageRole.ASSISTANT, content: "Answer" },
        { role: MessageRole.USER, content: "Image question" },
        { role: MessageRole.ASSISTANT, content: "Image answer" },
      ], "conv", null, false, { currentMessageId: "now", decideResources: decision });
      assert.deepEqual(result.metadata.documentEvidenceIds, ["pdf"], query + " calls=" + JSON.stringify(queries.calls) + " context=" + result.context);
      assert.deepEqual(result.metadata.historicalImageFiles?.map(({ id }) => id), ["image"]);
      assert.match(result.context, /PDF FULL CONTENT/);
    }
    assert.equal(queries.historical, 5);
    assert.deepEqual(queries.calls, Array.from({ length: 5 }, () => ["intent", "selection"]).flat());
  });
});

test("semantic none avoids catalog traversal on unrelated turns", async () => {
  await withCatalog(async (queries) => {
    for (const query of ["What is recursion?", "今天的天气怎么样？", "كم الساعة الآن؟"]) {
      await routeContext(query, "owner", [], "conv", null, false, {
        currentMessageId: "now", decideResources: async () => ({ state: "none" }),
      });
    }
    assert.equal(queries.historical, 0);
  });
});

test("uncertain or invalid semantic selections fail closed", async () => {
  await withCatalog(async (queries) => {
    for (const decision of [
      async () => ({ state: "ambiguous" as const }),
      async (input: Parameters<DecideResources>[0]) => input.phase === "intent" ? { state: "selected" as const, ids: [] } : { state: "selected" as const, ids: ["alien"] },
      async () => { throw new Error("decision failed"); },
    ]) {
      const result = await routeContext("比較這兩份資料", "owner", [], "conv", null, false, { currentMessageId: "now", decideResources: decision });
      assert.equal(result.metadata.documentEvidenceIds, undefined);
      assert.equal(result.metadata.documentContextState, "unavailable");
      assert.match(result.context, /document_processing_notice/);
    }
    assert.equal(queries.historical, 1);
  });
});

test("new image plus historical PDF selects both under semantic decision", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany,
    find = prisma.attachment.findMany, raw = prisma.$queryRaw;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: async (args: { select?: { attachments?: unknown; createdAt?: unknown } }) =>
    args.select?.attachments ? { id: "now", createdAt: new Date(), parentMessageId: null, attachments: [{ ...image, current: true, messageId: "now" }] } :
    args.select?.createdAt ? { id: "now", createdAt: new Date(), parentMessageId: null, attachments: [image] } : { id: "old-pdf" } });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () => [{ id: "old-pdf", attachments: [pdf] }] });
  Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: async () => [{ id: pdf.id, fileName: pdf.fileName, chunkCount: 1 }] });
  Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: async () => [{ id: "pdf:0", attachment_id: "pdf", file_name: "resume.pdf", chunk_index: 0, page: 1, content: "PDF FULL CONTENT" }] });
  try {
    const result = await routeContext([{ type: "text", text: "この画像と前に送ったPDFを比較して" },
      { type: "image_url", image_url: { url: image.fileUrl } }], "owner", [], "conv", null, false,
    { currentMessageId: "now", decideResources: async (input) => input.phase === "intent" ? { state: "selected", ids: [] } : { state: "selected", ids: ["pdf", "image"] } });
    assert.deepEqual(result.metadata.documentEvidenceIds, ["pdf"]);
    assert.deepEqual(result.metadata.selectedCurrentImageFiles?.map(({ id }) => id), ["image"]);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
    Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: find });
    Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: raw });
  }
});

test("negative semantic intent overrides lexical history scan even when query says PDF", async () => {
  await withCatalog(async (queries) => {
    const result = await routeContext("What is a PDF?", "owner", [], "conv", null, false,
      { currentMessageId: "now", decideResources: async () => ({ state: "none" }) });
    assert.equal(queries.historical, 0);
    assert.equal(result.metadata.documentEvidenceIds, undefined);
  });
});

test("duplicate catalog IDs cannot silently bind the wrong message", () => {
  assert.equal(validateResourceDecision({ state: "selected", ids: ["image"] },
    [image, { ...image, messageId: "different-turn" }]).state, "ambiguous");
});

test("failed intent classification does not scan history", async () => {
  await withCatalog(async (queries) => {
    const result = await routeContext("我之前的图片和文件？", "owner", [], "conv", null, false,
      { currentMessageId: "now", decideResources: async () => { throw new Error("unavailable"); } });
    assert.equal(queries.historical, 0);
    assert.match(result.context, /document_processing_notice/);
  });
});

test("model valid-but-uncorroborated IDs are rejected", () => {
  const q = "Compare these two uploads";
  assert.equal(validateResourceDecision({ state: "selected", ids: ["image"] }, [image, another], q).state, "ambiguous");
  assert.equal(validateResourceDecision({ state: "selected", ids: ["pdf", "image"] }, [pdf, image, another], q).state, "ambiguous");
  assert.equal(validateResourceDecision({ state: "selected", ids: ["pdf", "image"] }, [pdf, image], q).state, "selected");
  assert.equal(validateResourceDecision({ state: "selected", ids: ["image"] }, [pdf, image], q).state, "selected");
});

test("named attachments must match exactly and duplicates fail closed", () => {
  const q = "比較 resume.pdf 和 photo.png";
  assert.equal(validateResourceDecision({ state: "selected", ids: ["pdf"] }, [pdf, image], q).state, "ambiguous");
  assert.equal(validateResourceDecision({ state: "selected", ids: ["pdf", "image"] }, [pdf, image], q).state, "selected");
  assert.equal(validateResourceDecision({ state: "selected", ids: ["pdf"] }, [pdf, { ...pdf, id: "pdf-2", messageId: "other" }], "resume.pdf").state, "ambiguous");
});

test("same-turn subset and cross-turn same-kind are not deterministic", () => {
  const inTurn = { ...pdf, id: "second", messageId: pdf.messageId, fileName: "second.pdf" };
  assert.equal(validateResourceDecision({ state: "selected", ids: ["pdf"] }, [pdf, inTurn], "Compare the two").state, "ambiguous");
  assert.equal(validateResourceDecision({ state: "selected", ids: ["pdf", "second"] }, [pdf, inTurn], "Compare the two").state, "selected");
  assert.equal(validateResourceDecision({ state: "selected", ids: ["pdf", "second"] },
    [pdf, { ...inTurn, messageId: "other" }], "Compare the two").state, "selected");
});

test("full catalog aggregate is structurally corroborated; partial cross-turn aggregate is not", () => {
  const q = "Compare all three uploads";
  assert.equal(validateResourceDecision({ state: "selected", ids: ["pdf", "image", "another"] },
    [pdf, image, another], q).state, "selected");
  assert.equal(validateResourceDecision({ state: "selected", ids: ["pdf", "image"] },
    [pdf, image, another], q).state, "ambiguous");
});

test("long query and duplicated explicit filename are not silently selected", () => {
  assert.equal(validateResourceDecision({ state: "selected", ids: ["pdf"] }, [pdf], "x".repeat(4001)).state, "ambiguous");
  assert.equal(validateResourceDecision({ state: "selected", ids: ["pdf"] }, [pdf,
    { ...pdf, id: "clone", messageId: "later" }], "resume.pdf").state, "ambiguous");
});

test("lexical file signal contradicting semantic none asks, not silently drops", async () => {
  await withCatalog(async (queries) => {
    const result = await routeContext("Compare the PDF I sent", "owner", [], "conv", null, false,
      { currentMessageId: "now", decideResources: async () => ({ state: "none" }) });
    assert.equal(queries.historical, 0);
    assert.match(result.context, /document_processing_notice/);
  });
});

test("explicit attachment ID must agree with model selection", () => {
  const longId = { ...pdf, id: "attachment:01M3FULLIDVALID" };
  assert.equal(validateResourceDecision({ state: "selected", ids: ["image"] }, [longId, image],
    "Read attachment:01M3FULLIDVALID").state, "ambiguous");
  assert.equal(validateResourceDecision({ state: "selected", ids: [longId.id] }, [longId, image],
    "Read attachment:01M3FULLIDVALID").state, "selected");
});

test("semantic catalog ceiling asks rather than selecting from a partial prompt", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany;
  let selectionCalls = 0;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: async (args: { select?: { attachments?: unknown; createdAt?: unknown } }) =>
    args.select?.attachments ? { id: "now", createdAt: new Date(), parentMessageId: null, attachments: [] } :
    args.select?.createdAt ? { id: "now", createdAt: new Date(), parentMessageId: null, attachments: [] } : { id: "old" } });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () =>
    Array.from({ length: 201 }, (_, n) => ({ id: `older-${n}`, attachments: [{ ...pdf, id: `doc-${n}`, fileName: `document-${n}.pdf` }] })) });
  try {
    const result = await routeContext("Compare my attached documents", "owner", [], "conv", null, false,
      { currentMessageId: "now", decideResources: async (input) => {
        if (input.phase === "selection") selectionCalls++;
        return { state: "selected", ids: ["doc-0"] };
      } });
    assert.equal(selectionCalls, 0);
    assert.equal(result.metadata.documentEvidenceIds, undefined);
    assert.match(result.context, /document_processing_notice/);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
  }
});

test("branch scope never loads root history into the semantic selector", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany;
  let historyCalls = 0, semanticCalls = 0;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: async () =>
    ({ id: "now", createdAt: new Date(), parentMessageId: "other", attachments: [] }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () => { historyCalls++; return []; } });
  try {
    await routeContext("比较之前的 PDF", "owner", [], "conv", null, false,
      { currentMessageId: "now", branchId: "branch", decideResources: async () => { semanticCalls++; return { state: "selected", ids: ["pdf"] }; } });
    assert.equal(historyCalls, 0);
    assert.equal(semanticCalls, 0);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
  }
});

test("historical same-kind source cannot silently replace a current source", () => {
  const current = { ...pdf, id: "current-pdf", messageId: "now", current: true, fileName: "now.pdf" };
  assert.equal(validateResourceDecision({ state: "selected", ids: ["pdf"] }, [current, pdf],
    "What does this file say?").state, "ambiguous");
  assert.equal(validateResourceDecision({ state: "selected", ids: ["pdf"] }, [current, pdf],
    "Read resume.pdf").state, "selected");
});

test("ambiguity suppresses current image evidence rather than leaking a partial answer", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: async (args: { select?: { attachments?: unknown; createdAt?: unknown } }) =>
    args.select?.attachments ? { id: "now", createdAt: new Date(), parentMessageId: null, attachments: [{ ...image, messageId: "now", current: true }] } :
    args.select?.createdAt ? { id: "now", createdAt: new Date(), parentMessageId: null, attachments: [image] } : { id: "old" } });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () => [{ id: "old", attachments: [pdf] }] });
  try {
    const result = await routeContext([{ type: "text", text: "Compare these" }, { type: "image_url", image_url: { url: image.fileUrl } }],
      "owner", [], "conv", null, false, { currentMessageId: "now", decideResources: async () => ({ state: "ambiguous" }) });
    assert.equal(result.metadata.hasDocuments, true);
    assert.equal(result.metadata.documentContextState, "unavailable");
    assert.equal(result.metadata.includeCurrentImages, false);
    assert.match(result.context, /document_processing_notice/);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
  }
});

test("current message missing at intent check fails closed before history lookup", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany;
  let historyCalls = 0, modelCalls = 0;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: async () => null });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () => { historyCalls++; return []; } });
  try {
    const result = await routeContext("看看我之前的 PDF", "owner", [], "conv", null, false,
      { currentMessageId: "now", decideResources: async () => { modelCalls++; return { state: "selected", ids: ["pdf"] }; } });
    assert.equal(historyCalls, 0);
    assert.equal(modelCalls, 0);
    assert.match(result.context, /current message could not be verified/);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
  }
});
