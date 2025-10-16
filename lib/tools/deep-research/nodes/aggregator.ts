import { ChatOpenAI } from '@langchain/openai';
import type { ResearchState } from '../state';
import { AGGREGATOR_SYSTEM_PROMPT } from '../prompts';

export async function aggregatorNode(
  state: ResearchState,
  config: { openaiApiKey: string; model: string; abortSignal?: AbortSignal }
): Promise<Partial<ResearchState>> {
  // Check if aborted
  if (config.abortSignal?.aborted) {
    throw new Error('Research aborted by user');
  }
  const { completedTasks = [] } = state;

  if (completedTasks.length === 0) {
    return {
      aggregatedResults: 'No research findings to aggregate.',
    };
  }

  const llm = new ChatOpenAI({
    model: config.model,
    apiKey: config.openaiApiKey,
  });

  try {
    const findingsText = completedTasks
      .map((task, index) => {
        if (task.status === 'failed') {
          return `## Question ${index + 1}: ${task.question}\n**Status:** Failed - ${task.error || 'Unknown error'}`;
        }
        return `## Question ${index + 1}: ${task.question}\n\n${task.result || 'No result'}`;
      })
      .join('\n\n---\n\n');

    const response = await llm.invoke([
      { role: 'system', content: AGGREGATOR_SYSTEM_PROMPT },
      { role: 'user', content: `Synthesize these research findings:\n\n${findingsText}` },
    ]);

    const aggregated = response.content.toString();
    return {
      aggregatedResults: aggregated,
    };

  } catch (error) {
    console.error('[Aggregator Node] ❌ Error:', error);
    const fallbackResults = completedTasks
      .map((task) => `**${task.question}**\n${task.result || task.error || 'No result'}`)
      .join('\n\n');

    return {
      aggregatedResults: fallbackResults,
    };
  }
}
