"use client";

import { useRef } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { MAX_FILE_ATTACHMENTS, SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_DOCUMENT_EXTENSIONS } from "@/constants/upload";
import { TOAST_ERROR_MESSAGES } from "@/constants/errors";

interface FileUploadButtonProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  currentFileCount?: number;
}

const ACCEPTED_FILE_TYPES = [
  'image/*',
  ...SUPPORTED_IMAGE_EXTENSIONS,
  ...SUPPORTED_DOCUMENT_EXTENSIONS,
].join(',');

export function FileUploadButton({ onFilesSelected, disabled, currentFileCount = 0 }: FileUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const remainingSlots = MAX_FILE_ATTACHMENTS - currentFileCount;
      
      if (remainingSlots <= 0) {
        toast.error(TOAST_ERROR_MESSAGES.UPLOAD.MAX_REACHED, {
          description: `You can only attach up to ${MAX_FILE_ATTACHMENTS} files total`,
        });
        return;
      }
      
      if (files.length > remainingSlots) {
        toast.error(TOAST_ERROR_MESSAGES.UPLOAD.TOO_MANY_FILES, {
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
        accept={ACCEPTED_FILE_TYPES}
        disabled={disabled}
      />

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="size-10 rounded-xl transition-colors"
            >
              <Paperclip className="size-4" />
              <span className="sr-only">Attach files</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Attach files</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  );
}
