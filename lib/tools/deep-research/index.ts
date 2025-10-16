import { createResearchGraph } from './graph';
import type { ResearchState } from './state';
import type { DeepResearchProgress, WebSearchSource, Citation, GateDecision } from '@/types/tools';

export interface DeepResearchInput {
  query: string;
  openaiApiKey: string;
  model: string;
  onProgress?: (progress: DeepResearchProgress) => void;
  forceDeepResearch?: boolean;
  abortSignal?: AbortSignal;
}

export interface DeepResearchResult {
  response: string;
  sources: WebSearchSource[];
  citations?: Citation[];
  followUpQuestions?: string[];
  skipped?: boolean;
  gateDecision?: GateDecision;
}


export async function executeDeepResearch(
  input: DeepResearchInput
): Promise<DeepResearchResult> {
  const { query, openaiApiKey, model, onProgress, forceDeepResearch = false, abortSignal } = input;

  onProgress?.({
    status: 'gate_check',
    message: 'Analyzing if deep research is needed...',
  });

  const currentResearchState: Partial<ResearchState> = {};
  
  const progressCallback = (taskIndex: number, toolProgress: { toolName: string; status: string; message: string }) => {
    onProgress?.({
      status: 'task_progress',
      message: toolProgress.message,
      details: {
        taskIndex,
        toolProgress,
        // Include current state for UI rendering
        researchPlan: currentResearchState.researchPlan || [],
        currentTaskIndex: taskIndex,
        totalTasks: currentResearchState.taskQueue?.length || 0,
        completedTasks: currentResearchState.completedTasks || [],
      },
    });
  };

  const graph = createResearchGraph({
    openaiApiKey,
    model,
    onProgress: progressCallback,
    forceDeepResearch,
    abortSignal,
  });

  const initialState: Partial<ResearchState> = {
    originalQuery: query,
    // Gate phase
    skipped: false,
    // Research phase
    researchPlan: [],
    taskQueue: [],
    completedTasks: [],
    currentTaskIndex: 0,
    aggregatedResults: '',
    // Evaluation phase
    currentAttempt: 1,
    strictnessLevel: 0,
    evaluationFeedback: [],
    // Output
    citations: [],
    followUpQuestions: [],
    finalResponse: '',
  };

  let finalState = null as ResearchState | null;

  type NodeHandler = (state: Partial<ResearchState>) => void;
  
  const nodeHandlers: Record<string, NodeHandler> = {
    gate: (state) => {
      if (state.skipped && state.gateDecision) {
        onProgress?.({
          status: 'gate_skip',
          message: 'Research skipped - providing direct answer',
          details: {
            gateDecision: state.gateDecision,
            skipped: true,
            directResponse: state.directResponse?.answer,
          },
        });
        finalState = state as ResearchState;
      } else if (state.gateDecision) {
        onProgress?.({
          status: 'gate_check',
          message: 'Research needed - proceeding with deep research',
          details: {
            gateDecision: state.gateDecision,
            skipped: false,
          },
        });
      }
    },
    
    planner: (state) => {
      if (!state.researchPlan) return;
      
      const attempt = state.currentAttempt || 1;
      const isRetry = attempt > 1;
      
      onProgress?.({
        status: 'planning',
        message: isRetry 
          ? `Re-planning research (attempt ${attempt}/2) with enhanced criteria...`
          : `Research plan created with ${state.researchPlan.length} questions`,
        details: {
          researchPlan: state.researchPlan,
          totalTasks: state.researchPlan.length,
          currentAttempt: attempt,
          currentTaskIndex: 0,
        },
      });
    },
    
    worker: (state) => {
      const currentIndex = state.currentTaskIndex ?? 0;
      const totalTasks = state.taskQueue?.length ?? 0;

      if (state.completedTasks && state.completedTasks.length > 0) {
        const lastCompleted = state.completedTasks[state.completedTasks.length - 1];
        
        onProgress?.({
          status: 'task_complete',
          message: `Completed task ${currentIndex}/${totalTasks}`,
          details: {
            currentTask: lastCompleted,
            taskIndex: currentIndex - 1,
            currentTaskIndex: currentIndex,
            totalTasks,
            completedTasks: state.completedTasks,
            researchPlan: state.researchPlan,
          },
        });
      } else if (state.taskQueue && currentIndex < totalTasks) {
        const currentTask = state.taskQueue[currentIndex];
        
        onProgress?.({
          status: 'task_start',
          message: `Starting task ${currentIndex + 1}/${totalTasks}: ${currentTask.question}`,
          details: {
            currentTask,
            taskIndex: currentIndex,
            currentTaskIndex: currentIndex,
            totalTasks,
            researchPlan: state.researchPlan,
          },
        });
      }
    },
    
    aggregator: (state) => {
      onProgress?.({
        status: 'aggregating',
        message: 'Synthesizing research findings...',
        details: {
          researchPlan: state.researchPlan,
          completedTasks: state.completedTasks,
          currentTaskIndex: state.currentTaskIndex,
        },
      });
    },
    
    evaluator: (state) => {
      if (!state.evaluationResult) return;
      
      const attempt = state.currentAttempt || 1;
      const MAX_ATTEMPTS = 2;
      
      if (state.evaluationResult.meetsStandards) {
        onProgress?.({
          status: 'evaluating',
          message: `Quality check passed`,
          details: {
            evaluationResult: state.evaluationResult,
            currentAttempt: attempt,
            strictnessLevel: state.strictnessLevel,
            researchPlan: state.researchPlan,
            completedTasks: state.completedTasks,
            currentTaskIndex: state.currentTaskIndex,
          },
        });
      } else if (attempt < MAX_ATTEMPTS) {
        onProgress?.({
          status: 'retrying',
          message: `Quality below standards - retrying (attempt ${attempt + 1}/${MAX_ATTEMPTS})`,
          details: {
            evaluationResult: state.evaluationResult,
            currentAttempt: attempt,
            maxAttempts: MAX_ATTEMPTS,
            strictnessLevel: state.strictnessLevel,
            researchPlan: state.researchPlan,
            completedTasks: state.completedTasks,
            currentTaskIndex: state.currentTaskIndex,
          },
        });
      }
    },
    
    formatter: (state) => {
      const wordCount = state.finalResponse?.split(/\s+/).length || 0;
      
      onProgress?.({
        status: 'formatting',
        message: 'Creating final response with citations and follow-ups...',
        details: {
          citations: state.citations,
          followUpQuestions: state.followUpQuestions,
          wordCount,
          researchPlan: state.researchPlan,
          completedTasks: state.completedTasks,
          currentTaskIndex: state.currentTaskIndex,
        },
      });
      
      finalState = state as ResearchState;
    },
  };

  try {
    const streamResults = await graph.stream(initialState);

    for await (const output of streamResults) {
      if (abortSignal?.aborted) {
        throw new Error('Research aborted by user');
      }
      
      const nodeKey = Object.keys(output)[0] as string;
      const state = output[nodeKey as keyof typeof output] as Partial<ResearchState>;

      if (state.researchPlan) currentResearchState.researchPlan = state.researchPlan;
      if (state.taskQueue) currentResearchState.taskQueue = state.taskQueue;
      if (state.completedTasks) currentResearchState.completedTasks = state.completedTasks;
      if (state.currentTaskIndex !== undefined) currentResearchState.currentTaskIndex = state.currentTaskIndex;

      const handler = nodeHandlers[nodeKey];
      if (handler) {
        handler(state);
      }
    }

    if (!finalState || !finalState.finalResponse) {
      throw new Error('Research completed but no final response generated');
    }

    const allSources = (finalState.completedTasks || [])
      .flatMap((task) => task.sources || [])
      .filter((source, index, self) => 
        index === self.findIndex((s) => s.url === source.url)
      );

    onProgress?.({
      status: 'completed',
      message: finalState.skipped 
        ? 'Direct answer provided (research skipped)'
        : 'Deep research completed successfully',
      details: {
        completedTasks: finalState.completedTasks,
        citations: finalState.citations,
        followUpQuestions: finalState.followUpQuestions,
        skipped: finalState.skipped,
      },
    });

    return {
      response: finalState.finalResponse,
      sources: allSources,
      citations: finalState.citations || [],
      followUpQuestions: finalState.followUpQuestions || [],
      skipped: finalState.skipped,
      gateDecision: finalState.gateDecision,
    };

  } catch (error) {
    console.error('[Deep Research] Error:', error);
    
    if (error instanceof Error && error.message.includes('aborted')) {
      throw error;
    }
    try {
      onProgress?.({
        status: 'completed',
        message: error instanceof Error ? `Research failed: ${error.message}` : 'Research failed',
      });
    } catch {
      console.error('[Deep Research] Could not send error progress (stream likely closed)');
    }
    
    throw error;
  }
}
