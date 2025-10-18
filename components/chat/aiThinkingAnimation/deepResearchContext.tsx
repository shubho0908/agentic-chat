import { DeepResearchTimeline } from "./deepResearchTimeline";
import type { MemoryStatusProps } from "./types";

export function DeepResearchContext({ memoryStatus }: MemoryStatusProps) {
  const progress = memoryStatus.toolProgress;
  const details = progress?.details;
  const progressStatus = details?.status || progress?.status;

  if (progressStatus === 'gate_skip') {
    return null;
  }

  const timelineSteps = [];
  
  const docPrepStatuses = ['preparing_documents', 'waiting_documents', 'documents_ready', 'processing_images', 'analyzing_documents'];
  const isDocPrep = progressStatus && docPrepStatuses.includes(progressStatus);
  
  const isAfterGate = progressStatus && !['gate_check', 'gate_skip', ...docPrepStatuses].includes(progressStatus);
  timelineSteps.push({
    label: 'Query Analysis',
    status: (isAfterGate ? 'completed' : progressStatus === 'gate_check' ? 'current' : 'pending') as 'completed' | 'current' | 'pending' | 'failed',
    details: isAfterGate ? 'Deep research needed' : undefined,
  });

  const hasResearchPlan = details?.researchPlan && details.researchPlan.length > 0;
  const isAfterPlanning = progressStatus && !['gate_check', 'planning', ...docPrepStatuses].includes(progressStatus);
  const researchPlanLength = details?.researchPlan?.length ?? 0;
  timelineSteps.push({
    label: hasResearchPlan ? `Planning (${researchPlanLength} tasks)` : 'Planning',
    status: (isAfterPlanning ? 'completed' : progressStatus === 'planning' ? 'current' : 'pending') as 'completed' | 'current' | 'pending' | 'failed',
    details: hasResearchPlan && isAfterPlanning ? `${researchPlanLength} research tasks created` : undefined,
    data: { researchPlan: details?.researchPlan },
  });

  const isResearching = ['task_start', 'task_progress', 'task_complete'].includes(progressStatus || '');
  const currentTaskIndex = details?.currentTaskIndex ?? 0;
  const totalTasks = details?.totalTasks ?? details?.researchPlan?.length ?? 0;
  const completedTasks = details?.completedTasks || [];
  const isAfterResearch = completedTasks.length > 0 && !isResearching && !isDocPrep;
  
  timelineSteps.push({
    label: isResearching 
      ? `Research (${Math.min(currentTaskIndex + 1, totalTasks)}/${totalTasks})`
      : completedTasks.length > 0 
        ? `Research (${completedTasks.length}/${totalTasks} completed)`
        : 'Research',
    status: (isAfterResearch ? 'completed' : isResearching ? 'current' : 'pending') as 'completed' | 'current' | 'pending' | 'failed',
    details: isAfterResearch ? `${completedTasks.length} tasks completed` : undefined,
    data: { completedTasks },
  });

  const isAfterAggregating = progressStatus && !['gate_check', 'planning', 'task_start', 'task_progress', 'task_complete', 'aggregating', ...docPrepStatuses].includes(progressStatus);
  timelineSteps.push({
    label: 'Synthesizing',
    status: (isAfterAggregating ? 'completed' : progressStatus === 'aggregating' ? 'current' : 'pending') as 'completed' | 'current' | 'pending' | 'failed',
    details: isAfterAggregating ? 'Findings combined' : undefined,
  });

  const hasEvaluation = details?.evaluationResult;
  const isAfterEvaluation = hasEvaluation && progressStatus !== 'evaluating' && progressStatus !== 'retrying' && !isDocPrep;
  const evaluationScore = details?.evaluationResult?.score;
  const evaluationMeetsStandards = details?.evaluationResult?.meetsStandards;
  timelineSteps.push({
    label: hasEvaluation && evaluationScore !== undefined
      ? `Quality Check`
      : progressStatus === 'retrying'
        ? 'Quality Check (retrying)'
        : 'Quality Check',
    status: (isAfterEvaluation ? 'completed' : (progressStatus === 'evaluating' || progressStatus === 'retrying') ? 'current' : 'pending') as 'completed' | 'current' | 'pending' | 'failed',
    details: hasEvaluation && isAfterEvaluation
      ? evaluationMeetsStandards
        ? 'Quality standards met'
        : 'Proceeding with current quality'
      : undefined,
    data: { evaluationResult: details?.evaluationResult },
  });

  timelineSteps.push({
    label: 'Formatting Report',
    status: (progressStatus === 'completed' ? 'completed' : progressStatus === 'formatting' ? 'current' : 'pending') as 'completed' | 'current' | 'pending' | 'failed',
    details: progressStatus === 'completed' ? 'Report ready' : undefined,
  });

  let currentTaskDetails: { question?: string; tools?: string[] } | undefined = undefined;
  if (isResearching && details?.researchPlan && details.researchPlan.length > 0 && totalTasks > 0) {
    const safeCurrentIndex = Math.max(0, Math.min(currentTaskIndex, totalTasks - 1));
    const currentTask = details.researchPlan[safeCurrentIndex];
    if (currentTask) {
      currentTaskDetails = {
        question: currentTask.question,
        tools: currentTask.tools || []
      };
    }
  }

  return (
    <DeepResearchTimeline 
      steps={timelineSteps} 
      currentTaskIndex={currentTaskIndex}
      totalTasks={totalTasks}
      currentTaskDetails={currentTaskDetails}
    />
  );
}
