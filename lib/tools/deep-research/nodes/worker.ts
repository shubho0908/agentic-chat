import { ChatOpenAI } from '@langchain/openai';
import type { ResearchState } from '../state';
import type { ResearchTask, WebSearchProgress, WebSearchSource, SearchResultWithSources, WebSearchImage } from '@/types/tools';
import { createWorkerPrompt } from '../prompts';
import { executeWebSearch } from '../../web-search';
import { getRAGContext } from '@/lib/rag/retrieval/context';
import { createSearchPlan, executeMultiSearch } from '../../web-search/search-planner';

const MAX_RETRIES = 2;

export async function workerNode(
  state: ResearchState,
  config: { 
    openaiApiKey: string;
    model: string;
    onProgress?: (taskIndex: number, toolProgress: { toolName: string; status: string; message: string }) => void;
    abortSignal?: AbortSignal;
    userId?: string;
    conversationId?: string;
    attachmentIds?: string[];
  }
): Promise<Partial<ResearchState>> {
  const { taskQueue, completedTasks = [], currentTaskIndex = 0 } = state;

  if (config.abortSignal?.aborted) {
    throw new Error('Research aborted by user');
  }

  if (currentTaskIndex >= taskQueue.length) {
    return {};
  }

  const currentTask = taskQueue[currentTaskIndex];
  
  if (currentTask.status === 'completed') {
    return {
      currentTaskIndex: currentTaskIndex + 1,
    };
  }

  const updatedTask: ResearchTask = {
    ...currentTask,
    status: 'in_progress',
  };

  try {
    const previousFindings = completedTasks
      .map((task) => `Q: ${task.question}\nA: ${task.result}`)
      .join('\n\n');

    let searchResults = '';
    const sources: WebSearchSource[] = [];
    let ragResults = '';

    if (currentTask.tools.includes('rag') && config.userId && state.attachmentIds && state.attachmentIds.length > 0) {
      config.onProgress?.(currentTaskIndex, {
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
          config.onProgress?.(currentTaskIndex, {
            toolName: 'rag',
            status: 'completed',
            message: `Retrieved context from ${ragContext.documentCount} document(s)`,
          });
        } else {
          config.onProgress?.(currentTaskIndex, {
            toolName: 'rag',
            status: 'completed',
            message: 'No relevant document context found',
          });
        }
      } catch (error) {
        console.error('[Worker Node] RAG retrieval error:', error);
        config.onProgress?.(currentTaskIndex, {
          toolName: 'rag',
          status: 'failed',
          message: 'Document retrieval failed, continuing with other sources',
        });
      }
    }

    if (currentTask.tools.includes('web_search')) {
      config.onProgress?.(currentTaskIndex, {
        toolName: 'web_search',
        status: 'planning',
        message: 'Analyzing question and planning intelligent search strategy...',
      });

      const searchPlan = await createSearchPlan(
        currentTask.question,
        'advanced',
        config.openaiApiKey,
        config.model
      );

      config.onProgress?.(currentTaskIndex, {
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
              config.onProgress?.(currentTaskIndex, {
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
          config.onProgress?.(currentTaskIndex, {
            toolName: 'web_search',
            status: 'searching',
            message: `Search ${searchIndex}/${total}: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`,
          });
        }
      );

      searchResults = multiSearchResult.formattedOutput;
      sources.push(...multiSearchResult.allSources);

      config.onProgress?.(currentTaskIndex, {
        toolName: 'web_search',
        status: 'completed',
        message: `Found ${sources.length} sources${multiSearchResult.allImages.length > 0 ? ` and ${multiSearchResult.allImages.length} images` : ''} from ${searchPlan.recommendedSearches.length} targeted searches`,
      });
    }

    config.onProgress?.(currentTaskIndex, {
      toolName: 'llm',
      status: 'processing',
      message: 'Analyzing findings...',
    });

    const llm = new ChatOpenAI({
      model: config.model,
      apiKey: config.openaiApiKey,
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
    
    const response = await llm.invoke(
      [
        { role: 'system', content: workerPrompt },
        { role: 'user', content: combinedContext },
      ],
      { signal: config.abortSignal }
    );

    const result = Array.isArray(response.content)
      ? response.content
          .filter((part): part is { type: 'text'; text: string } => 
            part && part.type === 'text' && 'text' in part && typeof part.text === 'string'
          )
          .map((part) => part.text)
          .join('\n')
      : String(response.content ?? '');

    updatedTask.status = 'completed';
    updatedTask.result = result;
    updatedTask.sources = sources;

    const newCompletedTasks = [...completedTasks, updatedTask];
    const newTaskQueue = taskQueue.map((task, idx) =>
      idx === currentTaskIndex ? updatedTask : task
    );

    return {
      taskQueue: newTaskQueue,
      completedTasks: newCompletedTasks,
      currentTaskIndex: currentTaskIndex + 1,
    };

  } catch (error) {
    console.error('[Worker Node] ❌ Error:', error);
    if (currentTask.retries < MAX_RETRIES) {
      updatedTask.retries += 1;
      updatedTask.status = 'pending';
      
      const newTaskQueue = taskQueue.map((task, idx) =>
        idx === currentTaskIndex ? updatedTask : task
      );

      return {
        taskQueue: newTaskQueue,
      };
    } else {
      updatedTask.status = 'failed';
      updatedTask.error = error instanceof Error ? error.message : 'Unknown error';

      const newCompletedTasks = [...completedTasks, updatedTask];
      const newTaskQueue = taskQueue.map((task, idx) =>
        idx === currentTaskIndex ? updatedTask : task
      );

      return {
        taskQueue: newTaskQueue,
        completedTasks: newCompletedTasks,
        currentTaskIndex: currentTaskIndex + 1,
      };
    }
  }
}
