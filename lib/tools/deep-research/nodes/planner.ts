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
    let planningContext = '';
    if (state.documentContextForPlanning) {
      planningContext += `\n\n## ATTACHED DOCUMENT CONTENT:\n${state.documentContextForPlanning}\n\n`;
      planningContext += `CRITICAL: The user has attached documents. Your research questions MUST be highly SPECIFIC to the content above. `;
      planningContext += `Reference specific details, concepts, data points, and topics mentioned in the documents. `;
      planningContext += `Use ["rag", "web_search"] tools to combine document insights with broader research.\n`;
    }
    
    if (state.imageContext) {
      planningContext += `\n\n## ATTACHED IMAGE CONTENT:\n${state.imageContext}\n\n`;
      planningContext += `CRITICAL: The user has attached images. Your research questions MUST reference the visual information, `;
      planningContext += `diagrams, charts, data, or concepts shown in the images. Be specific about what you see in the images.\n`;
    }
    
    if (state.hasDocuments || state.hasImages) {
      planningContext += `\n\nAvailable Tools:\n`;
      if (state.hasDocuments) {
        planningContext += `- "rag": Retrieves relevant sections from attached documents\n`;
      }
      planningContext += `- "web_search": Searches the internet for additional information\n`;
      planningContext += `\nIMPORTANT: Prioritize ["rag", "web_search"] to combine document/image insights with broader web research.\n`;
    }

    const userPrompt = planningContext 
      ? `User query: "${state.originalQuery}"${planningContext}\n\nCreate a comprehensive research plan with 3-6 HIGHLY SPECIFIC questions (max 6) based on the attached content above and query complexity. Make questions extremely detailed and reference specific aspects of the documents/images.`
      : `User query: "${state.originalQuery}"\n\nCreate a comprehensive research plan with 3-6 detailed questions (max 6) based on the query complexity. Simpler queries need 3-4 questions, complex topics can have 5-6 questions, but never exceed 6.`;

    const response = await llm.invoke(
      [
        { role: 'system', content: PLANNER_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { signal: config.abortSignal }
    );

    const rawContent = Array.isArray(response.content)
      ? response.content
          .filter((part): part is { type: 'text'; text: string } => 
            part && part.type === 'text' && 'text' in part && typeof part.text === 'string'
          )
          .map((part) => part.text)
          .join('\n')
      : String(response.content ?? '');
    
    if (!rawContent.trim()) {
      throw new Error('Failed to parse research plan');
    }

    const parsed = JSON.parse(rawContent);
    const researchPlan: ResearchQuestion[] = parsed.plan || [];

    if (researchPlan.length === 0) {
      const defaultTools = state.hasDocuments ? ['rag', 'web_search'] : ['web_search'];
      researchPlan.push({
        question: state.originalQuery,
        rationale: 'Direct research of the user query',
        suggestedTools: defaultTools,
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
