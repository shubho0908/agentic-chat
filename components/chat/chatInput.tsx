import { ClipboardEvent, useState, useEffect } from "react";
import { toast } from "sonner";
import { ChatInputHeader } from "./chatInputHeader";
import { ChatInputFooter } from "./chatInputFooter";
import { ChatInputForm } from "./chatInputForm";
import { useChatFileUpload } from "@/hooks/useChatFileUpload";
import { useChatTextarea } from "@/hooks/useChatTextarea";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { useDeepResearchUsage } from "@/hooks/useDeepResearchUsage";
import { MAX_FILE_ATTACHMENTS, SUPPORTED_IMAGE_EXTENSIONS_DISPLAY } from "@/constants/upload";
import { extractImagesFromClipboard } from "@/lib/file-validation";
import type { ToolId } from "@/lib/tools/config";
import type { SearchDepth } from "@/lib/schemas/web-search.tools";
import { isValidToolId, TOOL_IDS } from "@/lib/tools/config";
import type { MessageSendHandler, TokenUsage } from "@/types/chat";
import { useSession } from "@/lib/auth-client";
import { TOAST_ERROR_MESSAGES } from "@/constants/errors";
import { TOAST_SUCCESS_MESSAGES, TOAST_INFO_MESSAGES } from "@/constants/toasts";
import {
  getActiveTool as getStoredActiveTool,
  setActiveTool as storeActiveTool,
  removeActiveTool,
  getMemoryEnabled as getStoredMemoryEnabled,
  setMemoryEnabled as storeMemoryEnabled,
  getDeepResearchEnabled as getStoredDeepResearchEnabled,
  setDeepResearchEnabled as storeDeepResearchEnabled,
  getSearchDepth as getStoredSearchDepth,
  setSearchDepth as storeSearchDepth
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
}: ChatInputProps) {
  const [isSending, setIsSending] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [memoryEnabled, setMemoryEnabled] = useState<boolean>(false);
  const [deepResearchEnabled, setDeepResearchEnabled] = useState<boolean>(false);
  const [searchDepth, setSearchDepth] = useState<SearchDepth>('basic');

  const { data: session, isPending } = useSession();
  const { data: usageData } = useDeepResearchUsage();

  useEffect(() => {
    if (!isPending) {
      if (session) {
        const stored = getStoredActiveTool();
        setActiveTool(stored && isValidToolId(stored) ? (stored as ToolId) : null);
        setMemoryEnabled(getStoredMemoryEnabled());
        setDeepResearchEnabled(getStoredDeepResearchEnabled());
        setSearchDepth(getStoredSearchDepth());
      } else {
        setActiveTool(null);
        setMemoryEnabled(false);
        setDeepResearchEnabled(false);
      }
    }
  }, [session, isPending]);

  useEffect(() => {
    if (usageData?.remaining === 0 && (deepResearchEnabled || activeTool === TOOL_IDS.DEEP_RESEARCH)) {
      setDeepResearchEnabled(false);
      if (activeTool === TOOL_IDS.DEEP_RESEARCH) {
        setActiveTool(null);
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
    uploadFiles,
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
      setIsSending(false);
      return;
    }

    if (deepResearchEnabled && usageData && usageData.remaining === 0) {
      setDeepResearchEnabled(false);
      toast.error(TOAST_ERROR_MESSAGES.DEEP_RESEARCH_UI.LIMIT_REACHED, {
        description: TOAST_ERROR_MESSAGES.DEEP_RESEARCH_UI.LIMIT_REACHED_DESCRIPTION,
        duration: 5000,
      });
    }

    setIsSending(true);

    try {
      let attachmentsToSend = uploadedAttachments;

      if (selectedFiles.length > 0) {
        attachmentsToSend = await uploadFiles();
        if (attachmentsToSend.length === 0 && selectedFiles.length > 0) {
          setIsSending(false);
          return;
        }
      }

      const finalDeepResearchEnabled = deepResearchEnabled && (!usageData || usageData.remaining > 0);
      onSend(input, attachmentsToSend.length > 0 ? attachmentsToSend : undefined, activeTool, memoryEnabled, finalDeepResearchEnabled, searchDepth);
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      clearInput();
      clearAttachments();
      setIsSending(false);
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

    setActiveTool(toolId);
    storeActiveTool(toolId);

    if (toolId === TOOL_IDS.DEEP_RESEARCH) {
      setDeepResearchEnabled(true);
      storeDeepResearchEnabled(true);
    } else {
      setDeepResearchEnabled(false);
      storeDeepResearchEnabled(false);
    }

    // If selectedDepth is provided (for web search), update the depth
    if (toolId === TOOL_IDS.WEB_SEARCH && selectedDepth) {
      setSearchDepth(selectedDepth);
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
    setActiveTool(null);
    removeActiveTool();

    if (activeTool === TOOL_IDS.DEEP_RESEARCH) {
      setDeepResearchEnabled(false);
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

    setMemoryEnabled(enabled);
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
    <div className="sticky bottom-0 bg-background/80 backdrop-blur-sm supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-3xl p-4">
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
