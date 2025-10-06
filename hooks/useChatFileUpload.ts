import { useState } from "react";
import { useUploadThing } from "@/utils/uploadthing";
import { toast } from "sonner";
import { MAX_FILE_ATTACHMENTS } from "@/constants/upload";

export function useChatFileUpload() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const { startUpload } = useUploadThing("ragDocumentUploader", {
    onClientUploadComplete: (res) => {
      toast.success("Files uploaded", {
        description: `${res.length} file(s) uploaded successfully`,
      });
      setIsUploading(false);
      setSelectedFiles([]);
    },
    onUploadError: (error: Error) => {
      toast.error("Upload failed", {
        description: error.message,
      });
      setIsUploading(false);
    },
  });

  async function uploadFiles() {
    if (selectedFiles.length === 0) return true;

    setIsUploading(true);
    try {
      await startUpload(selectedFiles, {});
      return true;
    } catch (error) {
      toast.error("Upload failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      setIsUploading(false);
      return false;
    }
  }

  function handleFilesSelected(files: File[]) {
    setSelectedFiles(prev => {
      const newFiles = [...prev, ...files];
      
      if (newFiles.length > MAX_FILE_ATTACHMENTS) {
        toast.error("Too many files", {
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
