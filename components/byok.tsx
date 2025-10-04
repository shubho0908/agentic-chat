"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Key, Settings2, Sparkles, Brain, Zap, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { OPENAI_MODELS, DEFAULT_MODEL, type OpenAIModel } from "@/constants/openai-models";
import {
  saveApiKey,
  getApiKey,
  saveModel,
  getModel,
  clearAllSettings,
} from "@/lib/storage";
import { toast } from "sonner";

const getCategoryIcon = (category: OpenAIModel["category"]) => {
  switch (category) {
    case "reasoning":
      return <Brain className="h-4 w-4 text-purple-500" />;
    case "chat":
      return <Sparkles className="h-4 w-4 text-blue-500" />;
    case "legacy":
      return <Zap className="h-4 w-4 text-amber-500" />;
  }
};

const getCategoryLabel = (category: OpenAIModel["category"]) => {
  switch (category) {
    case "reasoning":
      return "Reasoning Models";
    case "chat":
      return "Chat Models";
    case "legacy":
      return "Legacy Models";
  }
};

interface BYOKProps {
  autoOpen?: boolean;
  onConfigured?: (configured: boolean) => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

const OPENAI_API_KEY_REGEX = /^sk-(proj-|svcacct-)?[A-Za-z0-9_-]{20,}$/;

const isValidApiKey = (key: string): boolean => {
  return OPENAI_API_KEY_REGEX.test(key.trim());
};

export function BYOK({ autoOpen = false, onConfigured, triggerRef }: BYOKProps = {}) {
  const [open, setOpen] = React.useState(false);
  const [comboboxOpen, setComboboxOpen] = React.useState(false);
  const [apiKey, setApiKey] = React.useState("");
  const [selectedModel, setSelectedModel] = React.useState(DEFAULT_MODEL);
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [isConfigured, setIsConfigured] = React.useState(false);

  React.useEffect(() => {
    const storedApiKey = getApiKey();
    const storedModel = getModel();

    if (storedApiKey) {
      setApiKey(storedApiKey);
      setIsConfigured(true);
      onConfigured?.(true);
    } else {
      onConfigured?.(false);
      if (autoOpen) {
        const timer = setTimeout(() => {
          setOpen(true);
        }, 200);
        return () => clearTimeout(timer);
      }
    }

    if (storedModel) {
      setSelectedModel(storedModel);
    }
  }, [autoOpen, onConfigured]);

  const handleSave = () => {
    if (!apiKey.trim()) {
      toast.error("Please enter your OpenAI API key");
      return;
    }

    if (!isValidApiKey(apiKey)) {
      toast.error("Invalid API key format", {
        description: "Valid formats: sk-..., sk-proj-..., or sk-svcacct-..."
      });
      return;
    }

    const apiKeySaved = saveApiKey(apiKey);
    const modelSaved = saveModel(selectedModel);

    if (apiKeySaved && modelSaved) {
      setIsConfigured(true);
      onConfigured?.(true);
      toast.success("Settings saved successfully", {
        description: `Model: ${OPENAI_MODELS.find(m => m.id === selectedModel)?.name}`,
      });
      setOpen(false);
    } else {
      toast.error("Failed to save settings. localStorage might be disabled.");
    }
  };

  const handleClear = () => {
    clearAllSettings();
    setApiKey("");
    setSelectedModel(DEFAULT_MODEL);
    setIsConfigured(false);
    onConfigured?.(false);
    toast.success("Settings cleared");
  };

  const selectedModelData = OPENAI_MODELS.find(
    (model) => model.id === selectedModel
  );

  const groupedModels = React.useMemo(() => {
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          ref={triggerRef}
          variant={isConfigured ? "outline" : "default"}
          size="sm"
          className={cn(
            "gap-2 rounded-xl transition-all",
            isConfigured
              ? "bg-background/80 backdrop-blur-sm shadow-sm hover:shadow-md"
              : "shadow-md hover:shadow-lg"
          )}
        >
          {isConfigured ? (
            <>
              <Settings2 className="size-4" />
              <span className="hidden sm:inline">API Settings</span>
            </>
          ) : (
            <>
              <Key className="size-4" />
              <span className="hidden sm:inline">Setup API Key</span>
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] focus-visible:outline-none">
        <DialogHeader>
          <DialogTitle>OpenAI API Configuration</DialogTitle>
          <DialogDescription>
            Configure your OpenAI API key and select a model. Your credentials
            are stored securely in your browser.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="grid gap-2">
            <Label htmlFor="api-key">API Key</Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showApiKey ? "text" : "password"}
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className={cn(
                  "focus-visible:outline-none focus-visible:ring-0",
                  apiKey ? "pr-20" : "",
                  apiKey && !isValidApiKey(apiKey) ? "border-destructive" : ""
                )}
              />
              {apiKey && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 h-7 w-7"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  <span className="sr-only">{showApiKey ? "Hide" : "Show"} API key</span>
                </Button>
              )}
            </div>
            {apiKey && !isValidApiKey(apiKey) ? (
              <p className="text-xs text-destructive">
                Invalid format. Must be sk-..., sk-proj-..., or sk-svcacct-...
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Get your API key from{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  OpenAI Platform
                </a>
              </p>
            )}
          </div>

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
                                setSelectedModel(currentValue);
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
        </div>

        <DialogFooter className="gap-2">
          {isConfigured && (
            <Button className="rounded-xl" variant="outline" onClick={handleClear}>
              Clear Settings
            </Button>
          )}
          <Button
            className="rounded-xl"
            onClick={handleSave}
            disabled={!apiKey.trim() || !selectedModel || !isValidApiKey(apiKey)}
          >
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
