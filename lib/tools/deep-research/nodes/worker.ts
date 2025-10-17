import { ChatOpenAI } from '@langchain/openai';
import type { ResearchState } from '../state';
import type { ResearchTask, WebSearchProgress, WebSearchSource } from '@/types/tools';
import { createWorkerPrompt } from '../prompts';
import { executeWebSearch } from '../../web-search';

const MAX_RETRIES = 2;

export async function workerNode(
  state: ResearchState,
  config: { 
    openaiApiKey: string;
    model: string;
    onProgress?: (taskIndex: number, toolProgress: { toolName: string; status: string; message: string }) => void;
    abortSignal?: AbortSignal;
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

    if (currentTask.tools.includes('web_search')) {
      config.onProgress?.(currentTaskIndex, {
        toolName: 'web_search',
        status: 'searching',
        message: 'Searching the web...',
      });

      const progressCallback = (progress: WebSearchProgress) => {
        config.onProgress?.(currentTaskIndex, {
          toolName: 'web_search',
          status: progress.status,
          message: progress.message,
        });
      };

      searchResults = await executeWebSearch(
        {
          query: currentTask.question,
          maxResults: 15,
          searchDepth: 'advanced',
          includeAnswer: false,
        },
        progressCallback,
        config.abortSignal
      );

      const sourcePattern = /(\d+)\.\s+(.+?)\n\s+URL:\s+(.+?)\n\s+Content:\s+(.+?)\n\s+Relevance Score:\s+([\d.]+)%/g;
      let match;
      let position = 1;
      
      while ((match = sourcePattern.exec(searchResults)) !== null) {
        const [, , title, url, snippet, score] = match;
        sources.push({
          position,
          title: title.trim(),
          url: url.trim(),
          domain: new URL(url.trim()).hostname.replace('www.', ''),
          snippet: snippet.trim().substring(0, 150),
          score: parseFloat(score) / 100,
        });
        position++;
      }
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

    const workerPrompt = createWorkerPrompt(currentTask.question, previousFindings);
    
    const response = await llm.invoke(
      [
        { role: 'system', content: workerPrompt },
        { role: 'user', content: searchResults || 'Please answer based on your knowledge.' },
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
