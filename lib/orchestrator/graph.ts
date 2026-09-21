import { StateGraph, END } from "@langchain/langgraph";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { AgentState } from "./state";
import { createAgentNode } from "./nodes/agent";
import { createToolNode } from "./nodes/tools";
import { createPlannerNode } from "./nodes/planner";
import { routeAfterAgent, createRecoveryNode } from "./nodes/reflector";
import { getCheckpointer } from "./checkpointer";
import { getToolsForRequest } from "./tools";
import { DEFAULT_MODEL, type ReasoningEffortLevel } from "@/constants/openai-models";
import { GraphNode } from "./constants";
import type { ComposioToolkit } from "@/lib/tools/composio/config";

interface CreateAgentGraphOptions {
  reasoningEffort?: ReasoningEffortLevel | null;
  connectedToolkits?: ComposioToolkit[];
  installedTools?: DynamicStructuredTool[];
}

export async function createAgentGraph(
  userId: string,
  apiKey: string,
  model = DEFAULT_MODEL,
  options: CreateAgentGraphOptions = {}
) {
  const { reasoningEffort, connectedToolkits, installedTools } = options;

  const allTools: DynamicStructuredTool[] = installedTools ?? await getToolsForRequest(userId, connectedToolkits, { apiKey, model, reasoningEffort });
  const tools = allTools;
  const checkpointer = await getCheckpointer();

  const graph = new StateGraph(AgentState)
    .addNode(GraphNode.PLANNER, createPlannerNode(tools, apiKey, model, { reasoningEffort }))
    .addNode(GraphNode.AGENT, createAgentNode(tools, apiKey, model, { reasoningEffort }))
    .addNode(GraphNode.TOOLS, createToolNode(tools, { model, reasoningEffort }))
    .addNode(GraphNode.RECOVERY, createRecoveryNode())
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
