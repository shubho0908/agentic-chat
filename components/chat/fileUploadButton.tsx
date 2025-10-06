"use client";

import { useRef } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUploadThing } from "@/utils/uploadthing";
import { toast } from "sonner";
import { MAX_FILE_ATTACHMENTS } from "@/constants/upload";

interface FileUploadButtonProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  currentFileCount?: number;
}

export function FileUploadButton({ onFilesSelected, disabled, currentFileCount = 0 }: FileUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { routeConfig } = useUploadThing("ragDocumentUploader");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const remainingSlots = MAX_FILE_ATTACHMENTS - currentFileCount;
      
      if (remainingSlots <= 0) {
        toast.error("Maximum files reached", {
          description: `You can only attach up to ${MAX_FILE_ATTACHMENTS} files total`,
        });
        return;
      }
      
      if (files.length > remainingSlots) {
        toast.error("Too many files", {
          description: `You can only add ${remainingSlots} more file(s)`,
        });
        return;
      }
      
      onFilesSelected(files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        accept={routeConfig ? Object.keys(routeConfig).map(type => {
          if (type === "image") return "image/*";
          if (type === "pdf") return ".pdf";
          if (type === "text") return ".txt";
          if (type.includes("wordprocessingml")) return ".docx";
          if (type.includes("spreadsheetml")) return ".xlsx,.xls";
          return "";
        }).filter(Boolean).join(",") : undefined}
        disabled={disabled}
      />

      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        className="size-10 rounded-xl transition-colors"
        title="Attach files"
      >
        <Paperclip className="size-4" />
        <span className="sr-only">Attach files</span>
      </Button>
    </>
  );
}
