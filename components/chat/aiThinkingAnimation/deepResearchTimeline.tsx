import { CheckCircle2, Circle, Loader2, Search, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimelineStep {
  label: string;
  status: 'completed' | 'current' | 'pending' | 'failed';
  details?: string;
  data?: {
    researchPlan?: unknown[];
    completedTasks?: Array<{ question: string; tools?: string[] }>;
    evaluationResult?: { score: number; meetsStandards: boolean };
  };
}

interface DeepResearchTimelineProps {
  steps: TimelineStep[];
  currentTaskIndex?: number;
  totalTasks?: number;
  currentTaskDetails?: {
    question?: string;
    tools?: string[];
  };
}

export function DeepResearchTimeline({ steps, currentTaskDetails }: DeepResearchTimelineProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const showTaskProgress = step.status === 'current' && step.label.startsWith('Research');
        
        return (
          <div key={index} className="flex flex-col">
            <div className="flex items-start gap-2">
              {/* Timeline connector */}
              <div className="flex flex-col items-center">
                {/* Status icon */}
                <div className={cn(
                  "flex items-center justify-center w-4 h-4 rounded-full",
                  step.status === 'completed' && "bg-green-500/20",
                  step.status === 'current' && "bg-purple-500/20",
                  step.status === 'pending' && "bg-muted",
                  step.status === 'failed' && "bg-red-500/20"
                )}>
                  {step.status === 'completed' && (
                    <CheckCircle2 className="w-3 h-3 text-green-600 dark:text-green-400" />
                  )}
                  {step.status === 'current' && (
                    <Loader2 className="w-3 h-3 text-purple-600 dark:text-purple-400 animate-spin" />
                  )}
                  {step.status === 'pending' && (
                    <Circle className="w-3 h-3 text-muted-foreground" />
                  )}
                  {step.status === 'failed' && (
                    <XCircle className="w-3 h-3 text-red-600 dark:text-red-400" />
                  )}
                </div>
                
                {/* Vertical line */}
                {!isLast && (
                  <div className={cn(
                    "w-px h-5 mt-0.5",
                    step.status === 'completed' ? "bg-green-500/30" : "bg-border"
                  )} />
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 pb-2">
                <div className={cn(
                  "text-xs font-medium",
                  step.status === 'completed' && "text-green-700 dark:text-green-300",
                  step.status === 'current' && "text-purple-700 dark:text-purple-300",
                  step.status === 'pending' && "text-muted-foreground",
                  step.status === 'failed' && "text-red-700 dark:text-red-300"
                )}>
                  {step.label}
                </div>
                
                {/* Step details */}
                {step.details && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {step.details}
                  </div>
                )}
                
                {/* Show completed tasks for research step */}
                {step.status === 'completed' && step.data?.completedTasks && step.data.completedTasks.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {step.data.completedTasks.slice(0, 3).map((task, idx: number) => (
                      <div key={idx} className="text-[10px] text-muted-foreground flex items-start gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5 mt-0.5 text-green-500 flex-shrink-0" />
                        <span className="line-clamp-1">{task.question}</span>
                      </div>
                    ))}
                    {step.data.completedTasks.length > 3 && (
                      <div className="text-[10px] text-muted-foreground/60">
                        +{step.data.completedTasks.length - 3} more completed
                      </div>
                    )}
                  </div>
                )}
                
                {/* Show evaluation result */}
                {step.status === 'completed' && step.data?.evaluationResult && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <div className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded",
                      step.data.evaluationResult.score >= 75
                        ? "bg-green-500/10 text-green-600 dark:text-green-400"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    )}>
                      Score: {step.data.evaluationResult.score}%
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {showTaskProgress && currentTaskDetails && (
              <div className="ml-6 flex flex-col gap-0.5 mt-0.5 pb-2">
                {currentTaskDetails.question && (
                  <div className="flex items-start gap-1.5">
                    <Search className="w-3 h-3 mt-0.5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                    <span className="text-[11px] text-foreground/70">
                      {currentTaskDetails.question}
                    </span>
                  </div>
                )}
                {currentTaskDetails.tools && currentTaskDetails.tools.length > 0 && (
                  <div className="ml-4 flex items-center gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
                      via {currentTaskDetails.tools.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
