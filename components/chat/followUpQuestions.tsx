import { ArrowUpRight } from "lucide-react";
import { memo } from "react";

interface FollowUpQuestionsProps {
  questions: string[];
  onQuestionClick?: (question: string) => void;
  disabled?: boolean;
}

function FollowUpQuestionsComponent({
  questions,
  onQuestionClick,
  disabled = false
}: FollowUpQuestionsProps) {
  if (!questions || questions.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 space-y-2.5">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
        <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">
          Related
        </span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>
      
      <div className="grid gap-2">
        {questions.map((question, index) => (
          <button
            key={index}
            onClick={() => onQuestionClick?.(question)}
            disabled={disabled || !onQuestionClick}
            className="group relative w-full rounded-lg border border-border/40 bg-transparent hover:bg-muted/30 backdrop-blur-sm p-3.5 text-left transition-all hover:border-border disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <div className="flex size-5 items-center justify-center rounded-full bg-muted/50 text-[10px] font-medium text-muted-foreground/70 group-hover:bg-muted group-hover:text-foreground/70 transition-colors">
                  {index + 1}
                </div>
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-relaxed text-muted-foreground group-hover:text-foreground transition-colors">
                  {question}
                </p>
              </div>
              
              {onQuestionClick && !disabled && (
                <div className="flex-shrink-0">
                  <ArrowUpRight className="size-3.5 text-muted-foreground/40 group-hover:text-foreground/60 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export const FollowUpQuestions = memo(FollowUpQuestionsComponent);
