import type { OpenAIModel } from "@/constants/openai-models";
import { OpenAIIcon } from "@/components/icons/openai-icon";
import { Badge } from "@/components/ui/badge";

export const OPENAI_API_KEY_REGEX = /^sk-(proj-|svcacct-)?[A-Za-z0-9_-]{20,}$/;

export const isValidApiKey = (key: string): boolean => {
  return OPENAI_API_KEY_REGEX.test(key.trim());
};

export function ModelIcon() {
  return (
    <span className="inline-flex items-center justify-center p-1.5 rounded-full bg-gray-900 dark:bg-gray-100">
      <OpenAIIcon className="h-3.5 w-3.5 text-white dark:text-gray-900" />
    </span>
  );
}

const CATEGORY_LABELS: Record<OpenAIModel["category"], string> = {
  reasoning: "Reasoning",
  chat: "Chat",
  legacy: "Legacy",
};

const getCategoryLabel = (category: OpenAIModel["category"]) => {
  return CATEGORY_LABELS[category];
};

export const getCategoryGroupLabel = (category: OpenAIModel["category"]) => {
  return `${getCategoryLabel(category)} Models`;
};

export function CategoryBadge({ category }: { category: OpenAIModel["category"] }) {
  if (category === "chat") {
    return null;
  }

  return (
    <Badge variant={category as "reasoning" | "legacy"} className="text-[10px] px-2 py-0.5 rounded-md">
      {getCategoryLabel(category)}
    </Badge>
  );
}
