import type { ResearchState } from '../state';
import type { ResearchTask, ResearchQuestion } from '@/types/tools';
import { createUnifiedPlan, type DeepResearchPlan } from '@/lib/tools/unified-planner';

export async function plannerNode(
  state: ResearchState,
  config: { openaiApiKey: string; model: string; abortSignal?: AbortSignal }
): Promise<Partial<ResearchState>> {
  if (config.abortSignal?.aborted) {
    throw new Error('Research aborted by user');
  }

  try {
    const plan = await createUnifiedPlan({
      query: state.originalQuery,
      toolType: 'deep_research',
      apiKey: config.openaiApiKey,
      model: config.model,
      abortSignal: config.abortSignal,
      documentContext: state.documentContextForPlanning,
      imageContext: state.imageContext,
      hasDocuments: state.hasDocuments,
      hasImages: state.hasImages,
    }) as DeepResearchPlan;

    const researchPlan: ResearchQuestion[] = plan.questions || [];

    if (researchPlan.length === 0) {
      const defaultTools = state.hasDocuments ? ['rag', 'web_search'] : ['web_search'];
      researchPlan.push({
        question: state.originalQuery,
        rationale: 'Direct research of the user query',
        suggestedTools: defaultTools,
      });
    }

    const webSearchCount = researchPlan.filter(q => q.suggestedTools.includes('web_search')).length;
    if (webSearchCount < 2 && researchPlan.length >= 2) {
      let added = 0;
      for (let i = 0; i < researchPlan.length && added < 2 - webSearchCount; i++) {
        if (!researchPlan[i].suggestedTools.includes('web_search')) {
          researchPlan[i].suggestedTools = [...researchPlan[i].suggestedTools, 'web_search'];
          added++;
        }
      }
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
    const defaultTools = state.hasDocuments ? ['rag', 'web_search'] : ['web_search'];
    const fallbackPlan: ResearchQuestion[] = [{
      question: state.originalQuery,
      rationale: 'Fallback: Direct research of the user query due to planning error',
      suggestedTools: defaultTools,
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
