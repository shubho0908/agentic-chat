import { Brain, Sparkles, Zap } from "lucide-react";
import type { OpenAIModel } from "@/constants/openai-models";

export const OPENAI_API_KEY_REGEX = /^sk-(proj-|svcacct-)?[A-Za-z0-9_-]{20,}$/;

export const isValidApiKey = (key: string): boolean => {
  return OPENAI_API_KEY_REGEX.test(key.trim());
};

export const getCategoryIcon = (category: OpenAIModel["category"]) => {
  switch (category) {
    case "reasoning":
      return <Brain className="h-4 w-4 text-purple-500" />;
    case "chat":
      return <Sparkles className="h-4 w-4 text-blue-500" />;
    case "legacy":
      return <Zap className="h-4 w-4 text-amber-500" />;
  }
};

export const getCategoryLabel = (category: OpenAIModel["category"]) => {
  switch (category) {
    case "reasoning":
      return "Reasoning Models";
    case "chat":
      return "Chat Models";
    case "legacy":
      return "Legacy Models";
  }
};
