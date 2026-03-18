import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import type { ResearchState } from '../state';
import { createEvaluationPrompt } from '../prompts';
import type { EvaluationResult, StrictnessLevel } from '@/types/deepResearch';
import { getStageModel } from '@/lib/modelPolicy';
import { invokeStructuredOutput } from '../structuredOutput';
import { DEEP_RESEARCH_MAX_ATTEMPTS } from '../constants';
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

    const evaluationResult: EvaluationResult = await invokeStructuredOutput(
      llm,
      evaluationResultSchema,
      'DeepResearchEvaluation',
      [{ role: 'system', content: evaluationPrompt }],
      config.abortSignal
    );
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

    if (currentAttempt < DEEP_RESEARCH_MAX_ATTEMPTS) {
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
