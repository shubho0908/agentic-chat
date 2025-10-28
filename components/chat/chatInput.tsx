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
import type { MessageSendHandler } from "@/types/chat";
import { useSession } from "@/lib/auth-client";
import { TOAST_ERROR_MESSAGES } from "@/constants/errors";
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
}

export function ChatInput({
  onSend,
  isLoading,
  onStop,
  placeholder = "Ask me anything...",
  disabled = false,
  centered = false,
  onAuthRequired,
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
      toast.info('Deep Research deactivated', {
        description: 'You have reached your monthly usage limit.',
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

  async function sendMessage() {
    if (!input.trim() || isLoading || disabled || isUploading || isSending) return;

    if (!session && selectedFiles.length > 0) {
      toast.error(TOAST_ERROR_MESSAGES.AUTH.REQUIRED, {
        description: TOAST_ERROR_MESSAGES.AUTH.REQUIRED_DESCRIPTION,
      });
      setIsSending(false);
      return;
    }

    if (deepResearchEnabled && usageData && usageData.remaining === 0) {
      setDeepResearchEnabled(false);
      toast.error('Deep Research limit reached', {
        description: 'You have used all your deep research requests for this month. Your message will be sent with standard processing.',
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
      toast.error('Unsupported image format', {
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

  function handleToolSelected(toolId: ToolId) {
    if (!session) {
      onAuthRequired?.();
      toast.error(TOAST_ERROR_MESSAGES.AUTH.REQUIRED, {
        description: 'Please sign in to use tools',
        duration: 3000,
      });
      return;
    }

    if (activeTool === toolId) {
      if (toolId === TOOL_IDS.WEB_SEARCH) {
        return;
      }
      handleToolDeactivated();
      return;
    }

    if (toolId === TOOL_IDS.DEEP_RESEARCH && usageData && usageData.remaining === 0) {
      toast.error('Deep Research unavailable', {
        description: `You have used all ${usageData.limit} deep research requests for this month. Resets on ${new Date(usageData.resetDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`,
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

    const toolName = toolId === TOOL_IDS.WEB_SEARCH ? 'Web Search' : toolId.replace('_', ' ');
    toast.success('Tool activated', {
      description: `${toolName} is now enabled for your next query`,
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

    toast.info('Tool deactivated', {
      duration: 2000,
    });
  }

  function handleMemoryToggle(enabled: boolean) {
    if (enabled && !session) {
      onAuthRequired?.();
      toast.error(TOAST_ERROR_MESSAGES.AUTH.REQUIRED, {
        description: 'Please sign in to use memory features',
        duration: 3000,
      });
      return;
    }
    
    setMemoryEnabled(enabled);
    storeMemoryEnabled(enabled);
    toast.success(enabled ? 'Memory enabled' : 'Memory disabled', {
      duration: 2500,
    });
  }

  function handleSearchDepthChange(depth: SearchDepth) {
    setSearchDepth(depth);
    storeSearchDepth(depth);
    toast.success(depth === 'advanced' ? 'Advanced search enabled' : 'Basic search enabled', {
      description: depth === 'advanced' 
        ? 'Enhanced search with deeper analysis'
        : 'Quick search with faster results',
      duration: 2500,
    });
  }

  const formState = {
    input,
    selectedFiles,
    isLoading,
    isUploading,
    isSending,
    disabled,
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
    onSearchDepthChange: handleSearchDepthChange,
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
          placeholder={placeholder}
          maxFilesReached={maxFilesReached}
          centered={false}
        />

        <ChatInputFooter centered={false} />
      </div>
    </div>
  );
}
