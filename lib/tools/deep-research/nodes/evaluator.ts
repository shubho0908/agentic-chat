import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import type { ResearchState } from '../state';
import { createEvaluationPrompt } from '../prompts';
import type { EvaluationResult, StrictnessLevel } from '@/types/deep-research';
import { getStageModel } from '@/lib/model-policy';

const MAX_ATTEMPTS = 3; // Total attempts allowed (1 initial + 2 retries)
const evaluationResultSchema = z.object({
  meetsStandards: z.boolean(),
  isRelevant: z.boolean(),
  feedback: z.string(),
  rewrittenPrompt: z.string().optional(),
  score: z.number(),
});

export async function evaluatorNode(
  state: ResearchState,
  config: { openaiApiKey: string; model: string; abortSignal?: AbortSignal }
): Promise<Partial<ResearchState>> {
  if (config.abortSignal?.aborted) {
    throw new Error('Research aborted by user');
  }
  const llm = new ChatOpenAI({
    model: getStageModel(config.model, 'research_evaluator'),
    apiKey: config.openaiApiKey,
  });

  try {
    const currentAttempt = state.currentAttempt || 1;
    const strictnessLevel: StrictnessLevel = Math.min(currentAttempt - 1, 2) as StrictnessLevel;

    const responseToEvaluate = state.aggregatedResults || state.finalResponse;
    if (!responseToEvaluate) {
      return {
        evaluationResult: {
          meetsStandards: true,
          isRelevant: true,
          feedback: 'No response to evaluate',
          score: 100,
        },
      };
    }

    const evaluationPrompt = createEvaluationPrompt(
      strictnessLevel,
      state.originalQuery,
      responseToEvaluate
    );

    const response = await llm.invoke(
      [{ role: 'system', content: evaluationPrompt }],
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
      return {
        evaluationResult: {
          meetsStandards: false,
          isRelevant: false,
          feedback: 'Evaluator returned an empty payload',
          score: 0,
        },
        currentAttempt,
        strictnessLevel,
      };
    }

    const parsedEvaluationResult = evaluationResultSchema.safeParse(JSON.parse(rawContent));
    if (!parsedEvaluationResult.success) {
      throw new Error('Invalid evaluation payload');
    }
    const evaluationResult: EvaluationResult = parsedEvaluationResult.data;
    const evaluationFeedback = [
      ...(state.evaluationFeedback || []),
      `Attempt ${currentAttempt} (Level ${strictnessLevel}): ${evaluationResult.feedback}`,
    ];

    if (evaluationResult.meetsStandards) {
      return {
        evaluationResult,
        currentAttempt,
        strictnessLevel,
        evaluationFeedback,
      };
    }

    if (currentAttempt < MAX_ATTEMPTS) {
      return {
        evaluationResult,
        currentAttempt: currentAttempt + 1,
        strictnessLevel: Math.min(currentAttempt, 2) as StrictnessLevel,
        evaluationFeedback,
        taskQueue: [],
        completedTasks: [],
        currentTaskIndex: 0,
      };
    }

    return {
      evaluationResult,
      currentAttempt,
      strictnessLevel,
      evaluationFeedback,
    };

  } catch (error) {
    console.error('[Evaluator Node] ❌ Error:', error);
    return {
      evaluationResult: {
        meetsStandards: false,
        isRelevant: false,
        feedback: `Evaluation error: ${error}`,
        score: 0,
      },
      error: `Evaluation error: ${error}`,
    };
  }
}
