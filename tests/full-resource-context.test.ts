import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { assembleCompleteDocuments, getCompleteIndexedDocuments } from "@/lib/rag/retrieval/fullContext";
import { selectConversationResource, type ResourceCandidate } from "@/lib/chat/resourceSelection";
import { routeContext } from "@/lib/contextRouter";
import { MessageRole } from "@/lib/schemas/chat";
import { attachHistoricalImagesToModelTurn } from "@/lib/chat/modelResourceImages";
import { toOpenAIChatMessages } from "@/lib/chat/streamHandler";
import { RoutingDecision } from "@/types/chat";
const file = (n: number, current = false, messageId = `turn-${n}`): ResourceCandidate => ({
  id: `pdf-${n}`, kind: "document", current, messageId,
  fileName: `file-${n}.pdf`, fileUrl: `https://utfs.io/f/file-${n}.pdf`,
  fileType: "application/pdf", fileSize: 100,
});
const img = (n: number, current = false, messageId = `image-turn-${n}`): ResourceCandidate => ({
  id: `image-${n}`, kind: "image", current, messageId,
  fileName: `photo-${n}.png`, fileUrl: `https://utfs.io/f/photo-${n}.png`,
  fileType: "image/png", fileSize: 100,
});
const rows = (ids: string[]) => ids.map((id) => ({ id:`${id}:0`, attachment_id:id,
  content:`FULL ${id} CONTENT`, file_name: `file-${id.split('-')[1]}.pdf`, chunk_index:0, page:1 }));
test("complete context retains all five scoped files, regardless of their turn spacing", () => {
  for (const resources of [Array.from({length:5},(_,i)=>file(i+1,true,"same-turn")),
    Array.from({length:5},(_,i)=>file(i+1,i===4))]) {
    const selection = selectConversationResource("Compare all five PDF documents",false,resources);
    assert.equal(selection.state,"selected");
    if (selection.state !== "selected") continue;
    assert.deepEqual(selection.resources.map(({id})=>id),resources.map(({id})=>id));
    const ids=selection.resources.map(({id})=>id);
    const context=assembleCompleteDocuments(ids,ids.map((id)=>({id, fileName:`file-${id.split('-')[1]}.pdf`,chunkCount:1})),rows(ids));
    assert.ok(context && ids.every((id)=>context.includes(`FULL ${id} CONTENT`)));
  }
});
test("complete-text gate rejects partial, duplicate, foreign, wrong-name, or oversized evidence", () => {
  const ids=["pdf-1","pdf-2"];
  const files=ids.map((id)=>({id,fileName:`file-${id.split('-')[1]}.pdf`,chunkCount:1}));
  assert.equal(assembleCompleteDocuments(ids,files,rows(ids).slice(0,1)),null);
  assert.equal(assembleCompleteDocuments(ids,files,[rows(ids)[0],rows(ids)[0]]),null);
  assert.equal(assembleCompleteDocuments(ids,files,[...rows(ids),{...rows(ids)[0],attachment_id:"foreign"}]),null);
  assert.equal(assembleCompleteDocuments(ids,files,[...rows(ids).slice(0,1),{...rows(ids)[1],file_name:"wrong.pdf"}]),null);
  assert.equal(assembleCompleteDocuments(ids,files,[{...rows(ids)[0],content:"x".repeat(100000)},rows(ids)[1]]),null);
});
test("aggregate selection includes spaced historical images and current plus older documents", () => {
  const docs=[file(1),file(2),file(3,true,"now")];
  const images=[img(1),img(2)];
  const selection=selectConversationResource("Compare all images and documents",false,[...docs,...images]);
  assert.equal(selection.state,"selected");
  if (selection.state !== "selected") return;
  assert.deepEqual(selection.resources.map(({id})=>id),docs.map(({id})=>id));
  assert.deepEqual(selection.images?.map(({id})=>id),images.map(({id})=>id));
  assert.equal(selectConversationResource("Describe the earlier PDF",false,docs).state,"ambiguous");
});
test("scoped complete-text query and old-image/current-PDF route carry both actual sources",async()=>{
  const first=prisma.message.findFirst,many=prisma.message.findMany,find=prisma.attachment.findMany,raw=prisma.$queryRaw;
  const current=file(1,true,"now"), old=img(1);
  const recorded:unknown[]=[];
  Object.defineProperty(prisma.message,"findFirst",{configurable:true,value:async()=>({id:"now",parentMessageId:null,createdAt:new Date(),attachments:[current]})});
  Object.defineProperty(prisma.message,"findMany",{configurable:true,value:async()=>[{id:"older",attachments:[old]}]});
  Object.defineProperty(prisma.attachment,"findMany",{configurable:true,value:async(args:unknown)=>{recorded.push(args);return [{id:current.id,fileName:current.fileName,chunkCount:2}];}});
  Object.defineProperty(prisma,"$queryRaw",{configurable:true,value:async(query:unknown)=>{
    recorded.push(query);
    return [0,1].map((i)=>({id:`${current.id}:${i}`,attachment_id:current.id,
      content:i===0?"Full resume experience":"Full resume projects",file_name:current.fileName,chunk_index:i,page:1}));
  }});
  try {
    assert.match((await getCompleteIndexedDocuments([current.id],"owner","conv"))!,/Full resume projects/);
    const text="Compare the earlier image with this PDF";
    const result=await routeContext(text,"owner",[],"conv",null,false,{currentMessageId:"now"});
    assert.equal(result.metadata.routingDecision,RoutingDecision.Hybrid);
    assert.equal(result.metadata.documentContextState,"ready");
    assert.match(result.context,/Full resume experience/);
    assert.match(result.context,/Full resume projects/);
    assert.deepEqual(result.metadata.documentEvidenceIds,[current.id]);
    const input=toOpenAIChatMessages(attachHistoricalImagesToModelTurn([{role:MessageRole.USER,content:text}],result.metadata.historicalImageFiles??[]));
    assert.match(JSON.stringify(input),/photo-1.png/);
    assert.ok(recorded.length>=2);
  } finally {
    Object.defineProperty(prisma.message,"findFirst",{configurable:true,value:first});
    Object.defineProperty(prisma.message,"findMany",{configurable:true,value:many});
    Object.defineProperty(prisma.attachment,"findMany",{configurable:true,value:find});
    Object.defineProperty(prisma,"$queryRaw",{configurable:true,value:raw});
  }
});

test("focused detail request several turns after indexing receives the complete scoped PDF despite semantic query mismatch", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany,
    find = prisma.attachment.findMany, raw = prisma.$queryRaw;
  const older = file(1);
  Object.defineProperty(prisma.message, "findFirst", { configurable: true,
    value: async () => ({ id: "now", parentMessageId: null, createdAt: new Date(), attachments: [] }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true,
    value: async () => [{ id: "older", attachments: [older] }] });
  Object.defineProperty(prisma.attachment, "findMany", { configurable: true,
    value: async () => [{ id: older.id, fileName: older.fileName, chunkCount: 1 }] });
  Object.defineProperty(prisma, "$queryRaw", { configurable: true,
    value: async () => [{ ...rows([older.id])[0], content: "Contact: reach me at test@example.com, +1 555 0100" }] });
  try {
    const routed = await routeContext("What email ID and phone number are in the earlier PDF?",
      "owner", [], "conv", null, false, { currentMessageId: "now" });
    assert.equal(routed.metadata.documentContextState, "ready");
    assert.deepEqual(routed.metadata.documentEvidenceIds, [older.id]);
    assert.match(routed.context, /test@example.com/);
    assert.match(routed.context, /555 0100/);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
    Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: find });
    Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: raw });
  }
});

test("an unrelated aggregate word does not select historical files", () => {
  assert.equal(selectConversationResource("That's all for now", false, [file(1)]).state, "none");
  assert.equal(selectConversationResource("Is everything all right?", false, [file(1)]).state, "none");
});

test("an earlier image excludes the unrelated newly attached image from status", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany;
  const current = img(2, true, "now"), old = img(1);
  Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: async () => ({ id: "now", parentMessageId: null, createdAt: new Date(), attachments: [current] }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () => [{ id: "older", attachments: [old] }] });
  try {
    const result = await routeContext("Describe the earlier image", "owner", [], "conv", null, false, { currentMessageId: "now" });
    assert.equal(result.metadata.imageCount, 1);
    assert.equal(result.metadata.includeCurrentImages, false);
    assert.deepEqual(result.metadata.historicalImageFiles?.map(({ id }) => id), [old.id]);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
  }
});

test("a named earlier image and unnamed current PDF still select both", () => {
  const selection = selectConversationResource("Compare photo-1.png with this PDF", false,
    [file(2, true, "now"), img(1)]);
  assert.equal(selection.state, "selected");
  if (selection.state !== "selected") return;
  assert.deepEqual(selection.resources.map(({ id }) => id), ["pdf-2"]);
  assert.deepEqual(selection.images?.map(({ id }) => id), ["image-1"]);
});

test("earlier document and explicitly referenced current image retain both sources", () => {
  const selection = selectConversationResource("Compare the earlier PDF with this image", true,
    [file(1), img(2, true, "now")]);
  assert.equal(selection.state, "selected");
  if (selection.state !== "selected") return;
  assert.deepEqual(selection.resources.map(({ id }) => id), ["pdf-1"]);
  assert.deepEqual(selection.images?.map(({ id }) => id), ["image-2"]);
});

test("incidental old filename in a term-definition question does not route attachment evidence", () => {
  const old = { ...file(1), fileName: "report.pdf" };
  assert.equal(selectConversationResource("What is report.pdf?", false, [old]).state, "none");
  const selected = selectConversationResource("Summarize the report.pdf I uploaded earlier", false, [old]);
  assert.equal(selected.state, "selected");
});

test("incomplete long history may still use only a selected current PDF", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany,
    find = prisma.attachment.findMany, raw = prisma.$queryRaw;
  const current = file(1, true, "now"), older = file(2);
  Object.defineProperty(prisma.message, "findFirst", { configurable: true,
    value: async () => ({ id: "now", parentMessageId: null, createdAt: new Date(), attachments: [current] }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true,
    value: async () => Array.from({ length: 501 }, (_, i) => ({ id: `old-${i}`, attachments: [older] })) });
  Object.defineProperty(prisma.attachment, "findMany", { configurable: true,
    value: async () => [{ id: current.id, fileName: current.fileName, chunkCount: 1 }] });
  Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: async () => rows([current.id]) });
  try {
    const routed = await routeContext("Summarize this PDF", "owner", [], "conv", null, false, { currentMessageId: "now" });
    assert.deepEqual(routed.metadata.documentEvidenceIds, [current.id]);
    assert.match(routed.context, /FULL pdf-1 CONTENT/);
    const historical = await routeContext("Summarize all PDFs", "owner", [], "conv", null, false, { currentMessageId: "now" });
    assert.match(historical.context, /Historical attachment search was incomplete/);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
    Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: find });
    Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: raw });
  }
});

test("both PDFs selects exactly two; with three it refuses a guess", () => {
  const pair = [file(1), file(2)];
  const selection = selectConversationResource("Compare both PDFs", false, pair);
  assert.equal(selection.state, "selected");
  if (selection.state === "selected") assert.equal(selection.resources.length, 2);
  assert.equal(selectConversationResource("Compare both PDFs", false, [...pair, file(3)]).state, "ambiguous");
});

test("one named current image and an older image do not select the other current image", () => {
  const selected = img(1, true, "now"), other = img(2, true, "now"), old = img(3);
  const result = selectConversationResource("Compare photo-1.png with the earlier image", true,
    [selected, other, old]);
  assert.equal(result.state, "selected");
  if (result.state === "selected") assert.deepEqual(result.resources.map(({ id }) => id),
    [selected.id, old.id]);
});

test("both explicitly named PDFs remain selectable despite other old PDFs", () => {
  const selected = selectConversationResource("Compare file-1.pdf and file-2.pdf, both PDFs", false,
    [file(1), file(2), file(3)]);
  assert.equal(selected.state, "selected");
  if (selected.state === "selected") assert.deepEqual(selected.resources.map(({ id }) => id), ["pdf-1", "pdf-2"]);
});

test("the current PDF and exactly one earlier image can be compared despite two image turns", () => {
  const selection = selectConversationResource("Compare the earlier image with this image and this PDF",
    true, [file(1, true, "now"), img(1, true, "now"), img(2)]);
  assert.equal(selection.state, "selected");
  if (selection.state === "selected") assert.deepEqual(selection.images?.map(({ id }) => id),
    ["image-1", "image-2"]);
});

test("explicit earlier image beats current image in mixed both-files comparison", () => {
  const selection = selectConversationResource("Compare both files - the earlier image and this PDF", true,
    [file(1, true, "now"), img(1, true, "now"), img(2)]);
  assert.equal(selection.state, "selected");
  if (selection.state === "selected") {
    assert.deepEqual(selection.resources.map(({ id }) => id), ["pdf-1"]);
    assert.deepEqual(selection.images?.map(({ id }) => id), ["image-2"]);
  }
});

test("multiple older images in the same message cannot be guessed as the earlier image", () => {
  const older = [img(2, false, "one-older-turn"), img(3, false, "one-older-turn")];
  const selection = selectConversationResource("Compare photo-1.png with the earlier image", true,
    [img(1, true, "now"), ...older]);
  assert.equal(selection.state, "ambiguous");
});

test("bounded history cannot override a named older document with a current PDF", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany;
  const current = file(1, true, "now");
  Object.defineProperty(prisma.message, "findFirst", { configurable: true,
    value: async () => ({ id: "now", parentMessageId: null, createdAt: new Date(), attachments: [current] }) });
  const history = Array.from({ length: 5001 }, (_, i) => ({ id: `old-${i}`, attachments: [file(i+2)] }));
  Object.defineProperty(prisma.message, "findMany", { configurable: true,
    value: async (query: { cursor?: { id: string }; take: number }) => {
      const start = query.cursor ? history.findIndex(({ id }) => id === query.cursor?.id) + 1 : 0;
      return history.slice(start, start + query.take);
    } });
  try {
    const routed = await routeContext("Read file-999.pdf", "owner", [], "conv", null, false, { currentMessageId: "now" });
    assert.match(routed.context, /Historical attachment search was incomplete/);
    assert.equal(routed.metadata.documentEvidenceIds, undefined);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
  }
});

test("both files resolves a named earlier image, never a different image or unrelated current image", () => {
  const result = selectConversationResource("Compare both files - the earlier image photo-2.png and this PDF",
    true, [file(1, true, "now"), img(1, true, "now"), img(2), img(3)]);
  assert.equal(result.state, "selected");
  if (result.state === "selected") assert.deepEqual(result.images?.map(({ id }) => id), ["image-2"]);
  const missing = selectConversationResource("Compare both files - the earlier image photo-9.png and this PDF",
    true, [file(1, true, "now"), img(1, true, "now"), img(3)]);
  assert.notEqual(missing.state, "selected");
});

test("a dotted topic is not a historical filename with incomplete history", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany,
    find = prisma.attachment.findMany, raw = prisma.$queryRaw;
  const current = file(1, true, "now");
  Object.defineProperty(prisma.message, "findFirst", { configurable: true,
    value: async () => ({ id: "now", parentMessageId: null, createdAt: new Date(), attachments: [current] }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true,
    value: async () => Array.from({ length: 501 }, (_, i) => ({ id: `old-${i}`, attachments: [file(i+2)] })) });
  Object.defineProperty(prisma.attachment, "findMany", { configurable: true,
    value: async () => [{ id: current.id, fileName: current.fileName, chunkCount: 1 }] });
  Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: async () => rows([current.id]) });
  try {
    const routed = await routeContext("Summarize this PDF about node.js", "owner", [], "conv", null, false,
      { currentMessageId: "now" });
    assert.deepEqual(routed.metadata.documentEvidenceIds, [current.id]);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
    Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: find });
    Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: raw });
  }
});

test("named image matches whole filename, not suffix inside a different filename", () => {
  const selection = selectConversationResource("Compare the earlier image fold.png with this PDF", false,
    [file(1, true, "now"), { ...img(2), fileName: "fold.png" }, { ...img(3), fileName: "old.png" }]);
  assert.equal(selection.state, "selected");
  if (selection.state === "selected") assert.deepEqual(selection.images?.map(({ id }) => id), ["image-2"]);
});

test("custom-extension older file in incomplete history cannot be silently dropped", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true,
    value: async () => ({ id: "now", parentMessageId: null, createdAt: new Date(), attachments: [file(1, true, "now")] }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true,
    value: async () => Array.from({ length: 501 }, (_, i) => ({ id: `old-${i}`, attachments: [file(i+2)] })) });
  try {
    const result = await routeContext("Summarize this PDF and data.json", "owner", [], "conv", null, false,
      { currentMessageId: "now" });
    assert.match(result.context, /Historical attachment search was incomplete/);
    assert.equal(result.metadata.documentEvidenceIds, undefined);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
  }
});

test("paged catalog resolves a spaced older filename with the current PDF", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany,
    find = prisma.attachment.findMany, raw = prisma.$queryRaw;
  const current = file(1, true, "now");
  const older = { ...file(700), fileName: "quarterly report.pdf" };
  const history = Array.from({ length: 501 }, (_, i) => ({
    id: `older-${i}`, attachments: [i === 500 ? older : file(i + 2)],
  }));
  Object.defineProperty(prisma.message, "findFirst", { configurable: true,
    value: async () => ({ id: "now", parentMessageId: null, createdAt: new Date(), attachments: [current] }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true,
    value: async (query: { cursor?: { id: string }; take: number }) => {
      const start = query.cursor ? history.findIndex(({ id }) => id === query.cursor?.id) + 1 : 0;
      return history.slice(start, start + query.take);
    } });
  Object.defineProperty(prisma.attachment, "findMany", { configurable: true,
    value: async () => [current, older].map(({ id, fileName }) => ({ id, fileName, chunkCount: 1 })) });
  Object.defineProperty(prisma, "$queryRaw", { configurable: true,
    value: async () => [
      rows([current.id])[0],
      { ...rows([older.id])[0], file_name: older.fileName },
    ] });
  try {
    const routed = await routeContext("Compare this PDF with quarterly report.pdf", "owner", [], "conv", null, false, { currentMessageId: "now" });
    assert.deepEqual(routed.metadata.documentEvidenceIds, [current.id, older.id]);
    assert.match(routed.context, /quarterly report.pdf/);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
    Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: find });
    Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: raw });
  }
});

test("paged catalog reads current PDF when node.js is a topic, not a named attachment", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany,
    find = prisma.attachment.findMany, raw = prisma.$queryRaw;
  const current = file(1, true, "now");
  const history = Array.from({ length: 501 }, (_, i) => ({ id: `older-${i}`, attachments: [file(i + 2)] }));
  Object.defineProperty(prisma.message, "findFirst", { configurable: true,
    value: async () => ({ id: "now", parentMessageId: null, createdAt: new Date(), attachments: [current] }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true,
    value: async (query: { cursor?: { id: string }; take: number }) => {
      const start = query.cursor ? history.findIndex(({ id }) => id === query.cursor?.id) + 1 : 0;
      return history.slice(start, start + query.take);
    } });
  Object.defineProperty(prisma.attachment, "findMany", { configurable: true,
    value: async () => [{ id: current.id, fileName: current.fileName, chunkCount: 1 }] });
  Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: async () => rows([current.id]) });
  try {
    const routed = await routeContext("Summarize this PDF and node.js", "owner", [], "conv", null, false, { currentMessageId: "now" });
    assert.deepEqual(routed.metadata.documentEvidenceIds, [current.id]);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
    Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: find });
    Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: raw });
  }
});

test("paged catalog retains second named JSON alongside a named current PDF", async () => {
  const current = file(1, true, "now");
  const older = { ...file(700), fileName: "data.json", fileType: "application/json" };
  const selection = selectConversationResource("Compare file-1.pdf and data.json", false, [current, older]);
  assert.equal(selection.state, "selected");
  if (selection.state === "selected") assert.deepEqual(selection.resources.map(({ id }) => id), [current.id, older.id]);
});

test("a real earlier node.js attachment is selected with the current PDF", () => {
  const current = file(1, true, "now");
  const older = { ...file(2), fileName: "node.js", fileType: "text/javascript" };
  const selection = selectConversationResource("Summarize this PDF and node.js", false, [current, older]);
  assert.equal(selection.state, "selected");
  if (selection.state === "selected") assert.deepEqual(selection.resources.map(({ id }) => id), [current.id, older.id]);
});

test("a multiword filename is matched exactly, and duplicate named files across turns remain ambiguous", () => {
  const current = file(1, true, "now");
  const older = { ...file(2), fileName: "quarterly report.pdf" };
  const unrelated = { ...file(3), fileName: "report.pdf" };
  const selection = selectConversationResource("Compare this PDF with quarterly report.pdf", false,
    [current, unrelated, older]);
  assert.equal(selection.state, "selected");
  if (selection.state === "selected") assert.deepEqual(selection.resources.map(({ id }) => id), [current.id, older.id]);
  assert.equal(selectConversationResource("Open quarterly report.pdf", false,
    [older, { ...file(4), fileName: "quarterly report.pdf" }]).state, "ambiguous");
});

test("explicit two-name comparison selects only the named files, not a third current attachment", () => {
  const current = file(1, true, "now");
  const older = { ...file(2), fileName: "data.json", fileType: "application/json" };
  const unrelated = file(3, true, "now");
  const selection = selectConversationResource("Compare file-1.pdf and data.json", false,
    [current, unrelated, older]);
  assert.equal(selection.state, "selected");
  if (selection.state === "selected") assert.deepEqual(selection.resources.map(({ id }) => id), [current.id, older.id]);
});
