import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Options } from "react-markdown";

export const MAX_MARKDOWN_RENDER_CHARS = 50_000;
export const COMPLETE_CODE_FENCE_PATTERN = /```[\s\S]*?```/;
export const REMARK_PLUGINS: NonNullable<Options["remarkPlugins"]> = [remarkGfm, remarkMath];
export const URL_PATTERN = /\b((?:https?:\/\/|www\.)[^\s<>{}[\]"]+)/gi;
export const TRAILING_PUNCTUATION_PATTERN = /[.,!?;:]+$/;
export const MERMAID_LOADING_TEXT = "Rendering diagram preview...";
export const MERMAID_THEME_DEFAULT = "default";
export const MERMAID_THEME_DARK = "dark";
export const MERMAID_FALLBACK_ERROR = "This Mermaid diagram has invalid syntax.";
export const MAX_MERMAID_ERROR_LENGTH = 240;
export const CODE_BLOCK_SHELL_CLASS =
  "group/code my-4 sm:my-5 inline-block w-fit max-w-full align-top overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-50/65 text-zinc-900 shadow-sm shadow-zinc-950/5 dark:border-zinc-800/90 dark:bg-zinc-950/80 dark:text-zinc-100";
export const TYPEOF_STRING = "string";
export const TYPEOF_OBJECT = "object";
export const DEFAULT_CODE_LANGUAGE = "code";
