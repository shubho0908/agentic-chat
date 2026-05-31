import { type ClipboardEvent, useEffect, useReducer } from "react";
import { toast } from "sonner";
import type { Message } from "@/lib/schemas/chat";
import { useChatFileUpload } from "@/hooks/useChatFileUpload";
import { useChatTextarea } from "@/hooks/useChatTextarea";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { MAX_FILE_ATTACHMENTS, SUPPORTED_IMAGE_EXTENSIONS_DISPLAY } from "@/constants/upload";
import { extractImagesFromClipboard } from "@/lib/fileValidation";
import type { MessageSendHandler, TokenUsage } from "@/types/chat";
import { useSession } from "@/lib/authClient";
import { TOAST_ERROR_MESSAGES } from "@/constants/errors";
import { TOAST_SUCCESS_MESSAGES, TOAST_INFO_MESSAGES } from "@/constants/toasts";
import {
  getMemoryEnabled as getStoredMemoryEnabled,
  setMemoryEnabled as storeMemoryEnabled,
  getThinkingEnabled as getStoredThinkingEnabled,
  setThinkingEnabled as storeThinkingEnabled,
} from "@/lib/storage";

import { logger } from "@/lib/logger";
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

function chatInputUiReducer(state: ChatInputUiState, action: ChatInputUiAction): ChatInputUiState {
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
  const [uiState, dispatchUi] = useReducer(chatInputUiReducer, INITIAL_CHAT_INPUT_UI_STATE);
  const { isSending, memoryEnabled, thinkingEnabled } = uiState;

  const { data: session, isPending } = useSession();

  const {
    selectedFiles,
    uploadedAttachments,
    isUploading,
    handleFilesSelected,
    handleRemoveFile,
    clearAttachments,
  } = useChatFileUpload();

  const {
    input,
    setInput,
    textareaRef,
    handleKeyDown,
    handleInput,
    clearInput,
  } = useChatTextarea(sendMessage);

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
  const isContextBlocked = tokenUsage && tokenUsage.percentage >= 95 && !isLoading;

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

  async function sendMessage() {
    if (!input.trim() || isLoading || disabled || isUploading || isSending) return;

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

    try {
      const messageText = input;
      const attachmentsToSend = uploadedAttachments;

      if (selectedFiles.length > 0 && attachmentsToSend.length !== selectedFiles.length) {
        toast.info(TOAST_INFO_MESSAGES.UPLOAD_IN_PROGRESS, {
          description: "Please wait for attachments to finish uploading before sending.",
        });
        dispatchUi({ type: "set-sending", isSending: false });
        return;
      }

      clearInput();
      clearAttachments();

      const result = await onSend(
        messageText,
        attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
        null,
        !!session && memoryEnabled,
        thinkingEnabled
      );

      if (!result.success) {
        setInput(messageText);
      }
    } catch (error) {
      logger.error("Error sending message:", error);
    } finally {
      dispatchUi({ type: "set-sending", isSending: false });
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;

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
    toast.success(enabled ? TOAST_SUCCESS_MESSAGES.MEMORY_ENABLED : TOAST_SUCCESS_MESSAGES.MEMORY_DISABLED, {
      duration: 2500,
    });
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
    textareaRef,
    dropZoneRef,
    dragState,
    dragHandlers: handlers,
    formState: {
      input,
      selectedFiles,
      isLoading,
      isUploading,
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
      onInputChange: setInput,
      onKeyDown: handleKeyDown,
      onInput: handleInput,
      onPaste: handlePaste,
      onRemoveFile: handleRemoveFile,
      onToolSelected: () => {},
      onMemoryToggle: handleMemoryToggle,
      onThinkingToggle: handleThinkingToggle,
      onFilesSelected: handleFilesSelectedWithAuth,
      onStop,
      onAuthRequired,
    },
  };
}
