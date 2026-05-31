import { StateGraph, END } from "@langchain/langgraph";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { AgentState } from "./state";
import { createAgentNode } from "./nodes/agent";
import { createToolNode } from "./nodes/tools";
import { createPlannerNode } from "./nodes/planner";
import { routeAfterAgent } from "./nodes/reflector";
import { getCheckpointer } from "./checkpointer";
import { getToolsForRequest } from "./tools";
import { DEFAULT_MODEL } from "@/constants/openai-models";
import { GraphNode } from "./constants";
import type { ComposioToolkit } from "@/lib/tools/composio/config";

interface CreateAgentGraphOptions {
  thinkingEnabled?: boolean;
  connectedToolkits?: ComposioToolkit[];
}

export async function createAgentGraph(
  userId: string,
  apiKey: string,
  model = DEFAULT_MODEL,
  options: CreateAgentGraphOptions = {}
) {
  const { thinkingEnabled = false, connectedToolkits } = options;

  const allTools: DynamicStructuredTool[] = await getToolsForRequest(userId, connectedToolkits, { apiKey, model });
  const tools = allTools;
  const checkpointer = await getCheckpointer();

  const graph = new StateGraph(AgentState)
    .addNode(GraphNode.PLANNER, createPlannerNode(tools, apiKey, model))
    .addNode(GraphNode.AGENT, createAgentNode(tools, apiKey, model, { thinkingEnabled }))
    .addNode(GraphNode.TOOLS, createToolNode(tools))
    .addEdge("__start__", GraphNode.PLANNER)
    .addEdge(GraphNode.PLANNER, GraphNode.AGENT)
    .addConditionalEdges(GraphNode.AGENT, routeAfterAgent, { tools: GraphNode.TOOLS, [END]: END })
    .addEdge(GraphNode.TOOLS, GraphNode.AGENT)
    .compile({ checkpointer });

  return graph;
}
