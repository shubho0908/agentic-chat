import { memo, useState } from "react";
import Image from "next/image";
import { Maximize2, FileText, FileSpreadsheet, File as FileIcon } from "lucide-react";
import type { Message } from "@/lib/schemas/chat";
import { cn } from "@/lib/utils";
import { AIThinkingAnimation } from "./aiThinkingAnimation";
import { OpenAIIcon } from "@/components/icons/openai-icon";
import { OPENAI_MODELS } from "@/constants/openai-models";
import { Response } from "../ai-elements/response";
import { ImageLightbox } from "./imageLightbox";
import { DocumentPreview } from "./documentPreview";
import { extractTextFromContent } from "@/lib/content-utils";
import { filterImageAttachments, filterDocumentAttachments } from "@/lib/attachment-utils";

interface ChatMessageProps {
  message: Message;
  userName?: string | null;
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return "";
  
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ChatMessageComponent({ message, userName }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<{ url: string; name: string; type: string } | null>(null);
  
  if (message.role === "system") return null;

  const modelName = message.model
    ? OPENAI_MODELS.find((m) => m.id === message.model)?.name || message.model
    : "AI Assistant";

  const userInitial = userName?.charAt(0).toUpperCase() || "U";
  
  const textContent = extractTextFromContent(message.content);
  const imageAttachments = filterImageAttachments(message.attachments);
  const documentAttachments = filterDocumentAttachments(message.attachments);
  
  const getDocumentIcon = (fileType: string, fileName: string) => {
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
  };

  return (
    <div
      className={cn(
        "group relative px-4 py-8 transition-colors w-screen md:w-full",
        !isUser && "bg-muted/30"
      )}
    >
      <div className="mx-auto max-w-3xl">
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-full transition-all",
                isUser
                  ? "bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 text-sm font-semibold"
                  : "bg-secondary text-secondary-foreground"
              )}
            >
              {isUser ? (
                userInitial
              ) : (
                <OpenAIIcon className="size-4" />
              )}
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                {isUser ? (userName || "User") : modelName}
              </span>
              {message.timestamp && (
                <span className="text-xs text-muted-foreground">
                  {formatTimestamp(message.timestamp)}
                </span>
              )}
            </div>

            {imageAttachments.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-3">
                {imageAttachments.map((attachment, idx) => (
                  <div 
                    key={attachment.id || `${message.id}-img-${idx}`} 
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
                    key={attachment.id || `${message.id}-doc-${idx}`} 
                    className="group relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border/60 hover:border-primary/50 bg-muted/30 hover:bg-muted/50 transition-all duration-300 shadow-md hover:shadow-lg hover:-translate-y-0.5 cursor-pointer min-w-[200px] max-w-[280px]"
                    onClick={() => setPreviewDocument({ url: attachment.fileUrl, name: attachment.fileName, type: attachment.fileType })}
                  >
                    <div className="flex-shrink-0 p-2 rounded-lg bg-background/80 border border-border/50">
                      {getDocumentIcon(attachment.fileType, attachment.fileName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{attachment.fileName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(attachment.fileSize / 1024).toFixed(1)} KB
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

            <div className="prose prose-sm dark:prose-invert max-w-none">
              {textContent ? (
                <Response>{textContent}</Response>
              ) : message.content ? (
                <Response>{typeof message.content === 'string' ? message.content : ''}</Response>
              ) : (
                <AIThinkingAnimation model={message.model} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageComponent);
