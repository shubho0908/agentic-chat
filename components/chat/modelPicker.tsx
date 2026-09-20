"use client";

import { useMemo } from "react";
import { ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdownMenu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  OPENAI_MODELS,
  REASONING_EFFORT_META,
  getDefaultReasoningEffort,
  getModelCostMultiplier,
  getSupportedReasoningEfforts,
  formatCostMultiplier,
  type ReasoningEffortLevel,
} from "@/constants/openai-models";
import type { ReasoningEffortMap } from "@/lib/storage";
import { OpenAIIcon } from "@/components/icons/openaiIcon";

interface ModelPickerProps {
  selectedModel: string;
  effortByModel: ReasoningEffortMap;
  onModelSelect: (modelId: string) => void;
  onEffortChange: (modelId: string, effort: ReasoningEffortLevel) => void;
  disabled?: boolean;
}

function formatContext(tokens: number): string {
  const formatCompactValue = (value: number) => {
    const rounded = Number(value.toFixed(1));
    return rounded.toString();
  };

  if (tokens >= 1000000) return `${formatCompactValue(tokens / 1000000)}M`;
  if (tokens >= 1000) return `${formatCompactValue(tokens / 1000)}K`;
  return String(tokens);
}

function getCostTierStyles(multiplier: number): string {
  if (multiplier >= 30) {
    return "border-orange-500/30 bg-orange-500/[0.08] text-orange-700 dark:text-orange-400";
  }
  if (multiplier >= 10) {
    return "border-amber-500/25 bg-amber-500/[0.06] text-amber-700 dark:text-amber-400";
  }
  if (multiplier >= 3) {
    return "border-border/50 bg-muted/40 text-foreground/70";
  }
  return "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-700/80 dark:text-emerald-400/85";
}

function CostBadge({ multiplier }: { multiplier: number }) {
  const tierStyles = getCostTierStyles(multiplier);
  const display = formatCostMultiplier(multiplier);
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-[3px] rounded-md border px-1.5 py-[2px] text-[10px] font-semibold leading-none tabular-nums tracking-tight transition-colors",
        tierStyles
      )}
      title={`Estimated cost: ${display} the cheapest model (blended input/output, 1:4 ratio)`}
    >
      <span>{display}</span>
      <span className="text-[8px] font-medium uppercase tracking-[0.06em] opacity-70">
        usage
      </span>
    </span>
  );
}

export function ModelPicker({
  selectedModel,
  effortByModel,
  onModelSelect,
  onEffortChange,
  disabled = false,
}: ModelPickerProps) {
  const selectedModelData = useMemo(
    () => OPENAI_MODELS.find((model) => model.id === selectedModel),
    [selectedModel]
  );

  return (
    <DropdownMenu>
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                aria-label="Select model"
                className={cn(
                  "group flex h-9 items-center gap-1.5 rounded-full border border-black/5 bg-black/[0.04] px-3",
                  "dark:border-white/10 dark:bg-white/[0.06]",
                  "text-[13px] font-medium text-foreground/80 transition-colors",
                  "hover:bg-black/[0.07] hover:text-foreground dark:hover:bg-white/[0.1]",
                  "active:scale-[0.97] transition-transform",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                <OpenAIIcon className="size-3.5 shrink-0 opacity-80" />
                <span className="max-w-[88px] truncate sm:max-w-none">
                  {selectedModelData?.name ?? "Select model"}
                </span>
                <ChevronDown className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" align="center">
            <p>Model</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DropdownMenuContent
        className="w-[min(340px,calc(100vw-2rem))] rounded-2xl border-border/40 bg-background/95 p-1.5 shadow-xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-200"
        align="end"
        side="top"
        sideOffset={8}
        collisionPadding={12}
      >
        <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
          Model
        </p>
        <div className="max-h-[340px] overflow-y-auto px-0.5">
          {OPENAI_MODELS.map((model) => {
            const isSelected = selectedModel === model.id;
            const costMultiplier = getModelCostMultiplier(model);
            const storedEffort = effortByModel[model.id];
            const effort = getSupportedReasoningEfforts(model.id).includes(
              storedEffort as ReasoningEffortLevel
            )
              ? (storedEffort as ReasoningEffortLevel)
              : getDefaultReasoningEffort(model.id);
            const effortMeta = REASONING_EFFORT_META[effort];

            return (
              <div
                key={model.id}
                className={cn(
                  "mb-0.5 flex items-center gap-2 rounded-xl p-1.5 pl-2 last:mb-0",
                  "transition-colors",
                  isSelected ? "bg-muted/80 shadow-sm" : "hover:bg-muted/40"
                )}
              >
                <button
                  type="button"
                  onClick={() => onModelSelect(model.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors",
                      isSelected
                        ? "border-border/60 bg-background text-foreground shadow-sm"
                        : "border-border/20 bg-background/50 text-muted-foreground"
                    )}
                  >
                    <OpenAIIcon className="size-3.5" />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-px overflow-hidden">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "truncate text-[13px] font-medium tracking-tight",
                          isSelected ? "text-foreground" : "text-foreground/80"
                        )}
                      >
                        {model.name}
                      </span>
                      {model.recommended && (
                        <div
                          className="size-1.5 shrink-0 rounded-full bg-blue-500 opacity-90"
                          title="Recommended"
                        />
                      )}
                      {isSelected && (
                        <Check
                          className="size-3.5 shrink-0 text-foreground"
                          strokeWidth={2.5}
                        />
                      )}
                    </div>
                    <span className="block max-w-full truncate text-[11px] leading-snug text-muted-foreground/70">
                      {model.description}
                    </span>
                    <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">
                      {formatContext(model.contextWindow)} context
                      {costMultiplier !== null && (
                        <CostBadge multiplier={costMultiplier} />
                      )}
                    </span>
                  </div>
                </button>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    aria-label={`Reasoning effort for ${model.name}: ${effortMeta.label}`}
                    className={cn(
                      "flex h-7 shrink-0 cursor-pointer items-center gap-0.5 rounded-lg px-2",
                      "text-[12px] font-medium text-muted-foreground/80",
                      "transition-colors hover:bg-muted hover:text-foreground",
                      "data-[state=open]:bg-muted data-[state=open]:text-foreground",
                      "[&>svg]:!size-3 [&>svg]:opacity-50 [&>svg]:ml-0.5"
                    )}
                  >
                    <span>{effortMeta.label}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent
                      className="w-[min(240px,calc(100vw-2rem))] rounded-2xl border-border/40 bg-background/95 p-1.5 shadow-xl backdrop-blur-xl"
                      sideOffset={6}
                      collisionPadding={12}
                    >
                      <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                        Reasoning · {model.name}
                      </p>
                      {getSupportedReasoningEfforts(model.id).map((level) => {
                        const meta = REASONING_EFFORT_META[level];
                        const isEffortSelected = effort === level;

                        return (
                          <DropdownMenuItem
                            key={level}
                            onSelect={() => onEffortChange(model.id, level)}
                            className={cn(
                              "mb-0.5 flex items-center gap-3 rounded-xl p-2.5 last:mb-0",
                              "cursor-pointer transition-colors outline-none",
                              isEffortSelected
                                ? "bg-muted/80 text-foreground shadow-sm"
                                : "hover:bg-muted/40 focus:bg-muted/40"
                            )}
                          >
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span
                                className={cn(
                                  "text-[13px] font-medium tracking-tight",
                                  isEffortSelected
                                    ? "text-foreground"
                                    : "text-foreground/80"
                                )}
                              >
                                {meta.label}
                              </span>
                              <span className="text-[11px] leading-snug text-muted-foreground/70">
                                {meta.description}
                              </span>
                            </div>
                            {isEffortSelected && (
                              <Check
                                className="size-3.5 shrink-0 text-foreground"
                                strokeWidth={2.5}
                              />
                            )}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              </div>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
