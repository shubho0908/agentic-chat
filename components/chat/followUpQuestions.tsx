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
    <div className="mt-6 space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
        <span className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wide">
          Related Questions
        </span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>
      
      <div className="flex flex-col gap-2">
        {questions.map((question, index) => (
          <button
            key={index}
            onClick={() => onQuestionClick?.(question)}
            disabled={disabled || !onQuestionClick}
            type="button"
            className="group relative w-full rounded-lg border border-border/50 bg-background/50 hover:bg-muted/50 hover:border-border p-3 text-left transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-background/50 disabled:hover:border-border/50 cursor-pointer"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <div className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary group-hover:bg-primary/20 group-disabled:bg-muted group-disabled:text-muted-foreground transition-colors">
                  {index + 1}
                </div>
              </div>
              
              <div className="flex-1 min-w-0 pr-2">
                <p className="text-sm leading-relaxed text-foreground/80 group-hover:text-foreground transition-colors break-words">
                  {question}
                </p>
              </div>
              
              {onQuestionClick && !disabled && (
                <div className="flex-shrink-0 mt-0.5">
                  <ArrowUpRight className="size-4 text-muted-foreground/50 group-hover:text-primary transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
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
