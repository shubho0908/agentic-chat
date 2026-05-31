import { END } from "@langchain/langgraph";
import type { AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { AgentStateType } from "../state";
import { MAX_TOOL_ITERATIONS } from "../constants";

function countCurrentInvocationToolRounds(messages: BaseMessage[]): number {
  let turnStart = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].getType() === "human") {
      turnStart = i + 1;
      break;
    }
  }

  let count = 0;
  for (let i = turnStart; i < messages.length; i++) {
    const message = messages[i];
    if (message.getType() !== "ai") continue;
    const toolCalls = (message as AIMessage).tool_calls ?? [];
    if (toolCalls.length > 0) count++;
  }
  return count;
}

export function routeAfterAgent(state: AgentStateType): "tools" | typeof END {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage | undefined;

  if (!lastMessage?.tool_calls || lastMessage.tool_calls.length === 0) {
    return END;
  }

  const toolRoundsThisTurn = countCurrentInvocationToolRounds(state.messages);
  if (toolRoundsThisTurn >= MAX_TOOL_ITERATIONS) {
    return END;
  }

  return "tools";
}
