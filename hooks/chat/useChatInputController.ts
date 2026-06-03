import {
  type ClipboardEvent,
  useEffect,
  useReducer,
  useState,
  useCallback,
  useRef,
} from "react";
import { toast } from "sonner";
import type { Message } from "@/lib/schemas/chat";
import { useChatFileUpload } from "@/hooks/useChatFileUpload";
import { useChatTextarea } from "@/hooks/useChatTextarea";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import {
  MAX_FILE_ATTACHMENTS,
  SUPPORTED_IMAGE_EXTENSIONS_DISPLAY,
} from "@/constants/upload";
import { VALIDATION_LIMITS } from "@/constants/validation";
import { extractImagesFromClipboard } from "@/lib/fileValidation";
import type { MessageSendHandler, TokenUsage } from "@/types/chat";
import { useSession } from "@/lib/authClient";
import { TOAST_ERROR_MESSAGES } from "@/constants/errors";
import {
  TOAST_SUCCESS_MESSAGES,
  TOAST_INFO_MESSAGES,
} from "@/constants/toasts";
import {
  getMemoryEnabled as getStoredMemoryEnabled,
  setMemoryEnabled as storeMemoryEnabled,
  getThinkingEnabled as getStoredThinkingEnabled,
  setThinkingEnabled as storeThinkingEnabled,
} from "@/lib/storage";
import type { TextSnippet } from "@/components/chat/textSnippetPreview";
import type { UploadAttachment } from "@/lib/attachmentUtils";

import { logger } from "@/lib/logger";

function countLines(text: string): number {
  let count = 1;
  const limit = VALIDATION_LIMITS.SNIPPET_THRESHOLD_LINES + 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      count++;
      if (count > limit) return count;
    }
  }
  return count;
}
interface UseChatInputControllerProps {
  onSend: MessageSendHandler;
  isLoading: boolean;
  onStop?: () => void;
  placeholder: string;
  disabled: boolean;
  centered: boolean;
  onAuthRequired?: () => void;
  tokenUsage?: TokenUsage;
  conversationId?: string | null;
  messages?: Message[];
}

interface ChatInputUiState {
  isSending: boolean;
  memoryEnabled: boolean;
  thinkingEnabled: boolean;
}

type ChatInputUiAction =
  | { type: "hydrate"; payload: Partial<ChatInputUiState> }
  | { type: "reset-session" }
  | { type: "set-sending"; isSending: boolean }
  | { type: "set-memory"; enabled: boolean }
  | { type: "set-thinking"; enabled: boolean };

const INITIAL_CHAT_INPUT_UI_STATE: ChatInputUiState = {
  isSending: false,
  memoryEnabled: false,
  thinkingEnabled: false,
};

interface InputSnapshot {
  messageText: string;
  snippets: TextSnippet[];
  snippetFiles: Map<string, File>;
  files: File[];
  uploadedAttachments: UploadAttachment[];
}

function chatInputUiReducer(
  state: ChatInputUiState,
  action: ChatInputUiAction,
): ChatInputUiState {
  switch (action.type) {
    case "hydrate":
      return { ...state, ...action.payload };
    case "reset-session":
      return {
        ...state,
        memoryEnabled: false,
        thinkingEnabled: false,
      };
    case "set-sending":
      return { ...state, isSending: action.isSending };
    case "set-memory":
      return { ...state, memoryEnabled: action.enabled };
    case "set-thinking":
      return { ...state, thinkingEnabled: action.enabled };
    default:
      return state;
  }
}

export function useChatInputController({
  onSend,
  isLoading,
  onStop,
  placeholder,
  disabled,
  centered,
  onAuthRequired,
  tokenUsage,
}: UseChatInputControllerProps) {
  const [uiState, dispatchUi] = useReducer(
    chatInputUiReducer,
    INITIAL_CHAT_INPUT_UI_STATE,
  );
  const { isSending, memoryEnabled, thinkingEnabled } = uiState;

  const { data: session, isPending } = useSession();

  const {
    selectedFiles,
    uploadedAttachments,
    isUploading,
    uploadPhase,
    dispatchUpload,
    getFileId,
    getFilePreviewUrl,
    handleFilesSelected,
    handleRemoveFile,
    clearAttachments,
    restoreAttachments,
  } = useChatFileUpload();

  const {
    input,
    setInput,
    textareaRef,
    handleKeyDown,
    handleInput,
    clearInput,
  } = useChatTextarea(sendMessage);

  const [textSnippets, setTextSnippets] = useState<TextSnippet[]>([]);

  const snippetCountRef = useRef(0);
  const textSnippetsRef = useRef<TextSnippet[]>([]);
  const snippetFilesRef = useRef<Map<string, File>>(null!);
  if (snippetFilesRef.current === null) snippetFilesRef.current = new Map();

  const addTextSnippet = useCallback((content: string) => {
    const id = crypto.randomUUID();
    snippetCountRef.current += 1;
    const fileName =
      snippetCountRef.current === 1
        ? "pasted-text.txt"
        : `pasted-text-${snippetCountRef.current}.txt`;
    const byteSize = new TextEncoder().encode(content).byteLength;
    const file = new File([content], fileName, { type: "text/plain" });
    const next = [
      ...textSnippetsRef.current,
      { id, content, fileName, byteSize },
    ];
    textSnippetsRef.current = next;
    snippetFilesRef.current.set(id, file);
    setTextSnippets(next);
    return file;
  }, []);

  const removeTextSnippet = useCallback(
    (id: string) => {
      const file = snippetFilesRef.current.get(id);
      snippetFilesRef.current.delete(id);
      const next = textSnippetsRef.current.filter((s) => s.id !== id);
      textSnippetsRef.current = next;
      setTextSnippets(next);
      if (file) handleRemoveFile(file);
    },
    [handleRemoveFile],
  );

  useEffect(() => {
    if (!isPending) {
      if (session) {
        dispatchUi({
          type: "hydrate",
          payload: {
            memoryEnabled: getStoredMemoryEnabled(),
            thinkingEnabled: getStoredThinkingEnabled(),
          },
        });
      } else {
        dispatchUi({ type: "reset-session" });
      }
    }
  }, [session, isPending]);

  const maxFilesReached = selectedFiles.length >= MAX_FILE_ATTACHMENTS;
  const isContextBlocked =
    tokenUsage && tokenUsage.percentage >= 95 && !isLoading;

  const handleFilesSelectedWithAuth = (files: File[]) => {
    if (!session) {
      toast.error(TOAST_ERROR_MESSAGES.AUTH.REQUIRED, {
        description: "Please sign in to attach files",
      });
      return;
    }
    handleFilesSelected(files);
  };

  const { dragState, dropZoneRef, handlers } = useDragAndDrop({
    onFilesDropped: handleFilesSelectedWithAuth,
    disabled: disabled || isLoading || isUploading || maxFilesReached,
    maxFiles: MAX_FILE_ATTACHMENTS,
    currentFileCount: selectedFiles.length,
  });

  const restoreInputFromSnapshot = useCallback(
    (snap: InputSnapshot, withAttachments: boolean) => {
      setInput(snap.messageText);
      setTextSnippets(snap.snippets);
      textSnippetsRef.current = snap.snippets;
      snippetFilesRef.current = snap.snippetFiles;
      if (withAttachments) {
        restoreAttachments(snap.files, snap.uploadedAttachments);
        dispatchUpload({ type: "idle" });
      }
    },
    [restoreAttachments, dispatchUpload, setInput, setTextSnippets],
  );

  async function sendMessage() {
    if (
      (!input.trim() && textSnippets.length === 0) ||
      isLoading ||
      disabled ||
      isUploading ||
      isSending
    )
      return;

    if (isContextBlocked) {
      toast.error(TOAST_ERROR_MESSAGES.CONTEXT.LIMIT_REACHED, {
        description: TOAST_ERROR_MESSAGES.CONTEXT.LIMIT_REACHED_DESCRIPTION,
        duration: 3000,
      });
      return;
    }

    if (!session && selectedFiles.length > 0) {
      toast.error(TOAST_ERROR_MESSAGES.AUTH.REQUIRED, {
        description: TOAST_ERROR_MESSAGES.AUTH.REQUIRED_DESCRIPTION,
      });
      dispatchUi({ type: "set-sending", isSending: false });
      return;
    }

    dispatchUi({ type: "set-sending", isSending: true });

    let hasDocuments = false;
    let snapshot: InputSnapshot | null = null;
    try {
      const messageText = input;
      const attachmentsToSend = uploadedAttachments;
      hasDocuments = selectedFiles.length > 0;

      if (hasDocuments && attachmentsToSend.length !== selectedFiles.length) {
        toast.info(TOAST_INFO_MESSAGES.UPLOAD_IN_PROGRESS, {
          description:
            "Please wait for attachments to finish uploading before sending.",
        });
        dispatchUi({ type: "set-sending", isSending: false });
        return;
      }

      snapshot = {
        messageText,
        snippets: [...textSnippetsRef.current],
        snippetFiles: new Map(snippetFilesRef.current),
        files: [...selectedFiles],
        uploadedAttachments: [...uploadedAttachments],
      };

      clearInput();
      textSnippetsRef.current = [];
      snippetFilesRef.current.clear();
      setTextSnippets([]);

      if (hasDocuments) {
        dispatchUpload({ type: "process" });
        clearAttachments();
      }

      const result = await onSend(
        messageText,
        attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
        null,
        !!session && memoryEnabled,
        thinkingEnabled,
      );

      if (!result.success) {
        if (snapshot) {
          restoreInputFromSnapshot(snapshot, hasDocuments);
        }
      } else if (hasDocuments) {
        dispatchUpload({ type: "idle" });
      }
    } catch (error) {
      logger.error("Error sending message:", error);
      if (snapshot) {
        restoreInputFromSnapshot(snapshot, hasDocuments);
      } else if (hasDocuments) {
        dispatchUpload({ type: "idle" });
      }
    } finally {
      dispatchUi({ type: "set-sending", isSending: false });
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;

    const pastedText = e.clipboardData.getData("text/plain");
    if (
      pastedText &&
      (pastedText.length > VALIDATION_LIMITS.SNIPPET_THRESHOLD_CHARS ||
        countLines(pastedText) > VALIDATION_LIMITS.SNIPPET_THRESHOLD_LINES)
    ) {
      e.preventDefault();

      if (!session) {
        toast.error(TOAST_ERROR_MESSAGES.AUTH.REQUIRED, {
          description: "Please sign in to attach files",
        });
        return;
      }

      const file = addTextSnippet(pastedText);
      handleFilesSelected([file]);
      return;
    }

    const { files, hasUnsupportedFormats } = extractImagesFromClipboard(items);

    if (hasUnsupportedFormats) {
      toast.error(TOAST_ERROR_MESSAGES.UPLOAD.UNSUPPORTED_FORMAT, {
        description: `Supported formats: ${SUPPORTED_IMAGE_EXTENSIONS_DISPLAY}`,
        duration: 5000,
      });
    }

    if (files.length > 0) {
      if (!session) {
        toast.error(TOAST_ERROR_MESSAGES.AUTH.REQUIRED, {
          description: "Please sign in to attach files",
        });
        return;
      }
      handleFilesSelected(files);
    }
  }

  function handleMemoryToggle(enabled: boolean) {
    if (enabled && !session) {
      onAuthRequired?.();
      toast.error(TOAST_ERROR_MESSAGES.AUTH.REQUIRED, {
        description: TOAST_ERROR_MESSAGES.MEMORY_UI.AUTH_REQUIRED_DESCRIPTION,
        duration: 3000,
      });
      return;
    }

    dispatchUi({ type: "set-memory", enabled });
    storeMemoryEnabled(enabled);
    toast.success(
      enabled
        ? TOAST_SUCCESS_MESSAGES.MEMORY_ENABLED
        : TOAST_SUCCESS_MESSAGES.MEMORY_DISABLED,
      {
        duration: 2500,
      },
    );
  }

  function handleThinkingToggle(enabled: boolean) {
    dispatchUi({ type: "set-thinking", enabled });
    storeThinkingEnabled(enabled);
  }

  return {
    centered,
    placeholder: isContextBlocked
      ? "Context limit reached. Start a new chat to continue..."
      : placeholder,
    maxFilesReached,
    textSnippets,
    textareaRef,
    dropZoneRef,
    dragState,
    dragHandlers: handlers,
    formState: {
      input,
      selectedFiles,
      isLoading,
      isUploading,
      uploadPhase,
      getFileId,
      getFilePreviewUrl,
      isSending,
      disabled: disabled || !!isContextBlocked,
      activeTool: null,
      memoryEnabled,
      thinkingEnabled,
    },
    formHandlers: {
      onSubmit: (e: React.FormEvent) => {
        e.preventDefault();
        void sendMessage();
      },
      onInputChange: (value: string) => {
        if (value.length <= VALIDATION_LIMITS.CHAT_MESSAGE_MAX_LENGTH) {
          setInput(value);
        }
      },
      onKeyDown: handleKeyDown,
      onInput: handleInput,
      onPaste: handlePaste,
      onRemoveFile: handleRemoveFile,
      onRemoveSnippet: removeTextSnippet,
      onToolSelected: () => {},
      onMemoryToggle: handleMemoryToggle,
      onThinkingToggle: handleThinkingToggle,
      onFilesSelected: handleFilesSelectedWithAuth,
      onStop,
      onAuthRequired,
    },
  };
}
