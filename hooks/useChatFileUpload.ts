import { useRef, useState, type SetStateAction } from "react";
import { uploadFiles as uploadThingFiles } from "@/utils/uploadthing";
import { toast } from "sonner";
import {
  MAX_DOCUMENT_FILE_SIZE_LABEL,
  MAX_FILE_ATTACHMENTS,
  MAX_IMAGE_FILE_SIZE_LABEL,
  SUPPORTED_IMAGE_EXTENSIONS_DISPLAY,
} from "@/constants/upload";
import { TOAST_ERROR_MESSAGES, HOOK_ERROR_MESSAGES } from "@/constants/errors";
import type { Attachment } from "@/lib/schemas/chat";
import { filterFiles, getFileNames } from "@/lib/file-validation";
import { uploadResponsesToAttachments, type UploadAttachment } from "@/lib/attachment-utils";

function getUploadErrorDescription(error: unknown): string {
  if (!(error instanceof Error)) {
    return HOOK_ERROR_MESSAGES.UNKNOWN_ERROR;
  }

  const message = error.message.trim();

  if (message.includes("FileSizeMismatch")) {
    return `That file is too large. Images must be ${MAX_IMAGE_FILE_SIZE_LABEL} or smaller, and documents must be ${MAX_DOCUMENT_FILE_SIZE_LABEL} or smaller.`;
  }

  return message || HOOK_ERROR_MESSAGES.UNKNOWN_ERROR;
}

export function useChatFileUpload() {
  const [selectedFilesState, setSelectedFilesState] = useState<File[]>([]);
  const [uploadedAttachments, setUploadedAttachments] = useState<UploadAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const selectedFilesRef = useRef<File[]>([]);
  const fileIdMapRef = useRef(new WeakMap<File, string>());

  function setSelectedFiles(value: SetStateAction<File[]>) {
    setSelectedFilesState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      selectedFilesRef.current = next;
      return next;
    });
  }

  function getFileId(file: File) {
    const existingId = fileIdMapRef.current.get(file);
    if (existingId) {
      return existingId;
    }

    const nextId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    fileIdMapRef.current.set(file, nextId);
    return nextId;
  }

  async function handleFilesSelected(files: File[]) {
    const {
      validImages,
      unsupportedImages,
      oversizedImages,
      validDocuments,
      oversizedDocuments,
      unsupportedFiles,
    } = filterFiles(files);
    
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

    if (oversizedImages.length > 0) {
      toast.error('Image too large', {
        description: `${getFileNames(oversizedImages)} - Images must be ${MAX_IMAGE_FILE_SIZE_LABEL} or smaller`,
        duration: 5000,
      });
    }

    if (oversizedDocuments.length > 0) {
      toast.error('Document too large', {
        description: `${getFileNames(oversizedDocuments)} - Documents must be ${MAX_DOCUMENT_FILE_SIZE_LABEL} or smaller`,
        duration: 5000,
      });
    }
    
    const allValidFiles = [...validImages, ...validDocuments];
    
    if (allValidFiles.length === 0) {
      return;
    }

    const nextFileCount = selectedFilesRef.current.length + allValidFiles.length;
    if (nextFileCount > MAX_FILE_ATTACHMENTS) {
      toast.error(TOAST_ERROR_MESSAGES.UPLOAD.TOO_MANY_FILES, {
        description: `You can only attach up to ${MAX_FILE_ATTACHMENTS} files`,
      });
      return;
    }

    const uploadBatch = allValidFiles.map((file) => ({
      clientFileId: getFileId(file),
    }));
    const uploadBatchIds = new Set(uploadBatch.map(({ clientFileId }) => clientFileId));
    const nextFiles = [...selectedFilesRef.current, ...allValidFiles];

    setSelectedFiles(nextFiles);
    setIsUploading(true);

    try {
      const response = await uploadThingFiles("ragDocumentUploader", {
        files: allValidFiles,
        input: {},
      });

      const newAttachments = uploadResponsesToAttachments(response, uploadBatch);

      setUploadedAttachments((prev) => {
        const activeFileIds = new Set(selectedFilesRef.current.map(getFileId));
        const nextAttachments = prev.filter(
          (attachment) => !attachment.clientFileId || activeFileIds.has(attachment.clientFileId)
        );

        for (const attachment of newAttachments) {
          if (attachment.clientFileId && activeFileIds.has(attachment.clientFileId)) {
            nextAttachments.push(attachment);
          }
        }

        return nextAttachments;
      });
    } catch (error) {
      setSelectedFiles((prev) => prev.filter((file) => !uploadBatchIds.has(getFileId(file))));
      setUploadedAttachments((prev) =>
        prev.filter((attachment) => !attachment.clientFileId || !uploadBatchIds.has(attachment.clientFileId))
      );
      toast.error(TOAST_ERROR_MESSAGES.UPLOAD.FAILED, {
        description: getUploadErrorDescription(error),
      });
    } finally {
      setIsUploading(false);
    }
  }

  function handleRemoveFile(index: number) {
    const fileToRemove = selectedFilesRef.current[index];
    if (!fileToRemove) {
      return;
    }

    const fileId = getFileId(fileToRemove);

    setSelectedFiles((prev) => prev.filter((file) => getFileId(file) !== fileId));
    setUploadedAttachments((prev) => prev.filter((attachment) => attachment.clientFileId !== fileId));
  }

  function clearAttachments() {
    setSelectedFiles([]);
    setUploadedAttachments([]);
  }

  return {
    selectedFiles: selectedFilesState,
    uploadedAttachments: uploadedAttachments as Attachment[],
    isUploading,
    handleFilesSelected,
    handleRemoveFile,
    clearAttachments,
  };
}
