import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Options } from "react-markdown";

// Markdown parsing budget; renderer input is never truncated at this limit.
export const MAX_MARKDOWN_RENDER_CHARS = 50_000;
export const COMPLETE_CODE_FENCE_PATTERN =
  /(?:^|\n)(?:`{3,}|~{3,})[^\n]*\n[\s\S]*?\n(?:`{3,}|~{3,})[ \t]*(?=\n|$)/;
export const REMARK_PLUGINS: NonNullable<Options["remarkPlugins"]> = [
  remarkGfm,
  [remarkMath, { singleDollarTextMath: false }],
];
export { TRAILING_PUNCTUATION_PATTERN, URL_PATTERN } from "@/lib/url-normalization";
export const MERMAID_LOADING_TEXT = "Rendering diagram preview...";
export const MERMAID_FALLBACK_ERROR = "This Mermaid diagram has invalid syntax.";
export const MAX_MERMAID_ERROR_LENGTH = 240;
export const CODE_BLOCK_SHELL_CLASS =
  "group/code my-4 sm:my-5 block w-full max-w-full overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-50/65 text-zinc-900 shadow-sm shadow-zinc-950/5 dark:border-zinc-800/90 dark:bg-zinc-950/80 dark:text-zinc-100";
export const TYPEOF_STRING = "string";
export const TYPEOF_OBJECT = "object";
export const DEFAULT_CODE_LANGUAGE = "code";
export const CODE_BLOCK_COLLAPSE_LINES = 30;
export const CODE_BLOCK_COLLAPSE_CHARS = 4000;
export const CODE_BLOCK_MAX_LINE_NUMBERS = 1000;
export const CODE_BLOCK_MAX_HEIGHT_PX = 480;
