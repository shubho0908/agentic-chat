import { END } from "@langchain/langgraph";
import type { AIMessage } from "@langchain/core/messages";
import type { AgentStateType } from "../state";
import { MAX_TOOL_ITERATIONS } from "../constants";

function countToolRequestRounds(messages: AgentStateType["messages"]): number {
  let count = 0;
  for (const message of messages) {
    if (message.getType() !== "ai") continue;
    const toolCalls = (message as AIMessage).tool_calls ?? [];
    if (toolCalls.length > 0) count++;
  }
  return count;
}

export function routeAfterAgent(state: AgentStateType): "tools" | typeof END {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage | undefined;

  if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
    const toolRequestRounds = countToolRequestRounds(state.messages);
    if (toolRequestRounds > MAX_TOOL_ITERATIONS) {
      return END;
    }
    return "tools";
  }

  return END;
}
