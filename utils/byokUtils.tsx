import { OpenAIIcon } from "@/components/icons/openaiIcon";

const OPENAI_API_KEY_REGEX = /^sk-(proj-|svcacct-)?[A-Za-z0-9_-]{20,}$/;

export const isValidApiKey = (key: string): boolean => {
  return OPENAI_API_KEY_REGEX.test(key.trim());
};

export function ModelIcon() {
  return (
    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-gray-900 dark:bg-gray-100">
      <OpenAIIcon className="size-3.5 text-white dark:text-gray-900" />
    </span>
  );
}
