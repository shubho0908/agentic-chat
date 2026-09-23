"use client";

export type TableCellKind = "check" | "cross" | "dash" | "text";

const CHECK_TOKENS = new Set([
  "yes",
  "true",
  "supported",
  "included",
  "available",
  "check",
  "✓",
  "✔",
  "✅",
]);

const CROSS_TOKENS = new Set([
  "no",
  "false",
  "unsupported",
  "not included",
  "not available",
  "✗",
  "✘",
  "❌",
  "×",
]);

const DASH_TOKENS = new Set(["—", "–", "-", "n/a", "na", "none"]);

/**
 * Conservative exact-match classifier for comparison-matrix cells.
 * Only maps unambiguous boolean-ish tokens; everything else stays "text"
 * so real data ("x", "+1", "Partial", "See line 12") is never mis-rendered.
 */
export function classifyTableCell(value: string): TableCellKind {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "text";
  if (CHECK_TOKENS.has(normalized)) return "check";
  if (CROSS_TOKENS.has(normalized)) return "cross";
  if (DASH_TOKENS.has(normalized)) return "dash";
  return "text";
}
