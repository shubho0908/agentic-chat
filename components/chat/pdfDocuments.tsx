"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, FileText, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MessageMetadata } from "@/lib/schemas/chat";
import { DocumentPreview } from "./documentPreview";

type PdfFile = NonNullable<MessageMetadata["pdfs"]>[number];

function formatFileSize(bytes?: number): string | null {
  if (typeof bytes !== "number" || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMeta(pdf: PdfFile): string {
  const parts = ["PDF"];
  if (typeof pdf.pageCount === "number" && pdf.pageCount > 0) {
    parts.push(`${pdf.pageCount} page${pdf.pageCount === 1 ? "" : "s"}`);
  }
  const size = formatFileSize(pdf.size);
  if (size) parts.push(size);
  return parts.join(" \u2022 ");
}

export function PdfDocuments({ pdfs }: { pdfs: PdfFile[] }) {
  const [preview, setPreview] = useState<PdfFile | null>(null);

  if (!pdfs.length) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {pdfs.map((pdf) => (
          <div
            key={pdf.url}
            className={cn(
              "group relative flex w-full max-w-[320px] items-center gap-3 rounded-2xl border border-black/5 px-3.5 py-3 shadow-sm transition-all duration-300",
              "bg-muted/40 hover:bg-muted/70 dark:border-white/10"
            )}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
              <FileText className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={pdf.title ?? pdf.name}>
                {pdf.title ?? pdf.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">{formatMeta(pdf)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setPreview(pdf)}
                aria-label={`Preview ${pdf.title ?? pdf.name}`}
              >
                <Maximize2 className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                asChild
              >
                <Link href={pdf.url} download={pdf.name} aria-label={`Download ${pdf.title ?? pdf.name}`}>
                  <Download className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
      {preview && (
        <DocumentPreview
          fileUrl={preview.url}
          fileName={preview.name}
          fileType="application/pdf"
          open={!!preview}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
