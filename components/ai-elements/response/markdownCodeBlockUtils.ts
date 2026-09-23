"use client";

import {
  CODE_BLOCK_COLLAPSE_CHARS,
  CODE_BLOCK_COLLAPSE_LINES,
  CODE_BLOCK_MAX_LINE_NUMBERS,
} from "./constants";

const DIFF_LANGUAGE_PATTERN = /(?:^|\s)(?:language-)?diff(?:-|$|\s)/i;

export function normalizeCodeText(code: string): string {
  const lf = code.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return lf.endsWith("\n") ? lf.slice(0, -1) : lf;
}

export function countCodeLines(normalizedCode: string): number {
  if (normalizedCode === "") return 0;
  return normalizedCode.split("\n").length;
}

export function shouldCollapseCode(lines: number, chars: number): boolean {
  return lines > CODE_BLOCK_COLLAPSE_LINES || chars > CODE_BLOCK_COLLAPSE_CHARS;
}

export function shouldShowCodeLineNumbers(lines: number): boolean {
  return lines > 0 && lines <= CODE_BLOCK_MAX_LINE_NUMBERS;
}

export function isDiffLanguage(className: string | undefined): boolean {
  return typeof className === "string" && DIFF_LANGUAGE_PATTERN.test(className);
}

export type DiffLineKind = "addition" | "deletion" | null;

/**
 * Language-gated diff tinting. Only applies when the fence declares a diff
 * language, so legitimate `+1` / `-x` code is never mis-tinted.
 */
export function getDiffLineKind(
  line: string,
  className: string | undefined,
): DiffLineKind {
  if (!isDiffLanguage(className)) return null;
  if (line.startsWith("+++") || line.startsWith("---")) return null;
  if (line.startsWith("+")) return "addition";
  if (line.startsWith("-")) return "deletion";
  return null;
}
