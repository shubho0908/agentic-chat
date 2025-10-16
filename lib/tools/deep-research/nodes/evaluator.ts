import { ChatOpenAI } from '@langchain/openai';
import type { ResearchState } from '../state';
import { createEvaluationPrompt } from '../prompts';
import type { EvaluationResult, StrictnessLevel } from '@/types/deep-research';

const MAX_ATTEMPTS = 2; // Total attempts allowed (1 initial + 1 retry)

export async function evaluatorNode(
  state: ResearchState,
  config: { openaiApiKey: string; model: string; abortSignal?: AbortSignal }
): Promise<Partial<ResearchState>> {
  if (config.abortSignal?.aborted) {
    throw new Error('Research aborted by user');
  }
  const llm = new ChatOpenAI({
    modelName: config.model,
    openAIApiKey: config.openaiApiKey,
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

    const response = await llm.invoke([
      { role: 'system', content: evaluationPrompt },
    ]);

    const content = response.content.toString();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      return {
        evaluationResult: {
          meetsStandards: true,
          isRelevant: true,
          feedback: 'Unable to parse evaluation, proceeding',
          score: 75,
        },
        currentAttempt,
        strictnessLevel,
      };
    }

    const evaluationResult: EvaluationResult = JSON.parse(jsonMatch[0]);
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
      evaluationResult: {
        ...evaluationResult,
        meetsStandards: true, // Force pass to proceed
      },
      currentAttempt,
      strictnessLevel,
      evaluationFeedback,
    };

  } catch (error) {
    console.error('[Evaluator Node] ❌ Error:', error);
    return {
      evaluationResult: {
        meetsStandards: true,
        isRelevant: true,
        feedback: `Evaluation error: ${error}`,
        score: 0,
      },
      error: `Evaluation error: ${error}`,
    };
  }
}
