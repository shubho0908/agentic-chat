"use client";

import { X, FileText, FileSpreadsheet, Image as ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface FilePreviewProps {
  files: File[];
  onRemove: (index: number) => void;
}

export function FilePreview({ files, onRemove }: FilePreviewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const checkScroll = () => {
      const container = scrollContainerRef.current;
      if (!container) return;

      setCanScrollLeft(container.scrollLeft > 0);
      setCanScrollRight(
        container.scrollLeft < container.scrollWidth - container.clientWidth - 1
      );
    };

    const container = scrollContainerRef.current;
    if (container) {
      checkScroll();
      container.addEventListener("scroll", checkScroll);
      window.addEventListener("resize", checkScroll);

      return () => {
        container.removeEventListener("scroll", checkScroll);
        window.removeEventListener("resize", checkScroll);
      };
    }
  }, [files]);

  const scroll = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = 200;
    const newScrollLeft = direction === "left" 
      ? container.scrollLeft - scrollAmount 
      : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: newScrollLeft,
      behavior: "smooth",
    });
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) {
      return <ImageIcon className="size-4" />;
    }
    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      return <FileText className="size-4" />;
    }
    if (file.type.includes("spreadsheet") || file.name.match(/\.(xlsx?|csv)$/)) {
      return <FileSpreadsheet className="size-4" />;
    }
    if (file.type.includes("wordprocessingml") || file.name.endsWith(".docx")) {
      return <FileText className="size-4" />;
    }
    return <FileText className="size-4" />;
  };

  const getFilePreview = (file: File) => {
    if (file.type.startsWith("image/")) {
      return URL.createObjectURL(file);
    }
    return null;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <AnimatePresence>
      {files.length > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div className="border-b border-border/50 px-3 pt-3 pb-2 relative">
            {canScrollLeft && (
              <button
                type="button"
                onClick={() => scroll("left")}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center size-8 rounded-full bg-background/95 border border-border/60 shadow-lg hover:bg-background transition-colors"
              >
                <ChevronLeft className="size-4" />
              </button>
            )}
            {canScrollRight && (
              <button
                type="button"
                onClick={() => scroll("right")}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center size-8 rounded-full bg-background/95 border border-border/60 shadow-lg hover:bg-background transition-colors"
              >
                <ChevronRight className="size-4" />
              </button>
            )}
            <div 
              ref={scrollContainerRef}
              className="flex items-center gap-2 overflow-x-auto scrollbar-hide"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {files.map((file, index) => {
                const preview = getFilePreview(file);
                return (
                  <motion.div
                    key={`${file.name}-${index}`}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="group relative flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/70 px-3 py-2 hover:bg-muted/90 hover:border-border transition-all flex-shrink-0"
                  >
                    {preview ? (
                      <div className="relative size-10 rounded-md overflow-hidden flex-shrink-0 ring-1 ring-border/50">
                        <Image
                          src={preview}
                          alt={file.name}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="flex size-10 items-center justify-center rounded-md bg-background/80 ring-1 ring-border/50 flex-shrink-0">
                        {getFileIcon(file)}
                      </div>
                    )}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-medium truncate max-w-[120px]" title={file.name}>
                        {file.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground/70">
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => onRemove(index)}
                      className="size-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background/80"
                    >
                      <X className="size-3" />
                    </Button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
