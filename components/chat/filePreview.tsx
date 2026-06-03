"use client";

import {
  X,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Loader,
} from "lucide-react";
import { AnimatePresence, LazyMotion, m, domAnimation } from "framer-motion";
import Image from "next/image";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  isSupportedDocumentExtension,
  isSupportedImageExtension,
} from "@/lib/fileValidation";
import type { UploadPhase } from "@/hooks/useChatFileUpload";

const isDocumentFile = (file: File): boolean => {
  return isSupportedDocumentExtension(file.name);
};

const isImageFile = (file: File): boolean => {
  return isSupportedImageExtension(file.name);
};

const getFileIcon = (file: File) => {
  if (isDocumentFile(file)) {
    if (file.name.endsWith(".pdf")) {
      return <FileText className="size-4" />;
    }
    if (file.name.match(/\.(xlsx?|csv)$/)) {
      return <FileSpreadsheet className="size-4" />;
    }
    return <FileText className="size-4" />;
  }
  if (isImageFile(file) || file.type.startsWith("image/")) {
    return <ImageIcon className="size-4" />;
  }
  return <FileText className="size-4" />;
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

interface FilePreviewProps {
  files: File[];
  getFileKey: (file: File) => string;
  getPreviewUrl: (file: File) => string | null;
  onRemove: (file: File) => void;
  disabled?: boolean;
  isUploading?: boolean;
  uploadPhase?: UploadPhase;
}

interface FilePreviewItemProps {
  file: File;
  previewUrl: string | null;
  onRemove: (file: File) => void;
  disabled: boolean;
  isUploading: boolean;
  uploadPhase?: UploadPhase;
}

const FilePreviewItem = memo(function FilePreviewItem({
  file,
  previewUrl,
  onRemove,
  disabled,
  isUploading,
  uploadPhase,
}: FilePreviewItemProps) {
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);

  return (
    <m.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="group relative flex shrink-0 items-center gap-2.5 rounded-xl border border-border/60 bg-muted/70 px-3 py-2 transition-all hover:border-border hover:bg-muted/90"
    >
      {isUploading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-[1px]">
          <Loader className="size-4 animate-spin text-muted-foreground" />
          <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">
            {uploadPhase?.isProcessing ? "Processing" : "Uploading"}
          </span>
        </div>
      )}
      {previewUrl && failedPreviewUrl !== previewUrl ? (
        <div className="relative size-10 shrink-0 overflow-hidden rounded-md ring-1 ring-border/50">
          <Image
            src={previewUrl}
            alt={file.name}
            fill
            sizes="40px"
            className="object-cover"
            unoptimized
            onError={() => setFailedPreviewUrl(previewUrl)}
          />
        </div>
      ) : (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-background/80 ring-1 ring-border/50">
          {getFileIcon(file)}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="max-w-30 truncate text-xs font-medium">
                {file.name}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{file.name}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="text-[10px] text-muted-foreground/70">
          {formatFileSize(file.size)}
        </span>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => onRemove(file)}
        disabled={disabled}
        className="size-6 rounded-full opacity-0 transition-opacity hover:bg-background/80 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <X className="size-3" />
      </Button>
    </m.div>
  );
});

export function FilePreview({
  files,
  getFileKey,
  getPreviewUrl,
  onRemove,
  disabled = false,
  isUploading = false,
  uploadPhase,
}: FilePreviewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback((container: HTMLDivElement | null) => {
    if (!container) return;

    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 1,
    );
  }, []);

  const setScrollContainerRef = useCallback(
    (container: HTMLDivElement | null) => {
      scrollContainerRef.current = container;
      updateScrollState(container);
    },
    [updateScrollState],
  );

  useEffect(() => {
    const checkScroll = () => {
      updateScrollState(scrollContainerRef.current);
    };

    const container = scrollContainerRef.current;
    if (container) {
      const observer = new ResizeObserver(checkScroll);
      observer.observe(container);
      container.addEventListener("scroll", checkScroll, { passive: true });

      return () => {
        observer.disconnect();
        container.removeEventListener("scroll", checkScroll);
      };
    }
  }, [updateScrollState]);

  useEffect(() => {
    updateScrollState(scrollContainerRef.current);
  }, [files.length, updateScrollState]);

  const scroll = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = 200;
    const newScrollLeft =
      direction === "left"
        ? container.scrollLeft - scrollAmount
        : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: newScrollLeft,
      behavior: "smooth",
    });
  };

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence initial={false}>
        {files.length > 0 && (
          <m.div
            key="file-preview-wrapper"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="relative border-b border-border/50 px-3 pb-2 pt-3">
              {canScrollLeft && (
                <Button
                  type="button"
                  onClick={() => scroll("left")}
                  className="absolute left-0 top-1/2 z-10 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border/60 bg-background/95 shadow-lg transition-colors hover:bg-background"
                >
                  <ChevronLeft className="size-4 text-foreground" />
                </Button>
              )}
              {canScrollRight && (
                <Button
                  type="button"
                  onClick={() => scroll("right")}
                  className="absolute right-0 top-1/2 z-10 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border/60 bg-background/95 shadow-lg transition-colors hover:bg-background"
                >
                  <ChevronRight className="size-4 text-foreground" />
                </Button>
              )}
              <div
                ref={setScrollContainerRef}
                className="flex items-center gap-2 overflow-x-auto scrollbar-hide"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                <AnimatePresence initial={false}>
                  {files.map((file) => (
                    <FilePreviewItem
                      key={getFileKey(file)}
                      file={file}
                      previewUrl={getPreviewUrl(file)}
                      onRemove={onRemove}
                      disabled={disabled}
                      isUploading={isUploading}
                      uploadPhase={uploadPhase}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
