import assert from "node:assert/strict";
import test from "node:test";
import { buildMessagesForAPI } from "@/hooks/chat/conversationManager";
import { buildMultimodalContent } from "@/lib/contentUtils";
import { extractTextQuery } from "@/lib/chat/referentialQuery";
import { extractQueryTerms } from "@/lib/rag/retrieval/hybrid";
import { MessageRole } from "@/lib/schemas/chat";

const attachments = [
  { fileName: "pasted-image-1790349012670.png", fileUrl: "https://utfs.io/f/long-image-name-here.png", fileType: "image/png", fileSize: 500 },
  { fileName: "Shubhojeet_Bera_Resume.pdf", fileUrl: "https://utfs.io/f/resume.pdf", fileType: "application/pdf", fileSize: 295460 },
];

test("image URL helper text never becomes a PDF retrieval query", () => {
  const question = "Ye dono attachment mein koi similarity hai kya?";
  const content = buildMultimodalContent(question, attachments);
  const messages = buildMessagesForAPI([], content, "System", "gpt-5.6-luna", attachments, "current-turn");
  const last = messages.at(-1);
  assert.equal(last?.role, MessageRole.USER);
  assert.ok(last);
  const routingText = extractTextQuery(last.content);
  assert.equal(routingText, question);
  assert.deepEqual(extractQueryTerms(routingText), ["dono", "attachment", "mein", "koi", "similarity", "hai", "kya"]);
});
