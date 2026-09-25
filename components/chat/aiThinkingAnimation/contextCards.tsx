"use client";

import { useState } from "react";
import Image from "next/image";
import { Brain, ChevronLeft, ChevronRight, FileText, ImageIcon, X } from "lucide-react";
import { filterDocumentAttachments, filterImageAttachments } from "@/lib/attachmentUtils";
import type { Attachment } from "@/lib/schemas/chat";
import { RoutingDecision, type MemoryStatus } from "@/types/chat";
import { ImageLightbox } from "../imageLightbox";
import { DocumentPreview } from "../documentPreview";

interface ContextCardsProps {
  memoryStatus: MemoryStatus;
  attachments?: Attachment[];
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const surface = "border border-border/60 bg-gradient-to-b from-card to-muted/60 text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.08)]";
const focus = "focus-visible:outline-none focus-visible:border-foreground/60 focus-visible:bg-accent/60";

export function ContextCards({ memoryStatus, attachments }: ContextCardsProps) {
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState(0);
  const [openedImage, setOpenedImage] = useState<Attachment | null>(null);
  const [openedDocument, setOpenedDocument] = useState<Attachment | null>(null);
  const imageAttachments = filterImageAttachments(attachments);
  const documentAttachments = filterDocumentAttachments(attachments);
  const files = [...imageAttachments, ...documentAttachments];
  const imageCount = memoryStatus.hasImages ? memoryStatus.imageCount : 0;
  const documentCount = memoryStatus.hasDocuments ? memoryStatus.documentCount : 0;
  const total = imageCount + documentCount;
  const hasActualFiles = files.length === total && total > 0;
  const isMemory = memoryStatus.routingDecision === RoutingDecision.MemoryOnly && memoryStatus.hasMemories;
  const isFileContext = memoryStatus.routingDecision === RoutingDecision.VisionOnly || memoryStatus.routingDecision === RoutingDecision.DocumentsOnly || memoryStatus.routingDecision === RoutingDecision.Hybrid;

  if (isMemory) {
    return (
      <div className={`relative isolate flex min-h-11 w-full max-w-[490px] items-center gap-3 overflow-hidden rounded-2xl px-3.5 py-2.5 ${surface}`}>
        <span aria-hidden="true" className="context-card-sheen pointer-events-none absolute inset-0" />
        <Brain className="relative size-[18px] shrink-0 text-violet-500 dark:text-violet-300" aria-hidden="true" />
        <span className="relative min-w-0 text-[13px] leading-5"><strong className="font-semibold">{memoryStatus.memoryCount} {memoryStatus.memoryCount === 1 ? "memory" : "memories"}</strong><span className="px-1.5 text-muted-foreground">·</span><span className="text-muted-foreground">from past chats</span></span>
      </div>
    );
  }

  if (!isFileContext || total === 0) return null;

  const multiple = total > 1;
  const onlyImage = imageCount === 1 && documentCount === 0;
  const onlyDocument = documentCount === 1 && imageCount === 0;
  const selectedFile = hasActualFiles ? files[Math.min(selected, files.length - 1)] : undefined;
  const description = multiple
    ? `Using ${imageCount ? `${imageCount} ${imageCount === 1 ? "image" : "images"}` : ""}${imageCount && documentCount ? " and " : ""}${documentCount ? `${documentCount} ${documentCount === 1 ? "document" : "documents"}` : ""}`
    : onlyImage ? "Looking at an image..." : onlyDocument ? "Reading a document..." : "Using context";

  return (
    <div className="w-full min-w-0 max-w-[760px] space-y-3">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className={`relative isolate flex min-h-12 w-full items-center gap-3 overflow-hidden rounded-2xl px-3.5 py-2.5 text-left transition-colors hover:bg-accent ${focus} ${surface}`}
      >
        {!expanded && <span aria-hidden="true" className="context-card-sheen pointer-events-none absolute inset-0" />}
        <span className="relative flex size-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300">
          {onlyDocument ? <FileText className="size-4" /> : <ImageIcon className="size-4" />}
        </span>
        <span className="relative min-w-0 flex-1 text-[13px] leading-5">
          <span className="block truncate font-medium">{description}</span>
          {!multiple && <span className="block text-[11px] text-muted-foreground">1 {onlyImage ? "image" : "document"} attached</span>}
        </span>
        <ChevronRight className={`relative size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden="true" />
      </button>

      {multiple && expanded && (
        <section className={`rounded-[20px] p-3.5 sm:p-4 ${surface}`} aria-label="Context used">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-300"><FileText className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[13px] font-semibold">Context used</h3>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{hasActualFiles ? "Files from your message used to understand this request." : "Sources from this conversation used to understand this request."}</p>
            </div>
            {hasActualFiles && <div className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"><span className="tabular-nums">{selected + 1} / {files.length}</span><button type="button" className={`ml-1 rounded-full p-1 hover:bg-accent disabled:opacity-30 ${focus}`} disabled={selected === 0} onClick={() => setSelected((value) => value - 1)} aria-label="Previous file"><ChevronLeft className="size-4" /></button><button type="button" className={`rounded-full p-1 hover:bg-accent disabled:opacity-30 ${focus}`} disabled={selected === files.length - 1} onClick={() => setSelected((value) => value + 1)} aria-label="Next file"><ChevronRight className="size-4" /></button></div>}
            <button type="button" className={`shrink-0 rounded-full p-1 text-muted-foreground hover:bg-accent ${focus}`} onClick={() => setExpanded(false)} aria-label="Close context details"><X className="size-4" /></button>
          </div>
          <div className="mt-3 border-t border-border/60 pt-3 dark:border-chat-user-bubble-border">
            {hasActualFiles ? (
              <>
                {imageAttachments.length > 0 && <div><p className="mb-2 text-xs font-medium">Images ({imageAttachments.length})</p><div className="flex flex-wrap gap-2">{imageAttachments.map((file, index) => <button key={file.id ?? file.fileUrl} type="button" onClick={() => { setSelected(index); setOpenedImage(file); }} className={`w-[calc(50%-4px)] min-w-0 max-w-52 overflow-hidden rounded-xl border text-left transition-colors hover:border-foreground/40 sm:w-52 ${selectedFile === file ? "border-foreground/40" : "border-border/70 dark:border-chat-user-bubble-border"} ${focus}`}><span className="relative block aspect-[2.3] bg-muted"><Image src={file.fileUrl} alt="" fill unoptimized sizes="208px" className="object-cover" /></span><span className="block truncate px-2 pt-1 text-[11px] font-medium">{file.fileName}</span><span className="block px-2 pb-1.5 text-[10px] text-muted-foreground">{formatSize(file.fileSize)}</span></button>)}</div></div>}
                {documentAttachments.length > 0 && <div className={imageAttachments.length ? "mt-3 border-t border-border/60 pt-3 dark:border-chat-user-bubble-border" : ""}><p className="mb-2 text-xs font-medium">Documents ({documentAttachments.length})</p><div className="grid gap-2 sm:grid-cols-3">{documentAttachments.map((file, index) => <button key={file.id ?? file.fileUrl} type="button" onClick={() => { setSelected(imageAttachments.length + index); setOpenedDocument(file); }} className={`flex min-w-0 items-center gap-2 rounded-xl border bg-muted/35 p-2.5 text-left hover:border-foreground/40 ${selectedFile === file ? "border-foreground/40" : "border-border/70 dark:border-chat-user-bubble-border"} ${focus}`}><FileText className="size-5 shrink-0 text-violet-500" /><span className="min-w-0"><span className="block truncate text-[11px] font-medium">{file.fileName}</span><span className="text-[10px] text-muted-foreground">{formatSize(file.fileSize)}</span></span></button>)}</div></div>}
              </>
            ) : <p className="text-xs leading-5 text-muted-foreground">{imageCount > 0 && `${imageCount} ${imageCount === 1 ? "image" : "images"}`}{imageCount > 0 && documentCount > 0 && " · "}{documentCount > 0 && `${documentCount} ${documentCount === 1 ? "document" : "documents"}`}. File previews are not available for this context.</p>}
          </div>
        </section>
      )}

      {!multiple && expanded && hasActualFiles && selectedFile && (
        <button type="button" onClick={() => onlyImage ? setOpenedImage(selectedFile) : setOpenedDocument(selectedFile)} className={`block w-full max-w-[280px] overflow-hidden rounded-2xl text-left transition-colors hover:border-foreground/40 ${focus} ${surface}`}>
          {onlyImage && <span className="relative block aspect-[2.5] bg-muted"><Image src={selectedFile.fileUrl} alt="" fill unoptimized sizes="280px" className="object-cover" /></span>}
          <span className="flex items-center gap-2 px-3 py-2.5">{onlyImage ? <ImageIcon className="size-4 shrink-0 text-muted-foreground" /> : <FileText className="size-5 shrink-0 text-violet-500" />}<span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{selectedFile.fileName}</span><span className="block text-[11px] text-muted-foreground">{onlyImage ? selectedFile.fileType.replace("image/", "").toUpperCase() : "Document"} · {formatSize(selectedFile.fileSize)}</span></span><ChevronRight className="size-4 shrink-0 text-muted-foreground" /></span>
          {onlyDocument && <span className="flex items-center gap-2 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground dark:border-chat-user-bubble-border"><FileText className="size-3.5" />Document used as context</span>}
        </button>
      )}
      {!multiple && expanded && !hasActualFiles && <p className="text-xs text-muted-foreground">File preview is not available for this context.</p>}
      <ImageLightbox imageUrl={openedImage?.fileUrl ?? ""} alt={openedImage?.fileName ?? ""} open={!!openedImage} onClose={() => setOpenedImage(null)} />
      <DocumentPreview fileUrl={openedDocument?.fileUrl ?? ""} fileName={openedDocument?.fileName ?? ""} fileType={openedDocument?.fileType ?? ""} open={!!openedDocument} onClose={() => setOpenedDocument(null)} />
    </div>
  );
}
