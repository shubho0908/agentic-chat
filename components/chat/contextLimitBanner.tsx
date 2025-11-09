import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TokenUsage } from '@/types/chat';

interface ContextLimitBannerProps {
  tokenUsage: TokenUsage;
  onNewChat: () => void;
}

export function ContextLimitBanner({ tokenUsage, onNewChat }: ContextLimitBannerProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-6 pt-4">
      <div className="rounded-lg border border-border bg-muted/50 p-5">
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-foreground">
                Context capacity reached
              </h3>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs p-3">
                    <div className="space-y-2">
                      <p className="font-medium text-sm">Token usage</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between gap-6">
                          <span className="text-muted-foreground">Used:</span>
                          <span className="font-mono">{formatNumber(tokenUsage.used)}</span>
                        </div>
                        <div className="flex justify-between gap-6">
                          <span className="text-muted-foreground">Available:</span>
                          <span className="font-mono">{formatNumber(tokenUsage.remaining)}</span>
                        </div>
                        <div className="flex justify-between gap-6 border-t pt-1">
                          <span className="text-muted-foreground">Capacity:</span>
                          <span className="font-mono">{formatNumber(tokenUsage.limit)}</span>
                        </div>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              This conversation has reached its maximum length. Start a new chat to continue.
            </p>
          </div>

          <Button
            onClick={onNewChat}
            size="sm"
            variant="default"
          >
            Start new conversation
          </Button>
        </div>
      </div>
    </div>
  );
}