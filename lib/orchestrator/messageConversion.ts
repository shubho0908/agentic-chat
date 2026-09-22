import { createHash, randomUUID } from "node:crypto";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { Message, MessageContentPart } from "@/lib/schemas/chat";

function toLangChainContent(content: Message["content"]) {
  if (typeof content === "string") return content;
  return content.map((part: MessageContentPart) =>
    part.type === "text"
      ? { type: "text", text: part.text }
      : { type: "image_url", image_url: { url: part.image_url.url } },
  );
}

/**
 * Legacy clients may omit message ids. Content-derived ids are deliberately
 * independent of the visible request window, so pagination cannot renumber a
 * message. Identical no-id messages are submitted as replacements; callers
 * must not collapse them solely by id. Modern clients always send DB ids.
 */
export function stableMessageId(message: Message): string {
  if (message.id) return message.id;
  if (message.timestamp !== undefined) {
    return `legacy-${createHash("sha256")
      .update(message.role)
      .update("\0")
      .update(JSON.stringify(message.content))
      .update("\0")
      .update(String(message.timestamp))
      .digest("hex")
      .slice(0, 32)}`;
  }
  // An id-less, timestamp-less repeated message has no intrinsic stable identity.
  // Give it a unique id rather than silently merging a legitimate later turn.
  return `legacy-${randomUUID()}`;
}

export function convertToLangChainMessages(messages: Message[]): BaseMessage[] {
  return messages.map((message) => {
    const content = toLangChainContent(message.content);
    const text =
      typeof content === "string"
        ? content
        : content
            .map((part) => (part.type === "text" ? part.text : ""))
            .join(" ");
    const id = stableMessageId(message);
    if (message.role === "assistant")
      return new AIMessage({ content: text, id });
    if (message.role === "system")
      return new SystemMessage({ content: text, id });
    return new HumanMessage({ content, id });
  });
}
