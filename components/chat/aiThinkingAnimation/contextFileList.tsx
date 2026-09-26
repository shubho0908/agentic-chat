import Image from "next/image";
import { FileText } from "lucide-react";
import type { Attachment } from "@/lib/schemas/chat";

const focus = "focus-visible:outline-none focus-visible:border-foreground/60 focus-visible:bg-accent/60";

interface ContextFileListProps {
  safeImages: Attachment[];
  safeDocuments: Attachment[];
  hasActualFiles: boolean;
  unavailable: boolean;
  isSnippet: boolean;
  imageCount: number;
  documentCount: number;
  documentNoun: string;
  documentPlural: string;
  missingDocumentCount: number;
  documentEvidenceLabel: (file: Attachment) => string;
  formatSize: (bytes: number) => string;
  onOpenImage: (file: Attachment) => void;
  onOpenDocument: (file: Attachment) => void;
}

export function ContextFileList({ safeImages, safeDocuments, hasActualFiles, unavailable,
  isSnippet, imageCount, documentCount, documentNoun, documentPlural,
  missingDocumentCount, documentEvidenceLabel, formatSize, onOpenImage,
  onOpenDocument }: ContextFileListProps) {
  return (
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
                              onClick={() => onOpenImage(file)}
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
                              onClick={() => onOpenDocument(file)}
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
  );
}
