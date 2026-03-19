"use client";

import { useMemo } from "react";
import { ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdownMenu";
import { cn } from "@/lib/utils";
import { OPENAI_MODELS } from "@/constants/openai-models";
import { ModelIcon } from "../utils/byokUtils";

interface ModelSelectorProps {
  selectedModel: string;
  onModelSelect: (modelId: string) => void;
}

function formatContext(tokens: number): string {
  const formatCompactValue = (value: number) => {
    const rounded = Number(value.toFixed(1));
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  };

  if (tokens >= 1000000) return `${formatCompactValue(tokens / 1000000)}M`;
  if (tokens >= 1000) return `${formatCompactValue(tokens / 1000)}K`;
  return String(tokens);
}

export function ModelSelector({ selectedModel, onModelSelect }: ModelSelectorProps) {
  const selectedModelData = useMemo(
    () => OPENAI_MODELS.find((model) => model.id === selectedModel),
    [selectedModel]
  );

  return (
    <div className="grid gap-2">
      <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
        Model Selection
      </Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "w-full h-auto min-h-[52px] px-3 py-2.5 justify-between group",
              "bg-muted/30 hover:bg-muted/60 transition-colors duration-200",
              "border border-border/40 rounded-xl"
            )}
          >
            {selectedModelData ? (
              <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
                <div className="flex items-center justify-center size-8 rounded-[8px] bg-background border border-border/40 text-foreground shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <ModelIcon />
                </div>
                <div className="flex flex-col items-start min-w-0 gap-0.5">
                  <div className="flex items-center gap-1.5 focus:outline-none">
                    <span className="font-medium text-[13px] text-foreground tracking-tight truncate">{selectedModelData.name}</span>
                    {selectedModelData.recommended && (
                      <div className="size-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" title="Recommended" />
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground/80 line-clamp-1 text-left font-medium">
                    {selectedModelData.description}
                  </span>
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground text-[13px]">Select a model...</span>
            )}
            <div className="flex items-center justify-center size-6 text-muted-foreground/50 group-hover:text-foreground shrink-0 transition-colors">
              <ChevronDown className="size-[14px]" />
            </div>
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent
          className="w-[var(--radix-dropdown-menu-trigger-width)] p-1.5 rounded-2xl bg-background/95 backdrop-blur-xl border border-border/40 shadow-xl"
          align="start"
          sideOffset={8}
        >
          <div className="max-h-[320px] overflow-y-auto px-0.5">
            {OPENAI_MODELS.map((model) => {
              const isSelected = selectedModel === model.id;
              
              return (
                <DropdownMenuItem
                  key={model.id}
                  onClick={() => onModelSelect(model.id)}
                  className={cn(
                    "flex items-start gap-3 p-2 rounded-xl cursor-pointer mb-0.5 last:mb-0",
                    "transition-colors outline-none",
                    isSelected 
                      ? "bg-muted/80 text-foreground shadow-sm" 
                      : "hover:bg-muted/40 focus:bg-muted/40"
                  )}
                >
                  <div className={cn(
                    "flex items-center justify-center size-8 rounded-[8px] shrink-0 border transition-colors",
                    isSelected 
                      ? "bg-background border-border/60 text-foreground shadow-sm" 
                      : "bg-background/50 border-border/20 text-muted-foreground"
                  )}>
                    <ModelIcon />
                  </div>
                  
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={cn(
                          "font-medium text-[13px] tracking-tight truncate",
                          isSelected ? "text-foreground" : "text-foreground/80"
                        )}>
                          {model.name}
                        </span>
                        {model.recommended && (
                          <div className="size-1.5 rounded-full bg-blue-500 opacity-90" title="Recommended" />
                        )}
                      </div>
                      {isSelected && (
                        <div className="flex items-center justify-center size-5 rounded-md bg-background shadow-sm border border-border/40">
                          <Check className="size-3 text-foreground" strokeWidth={2.5} />
                        </div>
                      )}
                    </div>
                    
                    <span className="block max-w-full truncate text-[11px] font-medium text-muted-foreground/70 leading-relaxed">
                      {model.description}
                    </span>
                    
                    <span className="text-[9px] uppercase font-bold text-muted-foreground/50 tracking-wider mt-1">
                      {formatContext(model.contextWindow)} context
                    </span>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
