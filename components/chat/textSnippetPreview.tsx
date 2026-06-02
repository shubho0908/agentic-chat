"use client";

import { X, FileCode, Loader } from "lucide-react";
import { LazyMotion, m, domAnimation } from "framer-motion";
import { Button } from "@/components/ui/button";

export interface TextSnippet {
  id: string;
  content: string;
  fileName: string;
  byteSize: number;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

interface TextSnippetPreviewProps {
  snippets: TextSnippet[];
  onRemove: (id: string) => void;
  disabled?: boolean;
  isUploading?: boolean;
}

export function TextSnippetPreview({ snippets, onRemove, disabled = false, isUploading = false }: TextSnippetPreviewProps) {
  if (snippets.length === 0) return null;

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="overflow-hidden"
      >
        <div className="border-b border-border/50 px-3 pt-3 pb-2 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {snippets.map((snippet) => (
            <m.div
              key={snippet.id}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="group relative w-48 flex-shrink-0 rounded-xl border border-border/60 bg-muted/70 overflow-hidden hover:border-border transition-all"
            >
              {isUploading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-[1px]">
                  <Loader className="size-4 animate-spin text-muted-foreground" />
                  <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">Uploading</span>
                </div>
              )}
              <div className="flex items-center gap-2 px-2.5 py-2">
                <div className="flex size-7 items-center justify-center rounded-md bg-background/80 ring-1 ring-border/50 flex-shrink-0">
                  <FileCode className="size-3.5" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[11px] font-medium truncate">{snippet.fileName}</span>
                  <span className="text-[10px] text-muted-foreground/70">
                    {formatSize(snippet.byteSize)}
                  </span>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => onRemove(snippet.id)}
                  disabled={disabled}
                  className="size-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background/80"
                >
                  <X className="size-3" />
                </Button>
              </div>
              <div className="px-2.5 pb-2">
                <pre className="text-[10px] leading-snug text-muted-foreground font-mono bg-background/50 rounded-md px-2 py-1.5 overflow-hidden h-[52px] whitespace-pre-wrap break-all">
                  {snippet.content.slice(0, 150)}{snippet.content.length > 150 ? "…" : ""}
                </pre>
              </div>
            </m.div>
          ))}
        </div>
      </m.div>
    </LazyMotion>
  );
}
