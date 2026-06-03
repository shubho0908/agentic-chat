import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type SetStateAction,
} from "react";
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
import {
  filterFiles,
  getFileNames,
  isSupportedDocumentExtension,
  isSupportedImageExtension,
} from "@/lib/fileValidation";
import {
  uploadResponsesToAttachments,
  type UploadAttachment,
} from "@/lib/attachmentUtils";

type UploadedAttachmentsState = Array<UploadAttachment>;

const EMPTY_SELECTED_FILES: File[] = [];
const EMPTY_UPLOAD_ATTACHMENTS: UploadedAttachmentsState = [];

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

function createClientFileId(): string {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function canUseObjectUrls(): boolean {
  return (
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function" &&
    typeof URL.revokeObjectURL === "function"
  );
}

function isPreviewableImageFile(file: File): boolean {
  return (
    isSupportedImageExtension(file.name) &&
    !isSupportedDocumentExtension(file.name)
  );
}

export interface UploadPhase {
  isUploading: boolean;
  isProcessing: boolean;
  isBusy: boolean;
}

type UploadAction = { type: "upload" } | { type: "process" } | { type: "idle" };

const IDLE_PHASE: UploadPhase = {
  isUploading: false,
  isProcessing: false,
  isBusy: false,
};
const UPLOADING_PHASE: UploadPhase = {
  isUploading: true,
  isProcessing: false,
  isBusy: true,
};
const PROCESSING_PHASE: UploadPhase = {
  isUploading: false,
  isProcessing: true,
  isBusy: true,
};

function uploadPhaseReducer(_: UploadPhase, action: UploadAction): UploadPhase {
  switch (action.type) {
    case "upload":
      return UPLOADING_PHASE;
    case "process":
      return PROCESSING_PHASE;
    case "idle":
      return IDLE_PHASE;
  }
}

export function useChatFileUpload() {
  const [selectedFilesState, setSelectedFilesState] = useState(EMPTY_SELECTED_FILES);
  const [uploadedAttachments, setUploadedAttachments] = useState(EMPTY_UPLOAD_ATTACHMENTS);
  const [uploadPhase, dispatchUpload] = useReducer(
    uploadPhaseReducer,
    IDLE_PHASE,
  );
  const selectedFilesRef = useRef<File[]>([]);
  const fileIdMapRef = useRef<WeakMap<File, string>>(null!);
  const filePreviewUrlMapRef = useRef<Map<File, string>>(null!);
  if (fileIdMapRef.current === null) fileIdMapRef.current = new WeakMap();
  if (filePreviewUrlMapRef.current === null)
    filePreviewUrlMapRef.current = new Map();
  const publicUploadedAttachments = useMemo<Attachment[]>(
    () =>
      uploadedAttachments.map(
        ({ id, fileUrl, fileName, fileType, fileSize }) => ({
          id,
          fileUrl,
          fileName,
          fileType,
          fileSize,
        }),
      ),
    [uploadedAttachments],
  );

  const revokeFilePreviewUrl = useCallback((file: File) => {
    const previewUrl = filePreviewUrlMapRef.current.get(file);
    if (!previewUrl) return;

    if (canUseObjectUrls()) {
      URL.revokeObjectURL(previewUrl);
    }
    filePreviewUrlMapRef.current.delete(file);
  }, []);

  const revokeAllFilePreviewUrls = useCallback(() => {
    if (canUseObjectUrls()) {
      for (const previewUrl of filePreviewUrlMapRef.current.values()) {
        URL.revokeObjectURL(previewUrl);
      }
    }
    filePreviewUrlMapRef.current.clear();
  }, []);

  const getFilePreviewUrl = useCallback((file: File): string | null => {
    return filePreviewUrlMapRef.current.get(file) ?? null;
  }, []);

  const ensureFilePreviewUrl = useCallback((file: File): string | null => {
    if (!isPreviewableImageFile(file) || !canUseObjectUrls()) {
      return null;
    }

    const existingUrl = filePreviewUrlMapRef.current.get(file);
    if (existingUrl) {
      return existingUrl;
    }

    const nextUrl = URL.createObjectURL(file);
    filePreviewUrlMapRef.current.set(file, nextUrl);
    return nextUrl;
  }, []);

  const getFileId = useCallback((file: File) => {
    const existingId = fileIdMapRef.current.get(file);
    if (existingId) {
      return existingId;
    }

    const nextId = createClientFileId();
    fileIdMapRef.current.set(file, nextId);
    return nextId;
  }, []);

  function setSelectedFiles(value: SetStateAction<File[]>) {
    setSelectedFilesState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      selectedFilesRef.current = next;
      return next;
    });
  }

  useEffect(() => {
    const activeFiles = new Set(selectedFilesState);

    for (const file of filePreviewUrlMapRef.current.keys()) {
      if (!activeFiles.has(file)) {
        revokeFilePreviewUrl(file);
      }
    }
  }, [selectedFilesState, revokeFilePreviewUrl]);

  useEffect(() => {
    return revokeAllFilePreviewUrls;
  }, [revokeAllFilePreviewUrls]);

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
      toast.error("Unsupported file format", {
        description: `${getFileNames(unsupportedFiles)} - Only images and documents are supported`,
        duration: 4000,
      });
    }

    if (unsupportedImages.length > 0) {
      toast.error("Unsupported image format", {
        description: `${getFileNames(unsupportedImages)} - Supported: ${SUPPORTED_IMAGE_EXTENSIONS_DISPLAY}`,
        duration: 5000,
      });
    }

    if (oversizedImages.length > 0) {
      toast.error("Image too large", {
        description: `${getFileNames(oversizedImages)} - Images must be ${MAX_IMAGE_FILE_SIZE_LABEL} or smaller`,
        duration: 5000,
      });
    }

    if (oversizedDocuments.length > 0) {
      toast.error("Document too large", {
        description: `${getFileNames(oversizedDocuments)} - Documents must be ${MAX_DOCUMENT_FILE_SIZE_LABEL} or smaller`,
        duration: 5000,
      });
    }

    const allValidFiles = [...validImages, ...validDocuments];

    if (allValidFiles.length === 0) {
      return;
    }

    const nextFileCount =
      selectedFilesRef.current.length + allValidFiles.length;
    if (nextFileCount > MAX_FILE_ATTACHMENTS) {
      toast.error(TOAST_ERROR_MESSAGES.UPLOAD.TOO_MANY_FILES, {
        description: `You can only attach up to ${MAX_FILE_ATTACHMENTS} files`,
      });
      return;
    }

    allValidFiles.forEach(ensureFilePreviewUrl);

    const uploadBatch = allValidFiles.map((file) => ({
      clientFileId: getFileId(file),
    }));
    const uploadBatchIds = new Set(
      uploadBatch.map(({ clientFileId }) => clientFileId),
    );
    const nextFiles = [...selectedFilesRef.current, ...allValidFiles];

    setSelectedFiles(nextFiles);
    dispatchUpload({ type: "upload" });

    try {
      const response = await uploadThingFiles("ragDocumentUploader", {
        files: allValidFiles,
        input: {},
      });

      const newAttachments = uploadResponsesToAttachments(
        response,
        uploadBatch,
      );

      setUploadedAttachments((prev) => {
        const activeFileIds = new Set(selectedFilesRef.current.map(getFileId));
        const nextAttachments = prev.filter(
          (attachment) =>
            !attachment.clientFileId ||
            activeFileIds.has(attachment.clientFileId),
        );

        for (const attachment of newAttachments) {
          if (
            attachment.clientFileId &&
            activeFileIds.has(attachment.clientFileId)
          ) {
            nextAttachments.push(attachment);
          }
        }

        return nextAttachments;
      });
    } catch (error) {
      setSelectedFiles((prev) =>
        prev.filter((file) => !uploadBatchIds.has(getFileId(file))),
      );
      setUploadedAttachments((prev) =>
        prev.filter(
          (attachment) =>
            !attachment.clientFileId ||
            !uploadBatchIds.has(attachment.clientFileId),
        ),
      );
      toast.error(TOAST_ERROR_MESSAGES.UPLOAD.FAILED, {
        description: getUploadErrorDescription(error),
      });
    } finally {
      dispatchUpload({ type: "idle" });
    }
  }

  function handleRemoveFile(file: File) {
    if (!file) return;

    const fileId = getFileId(file);

    setSelectedFiles((prev) => prev.filter((f) => getFileId(f) !== fileId));
    setUploadedAttachments((prev) =>
      prev.filter((attachment) => attachment.clientFileId !== fileId),
    );
  }

  function clearAttachments() {
    setSelectedFiles([]);
    setUploadedAttachments([]);
  }

  function restoreAttachments(files: File[], attachments: UploadAttachment[]) {
    files.forEach(ensureFilePreviewUrl);
    setSelectedFiles(files);
    setUploadedAttachments(attachments);
  }

  return {
    selectedFiles: selectedFilesState,
    uploadedAttachments: publicUploadedAttachments,
    isUploading: uploadPhase.isBusy,
    uploadPhase,
    dispatchUpload,
    getFileId,
    getFilePreviewUrl,
    handleFilesSelected,
    handleRemoveFile,
    clearAttachments,
    restoreAttachments,
  };
}
