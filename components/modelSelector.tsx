"use client";

import { useState, useMemo } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { OPENAI_MODELS, type OpenAIModel } from "@/constants/openai-models";
import { getCategoryIcon, getCategoryLabel } from "../utils/byokUtils";

interface ModelSelectorProps {
  selectedModel: string;
  onModelSelect: (modelId: string) => void;
}

export function ModelSelector({ selectedModel, onModelSelect }: ModelSelectorProps) {
  const [comboboxOpen, setComboboxOpen] = useState(false);

  const selectedModelData = OPENAI_MODELS.find(
    (model) => model.id === selectedModel
  );

  const groupedModels = useMemo(() => {
    const groups: Record<OpenAIModel["category"], OpenAIModel[]> = {
      reasoning: [],
      chat: [],
      legacy: [],
    };

    OPENAI_MODELS.forEach((model) => {
      groups[model.category].push(model);
    });

    return groups;
  }, []);

  return (
    <div className="grid gap-2">
      <Label>Model</Label>
      <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={comboboxOpen}
            className="w-full justify-between h-auto min-h-[52px] px-4 py-2.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-0"
          >
            {selectedModelData ? (
              <div className="flex flex-col items-start gap-1 flex-1 min-w-0 overflow-hidden">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{selectedModelData.name}</span>
                  {getCategoryIcon(selectedModelData.category)}
                </div>
                <span className="text-xs text-muted-foreground line-clamp-1">
                  {selectedModelData.description}
                </span>
              </div>
            ) : (
              <span className="text-muted-foreground">Select model...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[460px] p-0 focus-visible:outline-none" align="start">
          <Command className="rounded-lg">
            <CommandInput placeholder="Search models..." className="h-10 border-0 focus-visible:outline-none focus-visible:ring-0 focus:outline-none focus:ring-0 text-sm" />
            <CommandList>
              <CommandEmpty className="text-sm py-6">No model found.</CommandEmpty>
              {(["reasoning", "chat", "legacy"] as const).map((category) => (
                groupedModels[category].length > 0 && (
                  <CommandGroup key={category} heading={getCategoryLabel(category)} className="px-3 py-2">
                    {groupedModels[category].map((model) => (
                      <CommandItem
                        key={model.id}
                        value={model.id}
                        onSelect={(currentValue) => {
                          onModelSelect(currentValue);
                          setComboboxOpen(false);
                        }}
                        className={cn(
                          "flex items-start gap-3 px-3 py-3 cursor-pointer rounded-md aria-selected:bg-accent/50",
                          selectedModel === model.id && "bg-primary/10 border-l-2 border-primary"
                        )}
                      >
                        <Check
                          className={cn(
                            "h-4 w-4 shrink-0 mt-0.5 text-primary",
                            selectedModel === model.id
                              ? "opacity-100"
                              : "opacity-0"
                          )}
                        />
                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn(
                              "font-semibold text-sm",
                              selectedModel === model.id && "text-primary"
                            )}>{model.name}</span>
                            {getCategoryIcon(model.category)}
                          </div>
                          <span className="text-xs text-muted-foreground leading-relaxed">
                            {model.description} • {model.contextWindow.toLocaleString()} tokens
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
