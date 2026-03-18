import { ChatOpenAI } from '@langchain/openai';
import type OpenAI from 'openai';
import { z } from 'zod';
import { UNIFIED_SYSTEM_PROMPT } from '@/lib/prompts';
import { WEB_SEARCH_PLANNING_PROMPT } from '@/lib/tools/web-search/prompts';
import { PLANNER_SYSTEM_PROMPT as DEEP_RESEARCH_PLANNING_PROMPT } from '@/lib/tools/deep-research/prompts';
import { GOOGLE_WORKSPACE_SYSTEM_PROMPT as GOOGLE_SUITE_PLANNING_PROMPT } from '@/lib/tools/google-suite/prompts';
import { getStageModel } from '@/lib/modelPolicy';


import { logger } from "@/lib/logger";
type ToolType = 'web_search' | 'deep_research' | 'google_suite';

interface UnifiedPlannerConfig {
  query: string;
  toolType: ToolType;
  apiKey: string;
  model: string;
  abortSignal?: AbortSignal;
  searchDepth?: 'basic' | 'advanced';
  conversationHistory?: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  documentContext?: string;
  imageContext?: string;
  hasDocuments?: boolean;
  hasImages?: boolean;
}

export interface WebSearchPlan {
  originalQuery: string;
  queryType: 'factual' | 'comparative' | 'analytical' | 'exploratory' | 'how-to' | 'current-events';
  complexity: 'simple' | 'moderate' | 'complex';
  recommendedSearches: Array<{
    query: string;
    rationale: string;
    expectedResultCount: number;
    priority: 'high' | 'medium' | 'low';
  }>;
  totalResultsNeeded: number;
  reasoning: string;
}

export interface DeepResearchPlan {
  questions: Array<{
    question: string;
    rationale: string;
    suggestedTools: string[];
  }>;
  complexity: 'simple' | 'moderate' | 'complex';
  reasoning: string;
}

interface GoogleSuitePlan {
  actions: Array<{
    tool: string;
    description: string;
    args: Record<string, unknown>;
    rationale: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  reasoning: string;
}

type UnifiedPlan = WebSearchPlan | DeepResearchPlan | GoogleSuitePlan;

const webSearchPlannerOutputSchema = z.object({
  queryType: z.enum(['factual', 'comparative', 'analytical', 'exploratory', 'how-to', 'current-events']),
  complexity: z.enum(['simple', 'moderate', 'complex']),
  recommendedSearches: z.array(z.object({
    query: z.string(),
    rationale: z.string(),
    expectedResultCount: z.number().int().min(1).max(20),
    priority: z.enum(['high', 'medium', 'low']),
  })).min(1),
  reasoning: z.string(),
});

const deepResearchPlanSchema = z.object({
  plan: z.array(z.object({
    question: z.string(),
    rationale: z.string(),
    suggestedTools: z.array(z.string()).min(1),
  })).min(1),
});

const googleSuitePlanSchema = z.object({
  actions: z.array(z.object({
    tool: z.string(),
    description: z.string(),
    args: z.record(z.string(), z.unknown()),
    rationale: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
  })),
  reasoning: z.string(),
});

function getToolSpecificPrompt(toolType: ToolType): string {
  switch (toolType) {
    case 'web_search':
      return WEB_SEARCH_PLANNING_PROMPT;
    case 'deep_research':
      return DEEP_RESEARCH_PLANNING_PROMPT;
    case 'google_suite':
      return GOOGLE_SUITE_PLANNING_PROMPT;
  }
}

function serializeMessageContent(content: OpenAI.Chat.Completions.ChatCompletionMessageParam['content']): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => {
      if (part.type === 'text') {
        return part.text;
      }
      if (part.type === 'image_url') {
        return '[Image attached]';
      }
      return '';
    })
    .filter(Boolean)
    .join(' ');
}

function buildUserPrompt(config: UnifiedPlannerConfig): string {
  let prompt = `Query: "${config.query}"\n\nTool: ${config.toolType}\n`;

  if (config.searchDepth) {
    prompt += `\nSearch Depth: ${config.searchDepth}`;
  }

  if (config.documentContext) {
    prompt += `\n\n## ATTACHED DOCUMENT CONTENT:\n${config.documentContext}\n`;
    prompt += `\nCRITICAL: The user has attached documents. Your plan MUST be highly SPECIFIC to this content.`;
  }

  if (config.imageContext) {
    prompt += `\n\n## ATTACHED IMAGE CONTENT:\n${config.imageContext}\n`;
    prompt += `\nCRITICAL: The user has attached images. Your plan MUST reference the visual information shown.`;
  }

  if (config.hasDocuments && config.toolType === 'deep_research') {
    prompt += `\n\nAvailable: "rag" tool for document queries + "web_search" for internet research.`;
    prompt += `\nPrioritize combining both tools for comprehensive answers.`;
  }

  if (config.conversationHistory && config.conversationHistory.length > 0) {
    const recentHistory = config.conversationHistory.slice(-3);
    prompt += `\n\n## CONVERSATION CONTEXT:\n${recentHistory.map(m => `${m.role}: ${serializeMessageContent(m.content)}`).join('\n')}`;
  }

  prompt += `\n\nCreate an optimal execution plan as JSON.`;
  
  return prompt;
}

export async function createUnifiedPlan(config: UnifiedPlannerConfig): Promise<UnifiedPlan> {
  const createFallbackPlan = (): UnifiedPlan => {
    switch (config.toolType) {
      case 'web_search':
        return {
          originalQuery: config.query,
          queryType: 'exploratory',
          complexity: 'moderate',
          recommendedSearches: [
            {
              query: config.query,
              rationale: 'Direct search (fallback)',
              expectedResultCount: 10,
              priority: 'high',
            },
          ],
          totalResultsNeeded: 10,
          reasoning: 'Fallback: single direct search',
        } as WebSearchPlan;

      case 'deep_research':
        const defaultTools = config.hasDocuments ? ['rag', 'web_search'] : ['web_search'];
        return {
          questions: [
            {
              question: config.query,
              rationale: 'Direct research (fallback)',
              suggestedTools: defaultTools,
            },
          ],
          complexity: 'moderate',
          reasoning: 'Fallback: direct research question',
        } as DeepResearchPlan;

      case 'google_suite':
        return {
          actions: [],
          reasoning: 'Fallback: no actions planned',
        } as GoogleSuitePlan;

    }
  };

  if (config.toolType === 'web_search' && config.searchDepth === 'basic') {
    return {
      originalQuery: config.query,
      queryType: 'factual',
      complexity: 'simple',
      recommendedSearches: [
        {
          query: config.query,
          rationale: 'Direct search for quick result',
          expectedResultCount: 6,
          priority: 'high',
        },
      ],
      totalResultsNeeded: 6,
      reasoning: 'Basic search: single focused query',
    } as WebSearchPlan;
  }

  try {
    if (config.abortSignal?.aborted) {
      throw new Error('Planning aborted by user');
    }

    const llm = new ChatOpenAI({
      model: getStageModel(config.model, 'tool_planner'),
      apiKey: config.apiKey,
    });

    const systemPrompt = UNIFIED_SYSTEM_PROMPT + '\n\n' + getToolSpecificPrompt(config.toolType);
    const userPrompt = buildUserPrompt(config);

    if (config.toolType === 'web_search') {
      const plan = await llm
        .withStructuredOutput(webSearchPlannerOutputSchema)
        .invoke(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          { signal: config.abortSignal }
        ) as WebSearchPlan;
      
      if (!plan.recommendedSearches || plan.recommendedSearches.length === 0) {
        return createFallbackPlan();
      }

      if (plan.recommendedSearches.length > 5) {
        plan.recommendedSearches = plan.recommendedSearches.slice(0, 5);
      }

      const totalResults = plan.recommendedSearches.reduce((sum, s) => sum + s.expectedResultCount, 0);
      if (totalResults > 25) {
        const scale = 25 / totalResults;
        plan.recommendedSearches = plan.recommendedSearches.map(s => ({
          ...s,
          expectedResultCount: Math.max(3, Math.round(s.expectedResultCount * scale)),
        }));
        plan.totalResultsNeeded = 25;
      } else {
        plan.totalResultsNeeded = totalResults;
      }

      plan.originalQuery = config.query;

      return plan;
    }

    if (config.toolType === 'deep_research') {
      const parsed = await llm
        .withStructuredOutput(deepResearchPlanSchema)
        .invoke(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          { signal: config.abortSignal }
        );
      const questions = parsed.plan || [];
      
      if (questions.length === 0) {
        return createFallbackPlan();
      }

      const plan: DeepResearchPlan = {
        questions,
        complexity: questions.length <= 3 ? 'simple' : questions.length <= 4 ? 'moderate' : 'complex',
        reasoning: 'Research plan generated',
      };

      if (plan.questions.length > 6) {
        plan.questions = plan.questions.slice(0, 6);
      }

      const webSearchCount = plan.questions.filter(q => q.suggestedTools.includes('web_search')).length;
      if (webSearchCount < 2 && plan.questions.length >= 2) {
        let added = 0;
        for (let i = 0; i < plan.questions.length && added < 2 - webSearchCount; i++) {
          if (!plan.questions[i].suggestedTools.includes('web_search')) {
            plan.questions[i].suggestedTools = [...plan.questions[i].suggestedTools, 'web_search'];
            added++;
          }
        }
      }

      return plan;
    }

    if (config.toolType === 'google_suite') {
      const plan = await llm
        .withStructuredOutput(googleSuitePlanSchema)
        .invoke(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          { signal: config.abortSignal }
        ) as GoogleSuitePlan;

      return {
        actions: plan.actions || [],
        reasoning: plan.reasoning || 'Planned Google Workspace actions',
      } as GoogleSuitePlan;
    }

    return createFallbackPlan();
  } catch (error) {
    logger.error('[Unified Planner] Error:', error);
    return createFallbackPlan();
  }
}
