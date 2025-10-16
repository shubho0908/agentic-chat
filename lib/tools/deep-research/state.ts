import { Annotation } from '@langchain/langgraph';
import type { ResearchTask, ResearchQuestion } from '@/types/tools';
import type { 
  GateDecision, 
  Citation,
  EvaluationResult,
  StrictnessLevel,
  DirectLLMResponse
} from '@/types/deep-research';

export const ResearchStateAnnotation = Annotation.Root({
  originalQuery: Annotation<string>,
  
  // Gate phase
  gateDecision: Annotation<GateDecision | undefined>,
  directResponse: Annotation<DirectLLMResponse | undefined>,
  skipped: Annotation<boolean>,
  
  // Research phase
  researchPlan: Annotation<ResearchQuestion[]>,
  taskQueue: Annotation<ResearchTask[]>,
  completedTasks: Annotation<ResearchTask[]>,
  currentTaskIndex: Annotation<number>,
  aggregatedResults: Annotation<string>,
  
  // Evaluation phase
  currentAttempt: Annotation<number>,
  strictnessLevel: Annotation<StrictnessLevel>,
  evaluationResult: Annotation<EvaluationResult | undefined>,
  evaluationFeedback: Annotation<string[]>,
  
  // Output phase
  citations: Annotation<Citation[]>,
  followUpQuestions: Annotation<string[]>,
  finalResponse: Annotation<string>,
  
  // Error handling
  error: Annotation<string | undefined>,
});

export type ResearchState = typeof ResearchStateAnnotation.State;
