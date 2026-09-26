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
