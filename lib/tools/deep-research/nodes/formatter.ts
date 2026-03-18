import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import type { ResearchState } from '../state';
import type { Citation } from '@/types/deepResearch';
import { getStageModel } from '@/lib/modelPolicy';
import { invokeStructuredOutput } from '../structuredOutput';


import { logger } from "@/lib/logger";
const formatterSchema = z.object({
  response: z.string(),
  citations: z.array(z.object({
    id: z.string(),
    source: z.string(),
    author: z.string().optional(),
    year: z.string().optional(),
    url: z.string().optional(),
    relevance: z.string(),
  })).default([]),
  followUpQuestions: z.array(z.string()).default([]),
});

const ENHANCED_FORMATTER_PROMPT = `Turn the synthesis into a polished final markdown answer.

Requirements:
- Write a useful answer, usually 1200-2200 words unless the evidence is thin.
- Start with a strong H1 title.
- Use clear sections, bullets, and short paragraphs.
- Preserve important numbers, dates, examples, and caveats.
- Do not invent citation metadata. Only include citations that are explicitly supported by the provided findings.
- Prefer clarity and evidence density over verbosity.

Respond with ONLY a JSON object:
{
  "response": "Final markdown answer",
  "citations": [
    {
      "id": "cite1",
      "source": "Source title",
      "author": "Author if known",
      "year": "Year if known",
      "url": "https://example.com",
      "relevance": "How this source supports the answer"
    }
  ],
  "followUpQuestions": [
    "Optional follow-up question"
  ]
}`;

export async function formatterNode(
  state: ResearchState,
  config: { openaiApiKey: string; model: string; abortSignal?: AbortSignal }
): Promise<Partial<ResearchState>> {
  if (config.abortSignal?.aborted) {
    throw new Error('Research aborted by user');
  }
  const { originalQuery, aggregatedResults, completedTasks = [] } = state;

  let contentToFormat = aggregatedResults;
  
  if (!contentToFormat || contentToFormat === 'No research findings to aggregate.') {
    if (completedTasks.length > 0) {
      contentToFormat = completedTasks
        .map((task, index) => {
          if (task.status === 'failed') {
            return `## Question ${index + 1}: ${task.question}\n**Status:** Failed - ${task.error || 'Unknown error'}`;
          }
          return `## Question ${index + 1}: ${task.question}\n\n${task.result || 'No result'}`;
        })
        .join('\n\n---\n\n');
      
    } else {
      return {
        finalResponse: 'Unable to generate research response - no research data available. Please try again.',
        citations: [],
        followUpQuestions: [],
      };
    }
  }

  const llm = new ChatOpenAI({
    model: getStageModel(config.model, 'research_formatter'),
    apiKey: config.openaiApiKey,
  });

  try {
    const formatted = await invokeStructuredOutput(
      llm,
      formatterSchema,
      'DeepResearchFinalResponse',
      [
        { role: 'system', content: ENHANCED_FORMATTER_PROMPT },
        {
          role: 'user',
          content: `**Original Question:** ${originalQuery}\n\n**Research Findings:**\n${contentToFormat}\n\nCreate the final answer with clean markdown, grounded citations, and concise follow-up questions when they add value.`,
        },
      ],
      config.abortSignal
    );
    const finalResponse = formatted.response || contentToFormat;
    const citations: Citation[] = formatted.citations || [];
    const followUpQuestions: string[] = formatted.followUpQuestions || [];

    if (citations.length === 0 && state.completedTasks) {
      citations.push(...extractCitationsFromTaskSources(state.completedTasks));
    }

    return {
      finalResponse,
      citations,
      followUpQuestions,
    };

  } catch (error) {
    logger.error('[Formatter Node] ❌ Error:', error);
    return {
      finalResponse: contentToFormat || 'Error generating research response.',
      citations: extractCitationsFromTaskSources(state.completedTasks || []),
      followUpQuestions: [],
    };
  }
}

function extractCitationsFromTaskSources(tasks: ResearchState['completedTasks']): Citation[] {
  const seenKeys = new Set<string>();
  const uniqueSources = tasks
    .flatMap((task) => task.sources || [])
    .filter((source, index) => {
      const key = source.url ?? `${source.title ?? 'untitled'}::${index}`;
      if (seenKeys.has(key)) {
        return false;
      }

      seenKeys.add(key);
      return true;
    });

  return uniqueSources.map((source, index) => ({
    id: `cite${index + 1}`,
    source: source.title,
    url: source.url,
    relevance: 'Verified source used during research',
  }));
}
