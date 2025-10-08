"use client";

import { ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { OPENAI_MODELS } from "@/constants/openai-models";
import { ModelIcon } from "../utils/byokUtils";

interface ModelSelectorProps {
  selectedModel: string;
  onModelSelect: (modelId: string) => void;
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) {
    const millions = tokens / 1000000;
    return `${millions % 1 === 0 ? millions : millions.toFixed(1)}M`;
  } else if (tokens >= 1000) {
    const thousands = tokens / 1000;
    return `${thousands % 1 === 0 ? thousands : thousands.toFixed(1)}K`;
  }
  return tokens.toString();
}

export function ModelSelector({ selectedModel, onModelSelect }: ModelSelectorProps) {
  const selectedModelData = OPENAI_MODELS.find(
    (model) => model.id === selectedModel
  );

  return (
    <div className="grid gap-2">
      <Label>Model</Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between h-auto min-h-[52px] px-3 sm:px-4 py-2.5 hover:bg-accent"
          >
            {selectedModelData ? (
              <div className="flex flex-col items-start gap-1 flex-1 min-w-0 overflow-hidden">
                <div className="flex items-center gap-2">
                  <ModelIcon />
                  <span className="font-semibold text-xs sm:text-sm truncate">{selectedModelData.name}</span>
                  {selectedModelData.recommended && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white shrink-0">
                      RECOMMENDED
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground line-clamp-1 text-left">
                  {selectedModelData.description}
                </span>
              </div>
            ) : (
              <span className="text-muted-foreground text-xs sm:text-sm">Select model...</span>
            )}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[calc(100vw-2rem)] sm:w-[460px] max-w-[460px] max-h-[400px] overflow-y-auto" align="start">
          {OPENAI_MODELS.map((model) => (
            <DropdownMenuItem
              key={model.id}
              onClick={() => onModelSelect(model.id)}
              className={cn(
                "flex items-start gap-3 px-3 py-3 cursor-pointer relative overflow-hidden",
                selectedModel === model.id && "bg-accent",
                model.recommended && "bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 border border-purple-500/20"
              )}
            >
              <Check
                className={cn(
                  "h-4 w-4 shrink-0 mt-0.5",
                  selectedModel === model.id ? "opacity-100" : "opacity-0"
                )}
              />
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <ModelIcon />
                  <span className="font-semibold text-sm">{model.name}</span>
                  {model.recommended && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white shrink-0">
                      RECOMMENDED
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground leading-relaxed">
                  {model.description} • {formatTokenCount(model.contextWindow)} tokens
                </span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
