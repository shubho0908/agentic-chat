import { STRING_ENUM } from "@/constants/stringEnums";
import { ChatOpenAI } from '@langchain/openai';
import type { ResearchState } from '../state';
import { AGGREGATOR_SYSTEM_PROMPT } from '../prompts';
import { getLangChainChatModelOptions, getStageModel } from '@/lib/modelPolicy';


import { logger } from "@/lib/logger";
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

  const aggregatorModel = getStageModel(config.model, 'research_aggregator');
  const llm = new ChatOpenAI({
    model: aggregatorModel,
    apiKey: config.openaiApiKey,
    ...getLangChainChatModelOptions(aggregatorModel, {
      promptCacheKey: 'agentic-chat-research-aggregator',
    }),
  });

  try {
    const findingsText = completedTasks
      .map((task, index) => {
        if (task.status === STRING_ENUM.FAILED) {
          return `## Question ${index + 1}: ${task.question}\n**Status:** Failed - ${task.error || 'Unknown error'}`;
        }
        return `## Question ${index + 1}: ${task.question}\n\n${task.result || 'No result'}`;
      })
      .join('\n\n---\n\n');

    const response = await llm.invoke(
      [
        { role: 'system', content: AGGREGATOR_SYSTEM_PROMPT },
        { 
          role: 'user', 
          content: `**Original Research Question:** ${state.originalQuery}\n\n**Number of Research Questions:** ${completedTasks.length}\n\n**Research Findings to Synthesize:**\n\n${findingsText}\n\nCreate a concise but complete synthesis of roughly 1200-1800 words. Focus on claims that are well supported, disagreements between sources, and the details needed to answer the user accurately.`
        },
      ],
      { signal: config.abortSignal }
    );

    const aggregated = Array.isArray(response.content)
      ? response.content
          .filter((part): part is { type: 'text'; text: string } => 
            part && part.type === STRING_ENUM.TEXT && 'text' in part && typeof part.text === 'string'
          )
          .map((part) => part.text)
          .join('\n')
      : String(response.content ?? '');
    
    return {
      aggregatedResults: aggregated,
    };

  } catch (error) {
    logger.error('[Aggregator Node] ❌ Error:', error);
    const fallbackResults = completedTasks
      .map((task) => `**${task.question}**\n${task.result || task.error || 'No result'}`)
      .join('\n\n');

    return {
      aggregatedResults: fallbackResults,
    };
  }
}
