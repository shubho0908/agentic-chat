"use client";

import { memo, type CSSProperties, type ReactNode } from "react";
import { Check, Minus, X } from "lucide-react";

import { classifyTableCell } from "./markdownTableUtils";
import { getTextFromChildren } from "./plainTextUtils";

interface MarkdownTableCellProps {
  children?: ReactNode;
  style?: CSSProperties;
}

const CELL_BASE_CLASS =
  "min-w-[6rem] max-w-[18rem] px-2.5 py-2 align-top break-words sm:min-w-[7rem] sm:max-w-[22rem] sm:px-3";

export const MarkdownTableCell = memo(function MarkdownTableCell({
  children,
  style,
}: MarkdownTableCellProps) {
  const rawText = getTextFromChildren(children);
  const kind = classifyTableCell(rawText);

  if (kind === "text") {
    return (
      <td className={CELL_BASE_CLASS} style={style}>
        {children}
      </td>
    );
  }

  const label = kind === "check" ? "Yes" : kind === "cross" ? "No" : "Not applicable";

  return (
    <td className={CELL_BASE_CLASS} style={style} title={rawText}>
      <span className="inline-flex items-center justify-center">
        {kind === "check" ? (
          <Check aria-hidden="true" className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : kind === "cross" ? (
          <X aria-hidden="true" className="size-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
        ) : (
          <Minus aria-hidden="true" className="size-4 shrink-0 text-zinc-300 dark:text-zinc-600" />
        )}
        <span className="sr-only">
          {label}: {rawText}
        </span>
      </span>
    </td>
  );
});
