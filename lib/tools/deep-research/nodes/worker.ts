import { ChatOpenAI } from '@langchain/openai';
import type { ResearchState } from '../state';
import type {

  ResearchTask,
  WebSearchProgress,
  WebSearchSource,
  SearchResultWithSources,
  WebSearchImage,
} from '@/types/tools';
import { createWorkerPrompt } from '../prompts';
import { executeWebSearch } from '../../web-search';
import { getRAGContext } from '@/lib/rag/retrieval/context';
import { executeMultiSearch } from '../../web-search/searchPlanner';
import { createUnifiedPlan, type WebSearchPlan } from '../../unifiedPlanner';
import { withTrace } from '@/lib/langsmithConfig';
import { getStageModel } from '@/lib/modelPolicy';
import {
  DEEP_RESEARCH_MAX_RETRIES,
  MAX_PARALLEL_RESEARCH_TASKS,
  MAX_PREVIOUS_FINDINGS,
  MAX_RESULT_SNIPPET,
} from '../constants';

import { logger } from "@/lib/logger";
interface WorkerConfig {
  openaiApiKey: string;
  model: string;
  onProgress?: (taskIndex: number, toolProgress: { toolName: string; status: string; message: string }) => void;
  abortSignal?: AbortSignal;
  userId?: string;
  conversationId?: string;
  attachmentIds?: string[];
}

export function getNextPendingTaskIndex(taskQueue: ResearchTask[]): number {
  const nextPendingIndex = taskQueue.findIndex((task) => task.status === 'pending');
  return nextPendingIndex === -1 ? taskQueue.length : nextPendingIndex;
}

async function executeSingleTask(
  currentTask: ResearchTask,
  taskIndex: number,
  completedTasks: ResearchTask[],
  state: ResearchState,
  config: WorkerConfig
): Promise<ResearchTask> {
  const updatedTask: ResearchTask = {
    ...currentTask,
    status: 'in_progress',
  };

  const previousFindings = completedTasks
    .slice(-MAX_PREVIOUS_FINDINGS)
    .map((task) => `Q: ${task.question}\nA: ${(task.result || '').substring(0, MAX_RESULT_SNIPPET)}`)
    .join('\n\n');

  let searchResults = '';
  const sources: WebSearchSource[] = [];
  let ragResults = '';

  config.onProgress?.(taskIndex, {
    toolName: 'task',
    status: 'starting',
    message: `Starting task ${taskIndex + 1}: ${currentTask.question}`,
  });

  if (currentTask.tools.includes('rag') && config.userId && state.attachmentIds && state.attachmentIds.length > 0) {
    config.onProgress?.(taskIndex, {
      toolName: 'rag',
      status: 'retrieving',
      message: 'Retrieving from attached documents...',
    });

    try {
      const ragContext = await getRAGContext(
        currentTask.question,
        config.userId,
        {
          conversationId: config.conversationId,
          attachmentIds: state.attachmentIds,
          limit: 8,
          scoreThreshold: 0.6,
          waitForProcessing: false,
        }
      );

      if (ragContext) {
        ragResults = ragContext.context;
        config.onProgress?.(taskIndex, {
          toolName: 'rag',
          status: 'completed',
          message: `Retrieved context from ${ragContext.documentCount} document(s)`,
        });
      } else {
        config.onProgress?.(taskIndex, {
          toolName: 'rag',
          status: 'completed',
          message: 'No relevant document context found',
        });
      }
    } catch (error) {
      logger.error('[Worker Node] RAG retrieval error:', error);
      config.onProgress?.(taskIndex, {
        toolName: 'rag',
        status: 'failed',
        message: 'Document retrieval failed, continuing with other sources',
      });
    }
  }

  if (currentTask.tools.includes('web_search')) {
    config.onProgress?.(taskIndex, {
      toolName: 'web_search',
      status: 'planning',
      message: 'Analyzing question and planning intelligent search strategy...',
    });

    const searchPlan = await createUnifiedPlan({
      query: currentTask.question,
      toolType: 'web_search',
      apiKey: config.openaiApiKey,
      model: config.model,
      searchDepth: 'advanced',
      abortSignal: config.abortSignal,
    }) as WebSearchPlan;

    config.onProgress?.(taskIndex, {
      toolName: 'web_search',
      status: 'searching',
      message: `Executing ${searchPlan.recommendedSearches.length} targeted searches (${searchPlan.totalResultsNeeded} results)...`,
    });

    const multiSearchResult = await executeMultiSearch(
      searchPlan,
      async (query: string, maxResults: number): Promise<SearchResultWithSources> => {
        let capturedSources: WebSearchSource[] = [];
        let capturedImages: WebSearchImage[] = [];

        const output = await executeWebSearch(
          {
            query,
            maxResults,
            searchDepth: 'advanced',
            includeAnswer: false,
            includeImages: true,
          },
          (progress: WebSearchProgress) => {
            if (progress.details?.sources) {
              capturedSources = progress.details.sources;
            }
            if (progress.details?.images) {
              capturedImages = progress.details.images;
            }
            config.onProgress?.(taskIndex, {
              toolName: 'web_search',
              status: progress.status,
              message: progress.message,
            });
          },
          config.abortSignal
        );

        return { output, sources: capturedSources, images: capturedImages };
      },
      (searchIndex, total, query) => {
        config.onProgress?.(taskIndex, {
          toolName: 'web_search',
          status: 'searching',
          message: `Search ${searchIndex}/${total}: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`,
        });
      }
    );

    searchResults = multiSearchResult.formattedOutput;
    sources.push(...multiSearchResult.allSources);

    config.onProgress?.(taskIndex, {
      toolName: 'web_search',
      status: 'completed',
      message: `Found ${sources.length} sources${multiSearchResult.allImages.length > 0 ? ` and ${multiSearchResult.allImages.length} images` : ''} from ${searchPlan.recommendedSearches.length} targeted searches`,
    });
  }

  config.onProgress?.(taskIndex, {
    toolName: 'llm',
    status: 'processing',
    message: 'Analyzing findings...',
  });

  const llm = new ChatOpenAI({
    model: getStageModel(config.model, 'research_worker'),
    apiKey: config.openaiApiKey,
    metadata: {
      taskIndex,
      taskQuestion: currentTask.question,
      tools: currentTask.tools,
      userId: config.userId,
      conversationId: config.conversationId,
    },
  });

  const contextParts = [];

  if (state.imageContext) {
    contextParts.push(`## Image Context\n${state.imageContext}`);
  }

  if (ragResults) {
    contextParts.push(`## Document Context\n${ragResults}`);
  }

  if (searchResults) {
    contextParts.push(`## Web Search Results\n${searchResults}`);
  }

  const combinedContext = contextParts.length > 0
    ? contextParts.join('\n\n---\n\n')
    : 'Please answer based on your knowledge.';

  const workerPrompt = createWorkerPrompt(currentTask.question, previousFindings);

  const response = await withTrace(
    `deep-research-task-${taskIndex + 1}`,
    async () => {
      return llm.invoke(
        [
          { role: 'system', content: workerPrompt },
          { role: 'user', content: combinedContext },
        ],
        { signal: config.abortSignal }
      );
    },
    {
      taskIndex,
      taskQuestion: currentTask.question,
      tools: currentTask.tools.join(', '),
      hasRAG: !!ragResults,
      hasWebSearch: !!searchResults,
      hasImages: !!state.imageContext,
      userId: config.userId,
      conversationId: config.conversationId,
      model: config.model,
    }
  );

  const result = Array.isArray(response.content)
    ? response.content
        .filter((part): part is { type: 'text'; text: string } =>
          part && part.type === 'text' && 'text' in part && typeof part.text === 'string'
        )
        .map((part) => part.text)
        .join('\n')
    : String(response.content ?? '');

  return {
    ...updatedTask,
    status: 'completed',
    result,
    sources,
  };
}

export async function workerNode(
  state: ResearchState,
  config: WorkerConfig
): Promise<Partial<ResearchState>> {
  const { taskQueue, completedTasks = [], currentTaskIndex = 0 } = state;

  if (config.abortSignal?.aborted) {
    throw new Error('Research aborted by user');
  }

  if (currentTaskIndex >= taskQueue.length) {
    return {};
  }

  const pendingEntries = taskQueue
    .map((task, index) => ({ task, index }))
    .filter(({ index, task }) => index >= currentTaskIndex && task.status !== 'completed');

  if (pendingEntries.length === 0) {
    return {
      currentTaskIndex: taskQueue.length,
    };
  }

  const updatedTaskQueue = [...taskQueue];
  const completed = [...completedTasks];

  for (let start = 0; start < pendingEntries.length; start += MAX_PARALLEL_RESEARCH_TASKS) {
    const batch = pendingEntries.slice(start, start + MAX_PARALLEL_RESEARCH_TASKS);

    const batchResults = await Promise.all(batch.map(async ({ task, index }) => {
      let latestTask = { ...task };

      try {
        latestTask = await executeSingleTask(task, index, completed, state, config);
      } catch (error) {
        logger.error('[Worker Node] ❌ Error:', error);
        if (task.retries < DEEP_RESEARCH_MAX_RETRIES) {
          latestTask = {
            ...task,
            retries: task.retries + 1,
            status: 'pending',
          };
        } else {
          latestTask = {
            ...task,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }

      return { index, task: latestTask };
    }));

    batchResults
      .sort((a, b) => a.index - b.index)
      .forEach(({ index, task }) => {
        updatedTaskQueue[index] = task;
        if (task.status === 'completed' || task.status === 'failed') {
          completed.push(task);
        }
      });
  }

  return {
    taskQueue: updatedTaskQueue,
    completedTasks: completed,
    currentTaskIndex: getNextPendingTaskIndex(updatedTaskQueue),
  };
}
