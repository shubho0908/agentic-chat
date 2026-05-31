import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type { PlanComplexityValue } from "./constants";

export interface AgentToolPlan {
  complexity: PlanComplexityValue;
  tools_needed: string[];
  plan: string;
}

export const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  userId: Annotation<string>,
  conversationId: Annotation<string | undefined>,
  connectedServices: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  toolApprovals: Annotation<Record<string, boolean>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
  activeSubAgent: Annotation<string | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  toolPlan: Annotation<AgentToolPlan | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
});

export type AgentStateType = typeof AgentState.State;
