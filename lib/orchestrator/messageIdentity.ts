import { createHash } from "node:crypto";
import type { BaseMessage } from "@langchain/core/messages";

export function messageFingerprint(message: BaseMessage): string {
  return createHash("sha256")
    .update(message.type)
    .update("\0")
    .update(JSON.stringify(message.content))
    .update("\0")
    .update(
      JSON.stringify((message as { tool_calls?: unknown }).tool_calls ?? null),
    )
    .digest("hex");
}
