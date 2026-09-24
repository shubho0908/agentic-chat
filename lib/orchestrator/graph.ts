import { StateGraph, END } from "@langchain/langgraph";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { BaseMessage } from "@langchain/core/messages";
import { AgentState } from "./state";
import { createAgentNode, createFinalAnswerNode } from "./nodes/agent";
import { createToolNode } from "./nodes/tools";
import { createPlannerNode } from "./nodes/planner";
import { routeAfterAgent } from "./nodes/reflector";
import { getCheckpointer } from "./checkpointer";
import { getToolsForRequest } from "./tools";
import {
  DEFAULT_MODEL,
  type ReasoningEffortLevel,
} from "@/constants/openai-models";
import { GraphNode } from "./constants";
import type { ComposioToolkit } from "@/lib/tools/composio/config";

interface CreateAgentGraphOptions {
  reasoningEffort?: ReasoningEffortLevel | null;
  connectedToolkits?: ComposioToolkit[];
  ephemeralContext?: BaseMessage[];
}

export async function createAgentGraph(
  userId: string,
  apiKey: string,
  model = DEFAULT_MODEL,
  options: CreateAgentGraphOptions = {},
) {
  const { reasoningEffort, connectedToolkits, ephemeralContext = [] } = options;

  const allTools: DynamicStructuredTool[] = await getToolsForRequest(
    userId,
    connectedToolkits,
    { apiKey, model, reasoningEffort },
  );
  const tools = allTools;
  const checkpointer = await getCheckpointer();

  const graph = new StateGraph(AgentState)
    .addNode(
      GraphNode.PLANNER,
      createPlannerNode(tools, apiKey, model, {
        reasoningEffort,
        ephemeralContext,
      }),
    )
    .addNode(
      GraphNode.AGENT,
      createAgentNode(tools, apiKey, model, {
        reasoningEffort,
        ephemeralContext,
      }),
    )
    .addNode(GraphNode.TOOLS, createToolNode(tools, { model, reasoningEffort }))
    .addNode(
      GraphNode.RECOVERY,
      createFinalAnswerNode(apiKey, model, {
        reasoningEffort,
        ephemeralContext,
      }),
    )
    .addEdge("__start__", GraphNode.PLANNER)
    .addEdge(GraphNode.PLANNER, GraphNode.AGENT)
    .addConditionalEdges(GraphNode.AGENT, routeAfterAgent, {
      tools: GraphNode.TOOLS,
      recovery: GraphNode.RECOVERY,
      [END]: END,
    })
    .addEdge(GraphNode.TOOLS, GraphNode.AGENT)
    .addEdge(GraphNode.RECOVERY, END)
    .compile({ checkpointer });

  return graph;
}
