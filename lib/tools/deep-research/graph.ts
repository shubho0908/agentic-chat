import { StateGraph, END } from '@langchain/langgraph';
import { ResearchStateAnnotation, type ResearchState } from './state';
import { gateNode } from './nodes/gate';
import { plannerNode } from './nodes/planner';
import { workerNode } from './nodes/worker';
import { aggregatorNode } from './nodes/aggregator';
import { evaluatorNode } from './nodes/evaluator';
import { formatterNode } from './nodes/formatter';

interface GraphConfig {
  openaiApiKey: string;
  model: string;
  onProgress?: (taskIndex: number, toolProgress: { toolName: string; status: string; message: string }) => void;
  forceDeepResearch?: boolean;
  abortSignal?: AbortSignal;
  userId?: string;
  conversationId?: string;
}

function shouldProceedAfterGate(state: ResearchState): string {
  if (state.skipped) {
    return END;
  }
  return 'planner';
}

function shouldContinueWorker(state: ResearchState): string {
  const { currentTaskIndex = 0, taskQueue = [] } = state;
  
  if (currentTaskIndex >= taskQueue.length) {
    return 'aggregator';
  }
  
  return 'worker';
}

function shouldRetryOrFormat(state: ResearchState): string {
  const { evaluationResult, currentAttempt = 1 } = state;
  const MAX_ATTEMPTS = 3; // Allow 3 total attempts (1 initial + 2 retries)
  
  if (!evaluationResult) {
    return 'formatter';
  }
  
  if (evaluationResult.meetsStandards) {
    return 'formatter';
  }
  
  if (currentAttempt < MAX_ATTEMPTS) {
    return 'planner';
  }
  
  return 'formatter';
}

export function createResearchGraph(config: GraphConfig) {
  const workflow = new StateGraph(ResearchStateAnnotation)
    .addNode('gate', (state: ResearchState) => gateNode(state, config))
    .addNode('planner', (state: ResearchState) => plannerNode(state, config))
    .addNode('worker', (state: ResearchState) => workerNode(state, config))
    .addNode('aggregator', (state: ResearchState) => aggregatorNode(state, config))
    .addNode('evaluator', (state: ResearchState) => evaluatorNode(state, config))
    .addNode('formatter', (state: ResearchState) => formatterNode(state, config))
    .addEdge('__start__', 'gate')
    .addConditionalEdges('gate', shouldProceedAfterGate, {
      planner: 'planner',
      [END]: END,
    })
    .addEdge('planner', 'worker')
    .addConditionalEdges('worker', shouldContinueWorker, {
      worker: 'worker',
      aggregator: 'aggregator',
    })
    .addEdge('aggregator', 'evaluator')
    .addConditionalEdges('evaluator', shouldRetryOrFormat, {
      planner: 'planner',
      formatter: 'formatter',
    })
    .addEdge('formatter', END);
  return workflow.compile();
}
