import { useState } from "react";
import { uploadFiles as uploadThingFiles } from "@/utils/uploadthing";
import { toast } from "sonner";
import { MAX_FILE_ATTACHMENTS } from "@/constants/upload";
import { TOAST_ERROR_MESSAGES, TOAST_SUCCESS_MESSAGES, HOOK_ERROR_MESSAGES } from "@/constants/errors";

export function useChatFileUpload() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  async function uploadFiles() {
    if (selectedFiles.length === 0) return true;

    setIsUploading(true);
    try {
      const res = await uploadThingFiles("ragDocumentUploader", {
        files: selectedFiles,
        input: {},
      });
      
      toast.success(TOAST_SUCCESS_MESSAGES.FILES_UPLOADED, {
        description: `${res.length} file(s) uploaded successfully`,
      });
      setIsUploading(false);
      setSelectedFiles([]);
      return true;
    } catch (error) {
      toast.error(TOAST_ERROR_MESSAGES.UPLOAD.FAILED, {
        description: error instanceof Error ? error.message : HOOK_ERROR_MESSAGES.UNKNOWN_ERROR,
      });
      setIsUploading(false);
      return false;
    }
  }

  function handleFilesSelected(files: File[]) {
    setSelectedFiles(prev => {
      const newFiles = [...prev, ...files];
      
      if (newFiles.length > MAX_FILE_ATTACHMENTS) {
        toast.error(TOAST_ERROR_MESSAGES.UPLOAD.TOO_MANY_FILES, {
          description: `You can only attach up to ${MAX_FILE_ATTACHMENTS} files total`,
        });
        return prev.slice(0, MAX_FILE_ATTACHMENTS);
      }
      
      return newFiles;
    });
  }

  function handleRemoveFile(index: number) {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  }

  return {
    selectedFiles,
    isUploading,
    uploadFiles,
    handleFilesSelected,
    handleRemoveFile,
  };
}
