import { ChatOpenAI } from '@langchain/openai';
import type { ResearchState } from '../state';
import type { ResearchTask, ResearchQuestion } from '@/types/tools';
import { PLANNER_SYSTEM_PROMPT } from '../prompts';

export async function plannerNode(
  state: ResearchState,
  config: { openaiApiKey: string; model: string; abortSignal?: AbortSignal }
): Promise<Partial<ResearchState>> {
  if (config.abortSignal?.aborted) {
    throw new Error('Research aborted by user');
  }
  const llm = new ChatOpenAI({
    model: config.model,
    apiKey: config.openaiApiKey,
  });

  try {
    const response = await llm.invoke([
      { role: 'system', content: PLANNER_SYSTEM_PROMPT },
      { role: 'user', content: `User query: "${state.originalQuery}"\n\nCreate a research plan.` },
    ]);

    const content = response.content.toString();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('Failed to parse research plan');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const researchPlan: ResearchQuestion[] = parsed.plan || [];

    if (researchPlan.length === 0) {
      researchPlan.push({
        question: state.originalQuery,
        rationale: 'Direct research of the user query',
        suggestedTools: ['web_search'],
      });
    }

    const taskQueue: ResearchTask[] = researchPlan.map((q, index) => ({
      id: `task_${index + 1}`,
      question: q.question,
      tools: q.suggestedTools,
      status: 'pending' as const,
      retries: 0,
    }));

    return {
      researchPlan,
      taskQueue,
      completedTasks: [],
      currentTaskIndex: 0,
    };
  } catch (error) {
    console.error('[Planner Node] ❌ Error:', error);
    const fallbackPlan: ResearchQuestion[] = [{
      question: state.originalQuery,
      rationale: 'Fallback: Direct research of the user query due to planning error',
      suggestedTools: ['web_search'],
    }];
    
    const taskQueue: ResearchTask[] = fallbackPlan.map((q, index) => ({
      id: `task_${index + 1}`,
      question: q.question,
      tools: q.suggestedTools,
      status: 'pending' as const,
      retries: 0,
    }));
    
    return {
      researchPlan: fallbackPlan,
      taskQueue,
      completedTasks: [],
      currentTaskIndex: 0,
      error: `Planning error (using fallback): ${error}`,
    };
  }
}
