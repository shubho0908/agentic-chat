import { type ClipboardEvent, useEffect, useReducer } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { Message } from "@/lib/schemas/chat";
import { useChatFileUpload } from "@/hooks/useChatFileUpload";
import { useChatTextarea } from "@/hooks/useChatTextarea";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { useDeepResearchUsage } from "@/hooks/useDeepResearchUsage";
import { useGoogleSuiteAuth } from "@/hooks/useGoogleSuiteAuth";
import { MAX_FILE_ATTACHMENTS, SUPPORTED_IMAGE_EXTENSIONS_DISPLAY } from "@/constants/upload";
import { extractImagesFromClipboard } from "@/lib/fileValidation";
import { isValidToolId, TOOL_IDS, type ToolId } from "@/lib/tools/config";
import type { SearchDepth } from "@/lib/schemas/webSearchTools";
import type { MessageSendHandler, TokenUsage } from "@/types/chat";
import { useSession } from "@/lib/authClient";
import { TOAST_ERROR_MESSAGES } from "@/constants/errors";
import { TOAST_SUCCESS_MESSAGES, TOAST_INFO_MESSAGES } from "@/constants/toasts";
import { extractTextFromMessage } from "@/lib/chat/messageContent";
import {
  GOOGLE_SIGN_IN_SCOPES,
  getMissingGoogleScopes,
  resolveGoogleWorkspaceScopesForRequest,
} from "@/lib/tools/google-suite/scopes";
import {
  getActiveTool as getStoredActiveTool,
  setActiveTool as storeActiveTool,
  removeActiveTool,
  getPendingGoogleWorkspaceQuery,
  getMemoryEnabled as getStoredMemoryEnabled,
  setMemoryEnabled as storeMemoryEnabled,
  getDeepResearchEnabled as getStoredDeepResearchEnabled,
  setDeepResearchEnabled as storeDeepResearchEnabled,
  getSearchDepth as getStoredSearchDepth,
  setSearchDepth as storeSearchDepth,
  setPendingGoogleWorkspaceQuery,
  clearPendingGoogleWorkspaceQuery,
} from "@/lib/storage";

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
  activeTool: ToolId | null;
  memoryEnabled: boolean;
  deepResearchEnabled: boolean;
  searchDepth: SearchDepth;
}

type ChatInputUiAction =
  | { type: "hydrate"; payload: Partial<ChatInputUiState> }
  | { type: "reset-session" }
  | { type: "set-sending"; isSending: boolean }
  | { type: "set-memory"; enabled: boolean }
  | { type: "set-deep-research"; enabled: boolean }
  | { type: "activate-tool"; toolId: ToolId; searchDepth?: SearchDepth }
  | { type: "deactivate-tool" };

const INITIAL_CHAT_INPUT_UI_STATE: ChatInputUiState = {
  isSending: false,
  activeTool: null,
  memoryEnabled: false,
  deepResearchEnabled: false,
  searchDepth: "basic",
};

function chatInputUiReducer(state: ChatInputUiState, action: ChatInputUiAction): ChatInputUiState {
  switch (action.type) {
    case "hydrate":
      return { ...state, ...action.payload };
    case "reset-session":
      return {
        ...state,
        activeTool: null,
        memoryEnabled: false,
        deepResearchEnabled: false,
      };
    case "set-sending":
      return {
        ...state,
        isSending: action.isSending,
      };
    case "set-memory":
      return {
        ...state,
        memoryEnabled: action.enabled,
      };
    case "set-deep-research":
      return {
        ...state,
        deepResearchEnabled: action.enabled,
      };
    case "activate-tool":
      return {
        ...state,
        activeTool: action.toolId,
        deepResearchEnabled: action.toolId === TOOL_IDS.DEEP_RESEARCH,
        searchDepth:
          action.toolId === TOOL_IDS.WEB_SEARCH && action.searchDepth
            ? action.searchDepth
            : state.searchDepth,
      };
    case "deactivate-tool":
      return {
        ...state,
        activeTool: null,
        deepResearchEnabled:
          state.activeTool === TOOL_IDS.DEEP_RESEARCH ? false : state.deepResearchEnabled,
      };
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
  conversationId,
  messages = [],
}: UseChatInputControllerProps) {
  const [uiState, dispatchUi] = useReducer(chatInputUiReducer, INITIAL_CHAT_INPUT_UI_STATE);
  const { isSending, activeTool, memoryEnabled, deepResearchEnabled, searchDepth } = uiState;

  const { data: session, isPending } = useSession();
  const { data: usageData } = useDeepResearchUsage({ enabled: !!session });
  const { status: googleSuiteStatus, isLoading: googleSuiteAuthLoading } = useGoogleSuiteAuth({ enabled: !!session });
  const router = useRouter();

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
        const stored = getStoredActiveTool();
        dispatchUi({
          type: "hydrate",
          payload: {
            activeTool: stored && isValidToolId(stored) ? (stored as ToolId) : null,
            memoryEnabled: getStoredMemoryEnabled(),
            deepResearchEnabled: getStoredDeepResearchEnabled(),
            searchDepth: getStoredSearchDepth(),
          },
        });
      } else {
        dispatchUi({ type: "reset-session" });
      }
    }
  }, [session, isPending]);

  useEffect(() => {
    if (usageData?.remaining === 0 && (deepResearchEnabled || activeTool === TOOL_IDS.DEEP_RESEARCH)) {
      dispatchUi({ type: "set-deep-research", enabled: false });
      if (activeTool === TOOL_IDS.DEEP_RESEARCH) {
        dispatchUi({ type: "deactivate-tool" });
        removeActiveTool();
      }
      toast.info(TOAST_INFO_MESSAGES.DEEP_RESEARCH_DEACTIVATED, {
        description: TOAST_INFO_MESSAGES.DEEP_RESEARCH_MONTHLY_LIMIT,
        duration: 5000,
      });
    }
  }, [usageData, deepResearchEnabled, activeTool]);

  useEffect(() => {
    if (!session || activeTool !== TOOL_IDS.GOOGLE_SUITE || input.trim()) {
      return;
    }

    const pendingQuery = getPendingGoogleWorkspaceQuery();

    if (!pendingQuery) {
      return;
    }

    setInput(pendingQuery);
    clearPendingGoogleWorkspaceQuery();
    toast.success("Google Workspace request restored", {
      description: "Your draft was restored after the permissions flow.",
      duration: 3000,
    });
  }, [activeTool, input, session, setInput]);

  const maxFilesReached = selectedFiles.length >= MAX_FILE_ATTACHMENTS;
  const isContextBlocked = tokenUsage && tokenUsage.percentage >= 95 && !isLoading;
  const signInScopes = new Set<string>(GOOGLE_SIGN_IN_SCOPES);
  const hasWorkspaceAccess = (googleSuiteStatus?.hasWorkspaceAccess ?? false) || (googleSuiteStatus?.grantedScopes ?? []).some(
    (scope) => !signInScopes.has(scope)
  );

  function activateTool(toolId: ToolId, selectedDepth?: SearchDepth) {
    if (!session) {
      onAuthRequired?.();
      toast.error(TOAST_ERROR_MESSAGES.AUTH.REQUIRED, {
        description: TOAST_ERROR_MESSAGES.TOOLS.AUTH_REQUIRED_DESCRIPTION,
        duration: 3000,
      });
      return false;
    }

    if (toolId === TOOL_IDS.DEEP_RESEARCH && usageData && usageData.remaining === 0) {
      const resetDate = new Date(usageData.resetDate).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
      });
      toast.error(TOAST_ERROR_MESSAGES.DEEP_RESEARCH_UI.UNAVAILABLE, {
        description: TOAST_ERROR_MESSAGES.DEEP_RESEARCH_UI.MONTHLY_LIMIT_DESCRIPTION(usageData.limit, resetDate),
        duration: 5000,
      });
      return false;
    }

    dispatchUi({ type: "activate-tool", toolId, searchDepth: selectedDepth });
    storeActiveTool(toolId);
    storeDeepResearchEnabled(toolId === TOOL_IDS.DEEP_RESEARCH);

    if (toolId === TOOL_IDS.WEB_SEARCH && selectedDepth) {
      storeSearchDepth(selectedDepth);
    }

    const toolName = toolId === TOOL_IDS.WEB_SEARCH ? "Web Search" : toolId.replace("_", " ");
    const currentDepth = selectedDepth || searchDepth;
    const searchModeText = toolId === TOOL_IDS.WEB_SEARCH
      ? ` (${currentDepth === "advanced" ? "Advanced" : "Basic"})`
      : "";

    toast.success(TOAST_ERROR_MESSAGES.TOOLS.ACTIVATED, {
      description: `${toolName}${searchModeText} is now enabled for your next query`,
      duration: 2500,
    });

    return true;
  }

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

    if (deepResearchEnabled && usageData && usageData.remaining === 0) {
      dispatchUi({ type: "set-deep-research", enabled: false });
      toast.error(TOAST_ERROR_MESSAGES.DEEP_RESEARCH_UI.LIMIT_REACHED, {
        description: TOAST_ERROR_MESSAGES.DEEP_RESEARCH_UI.LIMIT_REACHED_DESCRIPTION,
        duration: 5000,
      });
    }

    if (activeTool === TOOL_IDS.GOOGLE_SUITE && session) {
      if (googleSuiteAuthLoading) {
        toast.info("Checking Google Workspace permissions...", {
          duration: 2000,
        });
        return;
      }

      const recentMessages = messages
        .slice(-6)
        .map((message) => extractTextFromMessage(message.content))
        .filter((messageText) => messageText.trim().length > 0);
      const scopeResolution = resolveGoogleWorkspaceScopesForRequest(input, recentMessages);
      const missingRequiredScopes = getMissingGoogleScopes(
        scopeResolution.requiredScopes,
        googleSuiteStatus?.grantedScopes ?? []
      );

      if (!hasWorkspaceAccess) {
        setPendingGoogleWorkspaceQuery(input);
        toast.error("Google Workspace access needed", {
          description:
            "Open Settings > Google Workspace to enable at least one Google app before sending Workspace requests.",
          action: {
            label: "Open settings",
            onClick: () => router.push("/settings/google-workspace"),
          },
          duration: 6000,
        });
        return;
      }

      if (missingRequiredScopes.length > 0) {
        setPendingGoogleWorkspaceQuery(input);
        toast.error("Google Workspace access needed", {
          description:
            scopeResolution.source === "context"
              ? "This follow-up needs broader Google Workspace access than your current selection. Open Settings > Google Workspace to add it."
              : "Open Settings > Google Workspace to choose the Gmail, Drive, Calendar, Docs, Sheets, or Slides access this request needs.",
          action: {
            label: "Open settings",
            onClick: () => router.push("/settings/google-workspace"),
          },
          duration: 6000,
        });
        return;
      }
    }

    dispatchUi({ type: "set-sending", isSending: true });

    try {
      const attachmentsToSend = uploadedAttachments;

      if (selectedFiles.length > 0 && attachmentsToSend.length !== selectedFiles.length) {
        toast.info(TOAST_INFO_MESSAGES.UPLOAD_IN_PROGRESS, {
          description: "Please wait for attachments to finish uploading before sending.",
        });
        dispatchUi({ type: "set-sending", isSending: false });
        return;
      }

      const finalDeepResearchEnabled = deepResearchEnabled && (!usageData || usageData.remaining > 0);
      onSend(
        input,
        attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
        activeTool,
        !!session && memoryEnabled,
        finalDeepResearchEnabled,
        searchDepth
      );
    } catch (error) {
      console.error("Error sending message:", error);
      dispatchUi({ type: "set-sending", isSending: false });
    } finally {
      if (conversationId) {
        clearInput();
        clearAttachments();
        dispatchUi({ type: "set-sending", isSending: false });
      }
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

  function handleToolSelected(toolId: ToolId, selectedDepth?: SearchDepth) {
    if (activeTool === toolId) {
      handleToolDeactivated();
      return;
    }

    activateTool(toolId, selectedDepth);
  }

  function handleToolDeactivated() {
    dispatchUi({ type: "deactivate-tool" });
    removeActiveTool();

    if (activeTool === TOOL_IDS.DEEP_RESEARCH) {
      storeDeepResearchEnabled(false);
    }

    toast.info(TOAST_INFO_MESSAGES.TOOL_DEACTIVATED, {
      duration: 2000,
    });
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
      activeTool,
      memoryEnabled,
      searchDepth,
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
      onToolSelected: handleToolSelected,
      onMemoryToggle: handleMemoryToggle,
      onFilesSelected: handleFilesSelectedWithAuth,
      onStop,
      onAuthRequired,
    },
  };
}
