import { FormEvent, ClipboardEvent, useState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Textarea } from "@/components/ui/textarea";
import { ActionButtons } from "./actionButtons";
import { FileUploadButton } from "./fileUploadButton";
import { ToolsMenu } from "./toolsMenu";
import { ActiveToolBadge } from "./activeToolBadge";
import { FilePreview } from "./filePreview";
import { DropZone } from "./dropZone";
import { useChatFileUpload } from "@/hooks/useChatFileUpload";
import { useChatTextarea } from "@/hooks/useChatTextarea";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { MAX_IMAGE_ATTACHMENTS, MAX_DOCUMENT_ATTACHMENTS, SUPPORTED_IMAGE_EXTENSIONS_DISPLAY } from "@/constants/upload";
import { extractImagesFromClipboard } from "@/lib/file-validation";
import type { ToolId } from "@/lib/tools/config";
import { isValidToolId } from "@/lib/tools/config";

import type { Attachment } from "@/lib/schemas/chat";

const ACTIVE_TOOL_STORAGE_KEY = 'agentic-chat-active-tool';

interface ChatInputProps {
  onSend: (message: string, attachments?: Attachment[], activeTool?: string | null) => void;
  isLoading: boolean;
  onStop?: () => void;
  placeholder?: string;
  disabled?: boolean;
  centered?: boolean;
}

export function ChatInput({
  onSend,
  isLoading,
  onStop,
  placeholder = "Ask me anything...",
  disabled = false,
  centered = false,
}: ChatInputProps) {
  const [isSending, setIsSending] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(ACTIVE_TOOL_STORAGE_KEY);
    if (stored && isValidToolId(stored)) {
      setActiveTool(stored as ToolId);
    }
  }, []);

  useEffect(() => {
    if (activeTool) {
      localStorage.setItem(ACTIVE_TOOL_STORAGE_KEY, activeTool);
    } else {
      localStorage.removeItem(ACTIVE_TOOL_STORAGE_KEY);
    }
  }, [activeTool]);

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

  const imageCount = selectedFiles.filter(f => f.type.startsWith('image/')).length;
  const documentCount = selectedFiles.filter(f => !f.type.startsWith('image/')).length;
  const maxFilesReached = imageCount >= MAX_IMAGE_ATTACHMENTS && documentCount >= MAX_DOCUMENT_ATTACHMENTS;

  const { dragState, dropZoneRef, handlers } = useDragAndDrop({
    onFilesDropped: handleFilesSelected,
    disabled: disabled || isLoading || isUploading || maxFilesReached,
    maxFiles: MAX_IMAGE_ATTACHMENTS + MAX_DOCUMENT_ATTACHMENTS,
    currentFileCount: selectedFiles.length,
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage();
  }

  async function sendMessage() {
    if (!input.trim() || isLoading || disabled || isUploading || isSending) return;

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

      await onSend(input, attachmentsToSend.length > 0 ? attachmentsToSend : undefined, activeTool);
      clearInput();
      clearAttachments();
    } finally {
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
      handleFilesSelected(files);
    }
  }

  function handleToolSelected(toolId: ToolId) {
    if (activeTool === toolId) {
      handleToolDeactivated();
      return;
    }
    
    setActiveTool(toolId);
    toast.success('Tool activated', {
      description: `${toolId.replace('_', ' ')} is now enabled for your next query`,
      duration: 2500,
    });
  }

  function handleToolDeactivated() {
    setActiveTool(null);
    toast.info('Tool deactivated', {
      duration: 2000,
    });
  }

  if (centered) {
    return (
      <>
        <div className="flex min-h-screen flex-col items-center justify-center p-6 pt-24 md:pt-6">
          <div className="w-full max-w-2xl space-y-6 md:space-y-8">
            <div className="text-center space-y-2 md:space-y-4">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground">
                Agentic chat
              </h1>

              <p className="text-base md:text-lg text-muted-foreground">
                Your intelligent assistant powered by advanced AI
              </p>
            </div>

            <form onSubmit={handleSubmit} className="relative">
              <DropZone
                dragState={dragState}
                disabled={disabled || isLoading || isUploading || maxFilesReached}
                dropZoneRef={dropZoneRef}
                handlers={handlers}
              >
                <div className="relative rounded-2xl bg-muted/50 border border-border/50 shadow-sm transition-all focus-within:border-border focus-within:shadow-md overflow-hidden">
                  <AnimatePresence>
                    {activeTool && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden border-b border-border/50"
                      >
                        <div className="px-4 pt-3 pb-2">
                          <ActiveToolBadge 
                            toolId={activeTool}
                            onRemove={handleToolDeactivated}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <FilePreview files={selectedFiles} onRemove={handleRemoveFile} disabled={isSending} />
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onInput={handleInput}
                    onPaste={handlePaste}
                    placeholder={placeholder}
                    disabled={disabled || isLoading || isUploading}
                    rows={1}
                    className="min-h-[96px] max-h-[280px] resize-none border-0 bg-transparent px-6 py-4 pr-28 text-base leading-relaxed align-top focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50"
                  />

                  <div className="absolute bottom-3 right-3 flex items-center gap-2">
                    <FileUploadButton
                      disabled={disabled || isLoading || isUploading || maxFilesReached}
                      onFilesSelected={handleFilesSelected}
                    />
                    <ToolsMenu
                      disabled={disabled || isLoading || isUploading}
                      onToolSelected={handleToolSelected}
                      activeTool={activeTool}
                    />
                    <ActionButtons
                      isLoading={isLoading}
                      isUploading={isUploading}
                      disabled={disabled}
                      hasInput={!!input.trim()}
                      onStop={onStop}
                      size="large"
                    />
                  </div>


                </div>
              </DropZone>
            </form>

            <div className="mt-4 flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-4" />
                Press <kbd className="rounded-md bg-muted px-2 py-1 text-xs font-semibold">Enter</kbd> to send
              </span>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="sticky bottom-0 bg-background/80 backdrop-blur-sm supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-3xl p-4">
        <form onSubmit={handleSubmit} className="relative">
          <DropZone
            dragState={dragState}
            disabled={disabled || isLoading || isUploading || maxFilesReached}
            dropZoneRef={dropZoneRef}
            handlers={handlers}
          >
            <div className="relative rounded-2xl bg-muted/50 border border-border/50 shadow-sm transition-all focus-within:border-border focus-within:shadow-md overflow-hidden">
              <AnimatePresence>
                {activeTool && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden border-b border-border/50"
                  >
                    <div className="px-5 pt-2.5 pb-2">
                      <ActiveToolBadge 
                        toolId={activeTool}
                        onRemove={handleToolDeactivated}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <FilePreview files={selectedFiles} onRemove={handleRemoveFile} disabled={isSending} />
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onInput={handleInput}
                onPaste={handlePaste}
                placeholder={placeholder}
                disabled={disabled || isLoading || isUploading}
                rows={1}
                className="min-h-[88px] max-h-[280px] resize-none border-0 bg-transparent px-5 py-4 pr-24 text-base leading-relaxed align-top focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
              />

              <div className="absolute bottom-2 right-2 flex items-center gap-1">
                <FileUploadButton
                  disabled={disabled || isLoading || isUploading || maxFilesReached}
                  onFilesSelected={handleFilesSelected}
                />
                <ToolsMenu
                  disabled={disabled || isLoading || isUploading}
                  onToolSelected={handleToolSelected}
                  activeTool={activeTool}
                />
                <ActionButtons
                  isLoading={isLoading}
                  isUploading={isUploading}
                  disabled={disabled}
                  hasInput={!!input.trim()}
                  onStop={onStop}
                />
              </div>


            </div>
          </DropZone>
        </form>

        <div className="mt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Sparkles className="size-3" />
            AI-powered responses
          </span>
          <span>•</span>
          <span>Press <kbd className="rounded bg-muted px-1.5 py-0.5">Enter</kbd> to send</span>
        </div>
      </div>
    </div>
  );
}
