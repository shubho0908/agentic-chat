"use client";

import { memo, type ReactNode } from "react";

interface MarkdownTableProps {
  children?: ReactNode;
}

export const MarkdownTable = memo(function MarkdownTable({
  children,
}: MarkdownTableProps) {
  return (
    <div
      role="region"
      aria-label="Data table"
      tabIndex={0}
      className="group/table my-3 block max-h-[70vh] w-full max-w-full overflow-auto overscroll-x-contain rounded-xl border border-zinc-200/80 bg-white/80 shadow-sm shadow-zinc-950/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 sm:my-4 dark:border-zinc-800/90 dark:bg-zinc-950/60 dark:shadow-none dark:focus-visible:outline-zinc-600"
    >
      <table className="w-max min-w-full border-collapse text-left text-[12px] leading-5 text-zinc-900 sm:text-[13px] dark:text-zinc-100">
        {children}
      </table>
    </div>
  );
});
