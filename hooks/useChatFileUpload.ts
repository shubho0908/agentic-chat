import { useState } from "react";
import { uploadFiles as uploadThingFiles } from "@/utils/uploadthing";
import { toast } from "sonner";
import { MAX_FILE_ATTACHMENTS, SUPPORTED_IMAGE_EXTENSIONS_DISPLAY } from "@/constants/upload";
import { TOAST_ERROR_MESSAGES, HOOK_ERROR_MESSAGES } from "@/constants/errors";
import type { Attachment } from "@/lib/schemas/chat";
import { filterFiles, getFileNames } from "@/lib/file-validation";
import { uploadResponsesToAttachments } from "@/lib/attachment-utils";

export function useChatFileUpload() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedAttachments, setUploadedAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  async function uploadFiles(): Promise<Attachment[]> {
    if (selectedFiles.length === 0) return uploadedAttachments;

    setIsUploading(true);
    try {
      const res = await uploadThingFiles("ragDocumentUploader", {
        files: selectedFiles,
        input: {},
      });
      
      const newAttachments = uploadResponsesToAttachments(res);
      const updatedAttachments = [...uploadedAttachments, ...newAttachments];
      setUploadedAttachments(updatedAttachments);
      setIsUploading(false);
      setSelectedFiles([]);
      return updatedAttachments;
    } catch (error) {
      toast.error(TOAST_ERROR_MESSAGES.UPLOAD.FAILED, {
        description: error instanceof Error ? error.message : HOOK_ERROR_MESSAGES.UNKNOWN_ERROR,
      });
      setIsUploading(false);
      return uploadedAttachments;
    }
  }

  function handleFilesSelected(files: File[]) {
    const { validImages, unsupportedImages, validDocuments, unsupportedFiles } = filterFiles(files);
    
    if (unsupportedFiles.length > 0) {
      toast.error('Unsupported file format', {
        description: `${getFileNames(unsupportedFiles)} - Only images and documents are supported`,
        duration: 4000,
      });
    }
    
    if (unsupportedImages.length > 0) {
      toast.error('Unsupported image format', {
        description: `${getFileNames(unsupportedImages)} - Supported: ${SUPPORTED_IMAGE_EXTENSIONS_DISPLAY}`,
        duration: 5000,
      });
    }
    
    const allValidFiles = [...validImages, ...validDocuments];
    
    if (allValidFiles.length === 0) {
      return;
    }
    
    setSelectedFiles(prev => {
      const newFiles = [...prev, ...allValidFiles];
      
      if (newFiles.length > MAX_FILE_ATTACHMENTS) {
        toast.error(TOAST_ERROR_MESSAGES.UPLOAD.TOO_MANY_FILES, {
          description: `You can only attach up to ${MAX_FILE_ATTACHMENTS} files`,
        });
        return prev;
      }
      
      return newFiles;
    });
  }

  function handleRemoveFile(index: number) {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  }

  function clearAttachments() {
    setUploadedAttachments([]);
  }

  return {
    selectedFiles,
    uploadedAttachments,
    isUploading,
    uploadFiles,
    handleFilesSelected,
    handleRemoveFile,
    clearAttachments,
  };
}
