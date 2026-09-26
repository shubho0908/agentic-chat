"use client";

import { useState } from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { AccordionContent } from "@/components/ui/accordionContent";
import Image from "next/image";
import { Brain, ChevronRight, FileText, ImageIcon } from "lucide-react";
import {
  filterDocumentAttachments,
  filterImageAttachments,
} from "@/lib/attachmentUtils";
import type { Attachment } from "@/lib/schemas/chat";
import { RoutingDecision, type MemoryStatus } from "@/types/chat";
import { ImageLightbox } from "../imageLightbox";
import { DocumentPreview } from "../documentPreview";

interface ContextCardsProps {
  memoryStatus: MemoryStatus;
  attachments?: Attachment[];
  defaultExpanded?: boolean;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const surface =
  "border border-border/70 bg-[hsl(240_5%_97%)] text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.08)] dark:border-border/60 dark:bg-[#171719]";
const focus =
  "focus-visible:outline-none focus-visible:border-foreground/60 focus-visible:bg-accent/60";

export function ContextCards({
  memoryStatus,
  attachments,
  defaultExpanded = false,
}: ContextCardsProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [openedImage, setOpenedImage] = useState<Attachment | null>(null);
  const [openedDocument, setOpenedDocument] = useState<Attachment | null>(null);
  const imageCount = memoryStatus.hasImages ? memoryStatus.imageCount : 0;
  const isSnippet = memoryStatus.attachmentContextKind === "snippet";
  const documentCount = memoryStatus.hasDocuments
    ? memoryStatus.documentCount
    : 0;
  const total = imageCount + documentCount;
  const isMemory =
    memoryStatus.routingDecision === RoutingDecision.MemoryOnly &&
    memoryStatus.hasMemories;
  const isFileContext =
    memoryStatus.routingDecision === RoutingDecision.VisionOnly ||
    memoryStatus.routingDecision === RoutingDecision.DocumentsOnly ||
    memoryStatus.routingDecision === RoutingDecision.Hybrid;

  if (isMemory) {
    return (
      <div
        className={`relative isolate flex min-h-11 w-full max-w-[490px] items-center gap-3 overflow-hidden rounded-2xl px-3.5 py-2.5 ${surface}`}
      >
        <span
          aria-hidden="true"
          className="context-card-sheen pointer-events-none absolute inset-0"
        />
        <Brain
          className="relative size-[18px] shrink-0 text-violet-500 dark:text-violet-300"
          aria-hidden="true"
        />
        <span className="relative min-w-0 text-[13px] leading-5">
          <strong className="font-semibold">
            {memoryStatus.memoryCount}{" "}
            {memoryStatus.memoryCount === 1 ? "memory" : "memories"}
          </strong>
          <span className="px-1.5 text-muted-foreground">·</span>
          <span className="text-muted-foreground">from past chats</span>
        </span>
      </div>
    );
  }

  if (!isFileContext || total === 0) return null;

  const documentSources = memoryStatus.documentEvidenceFiles;
  const candidateDocuments = isSnippet
    ? (attachments ?? []).filter((attachment) => attachment.kind === "snippet")
    : filterDocumentAttachments(attachments);
  // Source metadata comes from the owner's persisted, scoped attachment catalog.
  // Legacy statuses without a full source identity never become clickable URLs.
  const sourcedAttachment = (source: {
    id: string; fileUrl: string; fileName?: string; fileType?: string;
    fileSize?: number; kind?: "image" | "document" | "snippet";
  }, kind: "image" | "document" | "snippet"): Attachment | null => {
    if (!source.id || !source.fileName || !source.fileType ||
        typeof source.fileSize !== "number" || source.fileSize < 0 ||
        source.kind !== kind) return null;
    try {
      const url = new URL(source.fileUrl);
      if (url.protocol !== "https:") return null;
    } catch { return null; }
    return {
      id: source.id, fileUrl: source.fileUrl, fileName: source.fileName,
      fileType: source.fileType, fileSize: source.fileSize, kind,
    };
  };
  const uniqueSource = <T extends { id: string; fileUrl: string }>(source: T, all: T[]) =>
    all.filter((item) => item.id === source.id).length === 1 &&
    all.filter((item) => item.fileUrl === source.fileUrl).length === 1;
  const safeDocuments = (documentSources ?? []).flatMap((source) => {
    if (!uniqueSource(source, documentSources ?? [])) return [];
    const currentMatches = candidateDocuments.filter((file) => file.fileUrl === source.fileUrl);
    if (currentMatches.length === 1) return [currentMatches[0]];
    const historical = sourcedAttachment(source, isSnippet ? "snippet" : "document");
    return historical ? [historical] : [];
  });
  const imageAttachments = filterImageAttachments(attachments);
  const historicalImageSources = memoryStatus.historicalImageFiles ?? [];
  const safeHistoricalImages = historicalImageSources.flatMap((source) =>
    uniqueSource(source, historicalImageSources)
      ? [sourcedAttachment(source, "image")].filter((file): file is Attachment => file !== null)
      : []);
  const currentImageCount = Math.max(0, imageCount - historicalImageSources.length);
  const safeCurrentImages = (historicalImageSources.length === 0 || memoryStatus.includeCurrentImages) &&
    imageAttachments.length === currentImageCount ? imageAttachments : [];
  const safeImages = [...safeHistoricalImages, ...safeCurrentImages];
  const previewFiles = [...safeImages, ...safeDocuments];
  const missingDocumentCount = documentCount - safeDocuments.length;
  const hasActualFiles = previewFiles.length > 0;

  const multiple = total > 1;
  const onlyImage = imageCount === 1 && documentCount === 0;
  const onlyDocument = documentCount === 1 && imageCount === 0;
  const selectedFile =
    hasActualFiles && previewFiles.length === 1 && total === 1
      ? previewFiles[0]
      : undefined;
  const unavailable = memoryStatus.documentContextState === "unavailable";
  const evidenceIds = memoryStatus.documentEvidenceIds;
  const evidenceFiles = memoryStatus.documentEvidenceFiles;
  const documentEvidenceLabel = (file: Attachment) => {
    if (unavailable) return "Context unavailable - retry";
    const matches =
      evidenceFiles?.filter((item) => item.fileUrl === file.fileUrl) ?? [];
    if (matches.length !== 1 || !evidenceIds)
      return `${isSnippet ? "Snippet" : "Document"} attached - passage use unverified`;
    return evidenceIds.includes(matches[0].id)
      ? "Relevant passages used"
      : "No passages used";
  };
  const documentNoun = isSnippet ? "snippet" : "document";
  const documentPlural = isSnippet ? "snippets" : "documents";
  const selectedTitle = selectedFile?.fileName;
  const description = multiple
    ? `${memoryStatus.documentContextState === "ready" || !documentCount ? "Using" : "Attached"} ${imageCount ? `${imageCount} ${imageCount === 1 ? "image" : "images"}` : ""}${imageCount && documentCount ? " and " : ""}${documentCount ? `${documentCount} ${documentCount === 1 ? documentNoun : documentPlural}` : ""}`
    : onlyImage
      ? "Looking at an image..."
      : onlyDocument
        ? memoryStatus.documentContextState === "unavailable"
          ? `${isSnippet ? "Snippet" : "Document"} attached`
          : `Reading a ${documentNoun}...`
        : "Using context";

  return (
    <AccordionPrimitive.Root
      type="single"
      collapsible
      value={expanded ? "context" : ""}
      onValueChange={(value) => setExpanded(value === "context")}
      className="w-full min-w-0 max-w-[760px]"
    >
      <AccordionPrimitive.Item
        value="context"
        className={`overflow-hidden rounded-2xl ${surface}`}
      >
        <AccordionPrimitive.Header className="flex">
          <AccordionPrimitive.Trigger
            type="button"
            className={`relative isolate flex min-h-12 w-full items-center gap-3 overflow-hidden px-3.5 py-2.5 text-left transition-colors hover:bg-accent ${focus}`}
          >
            {!expanded && (
              <span
                aria-hidden="true"
                className="context-card-sheen pointer-events-none absolute inset-0"
              />
            )}
            <span className="relative flex size-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300">
              {onlyDocument ? (
                <FileText className="size-4" />
              ) : (
                <ImageIcon className="size-4" />
              )}
            </span>
            <span className="relative min-w-0 flex-1 text-[13px] leading-5">
              <span className="block truncate font-medium">{selectedTitle ?? description}</span>
              {!multiple && (
                <span className="block text-[11px] text-muted-foreground">
                  {selectedTitle ? `${onlyImage ? "Image" : isSnippet ? "Snippet" : "Document"} from this conversation` : `1 ${onlyImage ? "image" : documentNoun} attached`}
                </span>
              )}
              {unavailable && (
                <span className="block text-[11px] text-amber-600 dark:text-amber-400">
                  {isSnippet ? "Snippet" : "Document"} context unavailable -{" "}
                  retry
                </span>
              )}
            </span>
            <ChevronRight
              className={`relative size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
          </AccordionPrimitive.Trigger>
        </AccordionPrimitive.Header>
        <AccordionContent className="space-y-3 pb-0">
          {multiple && (
            <section
              className="px-3.5 pb-3.5 pt-0 sm:px-4"
              aria-label="Context used"
            >
              <div
                className="mb-3.5 border-t border-border/35 dark:border-white/[0.06]"
                aria-hidden="true"
              />
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-300">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[13px] font-semibold">Context used</h3>
                  <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                    {hasActualFiles
                      ? "Available file previews for this request."
                      : "Sources from this conversation are available for this request."}
                  </p>
                </div>
              </div>
              {unavailable && (
                <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                  {isSnippet ? "Snippet" : "Document"} context unavailable -
                  retry after processing.
                </p>
              )}
              <div className="mt-3.5">
                {hasActualFiles ? (
                  <>
                    {safeImages.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-medium">
                          Images ({safeImages.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {safeImages.map((file) => (
                            <button
                              key={file.id ?? file.fileUrl}
                              type="button"
                              onClick={() => setOpenedImage(file)}
                              className={`w-[calc(50%-4px)] min-w-0 max-w-52 overflow-hidden rounded-xl border text-left transition-colors hover:border-foreground/40 sm:w-52 border-border/70 dark:border-chat-user-bubble-border ${focus}`}
                            >
                              <span className="relative block aspect-[2.3] bg-muted">
                                <Image
                                  src={file.fileUrl}
                                  alt=""
                                  fill
                                  unoptimized
                                  sizes="208px"
                                  className="object-cover"
                                />
                              </span>
                              <span className="block truncate px-2 pt-1 text-[11px] font-medium">
                                {file.fileName}
                              </span>
                              <span className="block px-2 pb-1.5 text-[10px] text-muted-foreground">
                                {formatSize(file.fileSize)}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {safeDocuments.length > 0 && (
                      <div className={safeImages.length ? "mt-4 pt-0" : ""}>
                        <p className="mb-2 text-xs font-medium">
                          {isSnippet ? "Snippets" : "Documents"} (
                          {safeDocuments.length})
                        </p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {safeDocuments.map((file) => (
                            <button
                              key={file.id ?? file.fileUrl}
                              type="button"
                              onClick={() => setOpenedDocument(file)}
                              className={`flex min-w-0 items-center gap-2 rounded-xl border bg-muted/35 p-2.5 text-left hover:border-foreground/40 border-border/70 dark:border-chat-user-bubble-border ${focus}`}
                            >
                              <FileText className="size-5 shrink-0 text-violet-500" />
                              <span className="min-w-0">
                                <span className="block truncate text-[11px] font-medium">
                                  {file.fileName}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {formatSize(file.fileSize)}
                                </span>
                                <span className="block text-[10px] text-muted-foreground">
                                  {documentEvidenceLabel(file)}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {missingDocumentCount > 0 && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        {missingDocumentCount}{" "}
                        {missingDocumentCount === 1
                          ? `${documentNoun} preview`
                          : `${documentNoun} previews`}{" "}
                        unavailable for this context.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs leading-5 text-muted-foreground">
                    {imageCount > 0 &&
                      `${imageCount} ${imageCount === 1 ? "image" : "images"}`}
                    {imageCount > 0 && documentCount > 0 && " · "}
                    {documentCount > 0 &&
                      `${documentCount} ${documentCount === 1 ? documentNoun : documentPlural}`}
                    . File previews are not available for this context.
                  </p>
                )}
              </div>
            </section>
          )}

          {!multiple && hasActualFiles && selectedFile && (
            <button
              type="button"
              onClick={() =>
                onlyImage
                  ? setOpenedImage(selectedFile)
                  : setOpenedDocument(selectedFile)
              }
              className={`mx-3.5 mb-3.5 block w-[calc(100%-28px)] max-w-[280px] overflow-hidden rounded-2xl border border-border/70 bg-muted/35 text-left transition-colors hover:border-foreground/40 dark:border-chat-user-bubble-border ${focus}`}
            >
              {onlyImage && (
                <span className="relative block aspect-[2.5] bg-muted">
                  <Image
                    src={selectedFile.fileUrl}
                    alt=""
                    fill
                    unoptimized
                    sizes="280px"
                    className="object-cover"
                  />
                </span>
              )}
              <span className="flex items-center gap-2 px-3 py-2.5">
                {onlyImage ? (
                  <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="size-5 shrink-0 text-violet-500" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {selectedFile.fileName}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {onlyImage
                      ? selectedFile.fileType
                          .replace("image/", "")
                          .toUpperCase()
                      : isSnippet
                        ? "Snippet"
                        : "Document"}{" "}
                    · {formatSize(selectedFile.fileSize)}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </span>
              {onlyDocument && (
                <span className="flex items-center gap-2 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground dark:border-chat-user-bubble-border">
                  <FileText className="size-3.5" />
                  {documentEvidenceLabel(selectedFile)}
                </span>
              )}
            </button>
          )}
          {!multiple && !hasActualFiles && (
            <p className="px-3.5 pb-3.5 pt-2 text-xs leading-5 text-muted-foreground">
              File preview is not available for this context.
            </p>
          )}
        </AccordionContent>
      </AccordionPrimitive.Item>
      <ImageLightbox
        imageUrl={openedImage?.fileUrl ?? ""}
        alt={openedImage?.fileName ?? ""}
        open={!!openedImage}
        onClose={() => setOpenedImage(null)}
      />
      <DocumentPreview
        fileUrl={openedDocument?.fileUrl ?? ""}
        fileName={openedDocument?.fileName ?? ""}
        fileType={openedDocument?.fileType ?? ""}
        open={!!openedDocument}
        onClose={() => setOpenedDocument(null)}
      />
    </AccordionPrimitive.Root>
  );
}
