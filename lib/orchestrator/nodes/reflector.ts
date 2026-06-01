import { END } from "@langchain/langgraph";
import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import type { AgentStateType } from "../state";

const MAX_TOOL_ROUNDS = 15;

function countToolRoundsSinceLastHuman(messages: BaseMessage[]): number {
  let count = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === "human") break;
    if (msg.type === "ai" && ((msg as AIMessage).tool_calls?.length ?? 0) > 0) count++;
  }
  return count;
}

export function routeAfterAgent(state: AgentStateType): "tools" | typeof END {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage | undefined;

  if (!lastMessage?.tool_calls || lastMessage.tool_calls.length === 0) {
    return END;
  }

  if (countToolRoundsSinceLastHuman(state.messages) >= MAX_TOOL_ROUNDS) {
    return END;
  }

  return "tools";
}
