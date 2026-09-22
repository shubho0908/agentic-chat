import { createHash } from "node:crypto";
import { HumanMessage, AIMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { Message, MessageContentPart } from "@/lib/schemas/chat";

function toLangChainContent(content: Message["content"]) {
  if (typeof content === "string") return content;
  return content.map((part: MessageContentPart) => part.type === "text"
    ? { type: "text", text: part.text }
    : { type: "image_url", image_url: { url: part.image_url.url } });
}
export function stableMessageId(message: Message): string {
  return message.id ?? `derived-${createHash("sha256").update(message.role).update("\0").update(JSON.stringify(message.content)).digest("hex").slice(0, 32)}`;
}
export function convertToLangChainMessages(messages: Message[]): BaseMessage[] {
  return messages.map((message) => {
    const content = toLangChainContent(message.content);
    const text = typeof content === "string" ? content : content.map((part) => part.type === "text" ? part.text : "").join(" ");
    const id = stableMessageId(message);
    if (message.role === "assistant") return new AIMessage({ content: text, id });
    if (message.role === "system") return new SystemMessage({ content: text, id });
    return new HumanMessage({ content, id });
  });
}
