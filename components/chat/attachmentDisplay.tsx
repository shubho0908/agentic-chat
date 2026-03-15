import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Maximize2, FileText, FileSpreadsheet, File as FileIcon } from "lucide-react";
import type { Attachment } from "@/lib/schemas/chat";
import { ImageLightbox } from "./imageLightbox";
import { DocumentPreview } from "./documentPreview";
import { filterImageAttachments, filterDocumentAttachments } from "@/lib/attachment-utils";

interface AttachmentDisplayProps {
  attachments?: Attachment[];
  messageId?: string;
  isUser?: boolean;
}

function getDocumentIcon(fileType: string, fileName: string) {
  if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
    return <FileText className="size-5" />;
  }
  if (fileType.includes("spreadsheet") || fileName.match(/\.(xlsx?|csv)$/)) {
    return <FileSpreadsheet className="size-5" />;
  }
  if (fileType.includes("wordprocessingml") || fileName.endsWith(".docx")) {
    return <FileText className="size-5" />;
  }
  return <FileIcon className="size-5" />;
}

export function AttachmentDisplay({ attachments, messageId, isUser }: AttachmentDisplayProps) {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<{ url: string; name: string; type: string } | null>(null);

  const imageAttachments = filterImageAttachments(attachments);
  const documentAttachments = filterDocumentAttachments(attachments);

  if (!imageAttachments.length && !documentAttachments.length) return null;

  return (
    <>
      {imageAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {imageAttachments.map((attachment, idx) => (
            <div
              key={attachment.id || `${messageId}-img-${idx}`}
              className={cn(
                "group relative w-48 h-48 sm:w-56 sm:h-56 overflow-hidden border border-black/5 dark:border-white/10 transition-all duration-300 cursor-pointer shadow-sm rounded-2xl"
              )}
              onClick={() => setLightboxImage(attachment.fileUrl)}
            >
              <Image
                src={attachment.fileUrl}
                alt={attachment.fileName}
                fill
                sizes="(max-width: 768px) 192px, 224px"
                className="object-cover"
                unoptimized
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute bottom-0 left-0 right-0 p-3 text-white text-xs font-medium truncate opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                {attachment.fileName}
              </div>
              <div className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100">
                <Maximize2 className="size-4 text-white" />
              </div>
            </div>
          ))}
        </div>
      )}

      {documentAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {documentAttachments.map((attachment, idx) => (
            <div
              key={attachment.id || `${messageId}-doc-${idx}`}
              className={cn(
                "group relative flex items-center gap-3 px-3.5 py-3 transition-all duration-300 cursor-pointer max-w-[260px] shadow-sm rounded-2xl",
                isUser 
                  ? "bg-black/5 dark:bg-[#1E1E1E] text-foreground dark:text-white border border-black/5 dark:border-white/5 hover:bg-black/10 dark:hover:bg-[#2C2C2E]" 
                  : "bg-white dark:bg-[#1C1C1E] border border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/[0.04]"
              )}
              onClick={() => setPreviewDocument({ url: attachment.fileUrl, name: attachment.fileName, type: attachment.fileType })}
            >
              <div className={cn(
                "flex-shrink-0 p-2.5 rounded-[12px] transition-colors",
                isUser 
                  ? "bg-white dark:bg-black text-foreground dark:text-white shadow-sm dark:shadow-none" 
                  : "bg-black/5 dark:bg-black text-foreground/80 group-hover:text-foreground"
              )}>
                {getDocumentIcon(attachment.fileType, attachment.fileName)}
              </div>
              <div className="flex-1 min-w-0 pr-1">
                <p className={cn(
                  "text-[14px] font-medium truncate",
                  isUser ? "text-foreground dark:text-white" : "text-foreground/90"
                )}>
                  {attachment.fileName}
                </p>
                <p className={cn(
                  "text-[12px] mt-0.5",
                  isUser ? "text-muted-foreground dark:text-white/60" : "text-muted-foreground"
                )}>
                  {typeof attachment.fileSize === "number" && Number.isFinite(attachment.fileSize)
                    ? `${(attachment.fileSize / 1024).toFixed(1)} KB`
                    : "—"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <ImageLightbox
        imageUrl={lightboxImage || ""}
        alt="Image preview"
        open={!!lightboxImage}
        onClose={() => setLightboxImage(null)}
      />

      <DocumentPreview
        fileUrl={previewDocument?.url || ""}
        fileName={previewDocument?.name || ""}
        fileType={previewDocument?.type || ""}
        open={!!previewDocument}
        onClose={() => setPreviewDocument(null)}
      />
    </>
  );
}
