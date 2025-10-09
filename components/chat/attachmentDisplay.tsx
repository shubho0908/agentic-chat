import { useState } from "react";
import Image from "next/image";
import { Maximize2, FileText, FileSpreadsheet, File as FileIcon } from "lucide-react";
import type { Attachment } from "@/lib/schemas/chat";
import { ImageLightbox } from "./imageLightbox";
import { DocumentPreview } from "./documentPreview";
import { filterImageAttachments, filterDocumentAttachments } from "@/lib/attachment-utils";

interface AttachmentDisplayProps {
  attachments?: Attachment[];
  messageId?: string;
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

export function AttachmentDisplay({ attachments, messageId }: AttachmentDisplayProps) {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<{ url: string; name: string; type: string } | null>(null);

  const imageAttachments = filterImageAttachments(attachments);
  const documentAttachments = filterDocumentAttachments(attachments);

  if (!imageAttachments.length && !documentAttachments.length) return null;

  return (
    <>
      {imageAttachments.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-3">
          {imageAttachments.map((attachment, idx) => (
            <div
              key={attachment.id || `${messageId}-img-${idx}`}
              className="group relative w-56 h-56 rounded-xl overflow-hidden border-2 border-border/60 hover:border-primary/50 transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1 cursor-pointer"
              onClick={() => setLightboxImage(attachment.fileUrl)}
            >
              <Image
                src={attachment.fileUrl}
                alt={attachment.fileName}
                fill
                sizes="(max-width: 768px) 224px, 224px"
                className="object-cover"
                unoptimized
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
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
        <div className="flex flex-wrap gap-3 mt-3">
          {documentAttachments.map((attachment, idx) => (
            <div
              key={attachment.id || `${messageId}-doc-${idx}`}
              className="group relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border/60 hover:border-primary/50 bg-muted/30 hover:bg-muted/50 transition-all duration-300 shadow-md hover:shadow-lg hover:-translate-y-0.5 cursor-pointer min-w-[200px] max-w-[280px]"
              onClick={() => setPreviewDocument({ url: attachment.fileUrl, name: attachment.fileName, type: attachment.fileType })}
            >
              <div className="flex-shrink-0 p-2 rounded-lg bg-background/80 border border-border/50">
                {getDocumentIcon(attachment.fileType, attachment.fileName)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{attachment.fileName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
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
