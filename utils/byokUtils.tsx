import { OpenAIIcon } from "@/components/icons/openai-icon";

const OPENAI_API_KEY_REGEX = /^sk-(proj-|svcacct-)?[A-Za-z0-9_-]{20,}$/;

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
