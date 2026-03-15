import { ClipboardEvent, useEffect, useReducer } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ChatInputHeader } from "./chatInputHeader";
import { ChatInputFooter } from "./chatInputFooter";
import { ChatInputForm } from "./chatInputForm";
import { useChatFileUpload } from "@/hooks/useChatFileUpload";
import { useChatTextarea } from "@/hooks/useChatTextarea";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { useDeepResearchUsage } from "@/hooks/useDeepResearchUsage";
import { useGoogleSuiteAuth } from "@/hooks/useGoogleSuiteAuth";
import { MAX_FILE_ATTACHMENTS, SUPPORTED_IMAGE_EXTENSIONS_DISPLAY } from "@/constants/upload";
import { extractImagesFromClipboard } from "@/lib/file-validation";
import type { ToolId } from "@/lib/tools/config";
import type { SearchDepth } from "@/lib/schemas/web-search.tools";
import { isValidToolId, TOOL_IDS } from "@/lib/tools/config";
import type { MessageSendHandler, TokenUsage } from "@/types/chat";
import { useSession } from "@/lib/auth-client";
import { TOAST_ERROR_MESSAGES } from "@/constants/errors";
import { TOAST_SUCCESS_MESSAGES, TOAST_INFO_MESSAGES } from "@/constants/toasts";
import { getMissingGoogleScopes, inferGoogleWorkspaceScopes } from "@/lib/tools/google-suite/scopes";
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

interface ChatInputProps {
  onSend: MessageSendHandler;
  isLoading: boolean;
  onStop?: () => void;
  placeholder?: string;
  disabled?: boolean;
  centered?: boolean;
  onAuthRequired?: () => void;
  tokenUsage?: TokenUsage;
  conversationId?: string | null;
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

export function ChatInput({
  onSend,
  isLoading,
  onStop,
  placeholder = "Ask me anything...",
  disabled = false,
  centered = false,
  onAuthRequired,
  tokenUsage,
  conversationId,
}: ChatInputProps) {
  const [uiState, dispatchUi] = useReducer(chatInputUiReducer, INITIAL_CHAT_INPUT_UI_STATE);
  const { isSending, activeTool, memoryEnabled, deepResearchEnabled, searchDepth } = uiState;

  const { data: session, isPending } = useSession();
  const { data: usageData } = useDeepResearchUsage({ enabled: !!session });
  const { status: googleSuiteStatus, isLoading: googleSuiteAuthLoading } = useGoogleSuiteAuth({ enabled: !!session });
  const router = useRouter();

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

  const handleFilesSelectedWithAuth = (files: File[]) => {
    if (!session) {
      toast.error(TOAST_ERROR_MESSAGES.AUTH.REQUIRED, {
        description: 'Please sign in to attach files',
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

  const isContextBlocked = tokenUsage && tokenUsage.percentage >= 95 && !isLoading;

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

      const requiredScopes = inferGoogleWorkspaceScopes(input);
      const missingRequiredScopes = getMissingGoogleScopes(
        requiredScopes,
        googleSuiteStatus?.grantedScopes ?? []
      );

      if (missingRequiredScopes.length > 0) {
        setPendingGoogleWorkspaceQuery(input);
        toast.error("Google Workspace access needed", {
          description:
            "Open Settings > Google Workspace to choose the Gmail, Drive, Calendar, Docs, Sheets, or Slides access this request needs.",
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
      onSend(input, attachmentsToSend.length > 0 ? attachmentsToSend : undefined, activeTool, memoryEnabled, finalDeepResearchEnabled, searchDepth);
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
          description: 'Please sign in to attach files',
        });
        return;
      }
      handleFilesSelected(files);
    }
  }

  function handleToolSelected(toolId: ToolId, selectedDepth?: SearchDepth) {
    if (!session) {
      onAuthRequired?.();
      toast.error(TOAST_ERROR_MESSAGES.AUTH.REQUIRED, {
        description: TOAST_ERROR_MESSAGES.TOOLS.AUTH_REQUIRED_DESCRIPTION,
        duration: 3000,
      });
      return;
    }

    if (activeTool === toolId) {
      handleToolDeactivated();
      return;
    }

    if (toolId === TOOL_IDS.DEEP_RESEARCH && usageData && usageData.remaining === 0) {
      const resetDate = new Date(usageData.resetDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      toast.error(TOAST_ERROR_MESSAGES.DEEP_RESEARCH_UI.UNAVAILABLE, {
        description: TOAST_ERROR_MESSAGES.DEEP_RESEARCH_UI.MONTHLY_LIMIT_DESCRIPTION(usageData.limit, resetDate),
        duration: 5000,
      });
      return;
    }

    dispatchUi({ type: "activate-tool", toolId, searchDepth: selectedDepth });
    storeActiveTool(toolId);

    if (toolId === TOOL_IDS.DEEP_RESEARCH) {
      storeDeepResearchEnabled(true);
    } else {
      storeDeepResearchEnabled(false);
    }

    // If selectedDepth is provided (for web search), update the depth
    if (toolId === TOOL_IDS.WEB_SEARCH && selectedDepth) {
      storeSearchDepth(selectedDepth);
    }

    const toolName = toolId === TOOL_IDS.WEB_SEARCH ? 'Web Search' : toolId.replace('_', ' ');
    const currentDepth = selectedDepth || searchDepth;
    const searchModeText = toolId === TOOL_IDS.WEB_SEARCH
      ? ` (${currentDepth === 'advanced' ? 'Advanced' : 'Basic'})`
      : '';
    toast.success(TOAST_ERROR_MESSAGES.TOOLS.ACTIVATED, {
      description: `${toolName}${searchModeText} is now enabled for your next query`,
      duration: 2500,
    });
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



  const formState = {
    input,
    selectedFiles,
    isLoading,
    isUploading,
    isSending,
    disabled: disabled || !!isContextBlocked,
    activeTool,
    memoryEnabled,
    searchDepth,
  };

  const formHandlers = {
    onSubmit: (e: React.FormEvent) => {
      e.preventDefault();
      sendMessage();
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
  };

  if (centered) {
    return (
      <>
        <div className="flex min-h-screen flex-col items-center justify-center p-6 pt-24 md:pt-6">
          <div className="w-full max-w-2xl space-y-6 md:space-y-8">
            <ChatInputHeader />

            <ChatInputForm
              state={formState}
              handlers={formHandlers}
              textareaRef={textareaRef}
              dropZoneRef={dropZoneRef}
              dragState={dragState}
              dragHandlers={handlers}
              placeholder={placeholder}
              maxFilesReached={maxFilesReached}
              centered={true}
            />

            <ChatInputFooter centered={true} />
          </div>
        </div>
      </>
    );
  }

  const inputPlaceholder = isContextBlocked
    ? "Context limit reached. Start a new chat to continue..."
    : placeholder;

  return (
    <div className="sticky bottom-0 pb-4 md:pb-6 bg-gradient-to-t from-background via-background/80 to-transparent pt-6 pointer-events-none">
      <div className="mx-auto max-w-3xl px-4 pointer-events-auto">
        <ChatInputForm
          state={formState}
          handlers={formHandlers}
          textareaRef={textareaRef}
          dropZoneRef={dropZoneRef}
          dragState={dragState}
          dragHandlers={handlers}
          placeholder={inputPlaceholder}
          maxFilesReached={maxFilesReached}
          centered={false}
        />

        <ChatInputFooter centered={false} />
      </div>
    </div>
  );
}
