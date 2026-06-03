import {
  useMemo,
  type FormEvent,
  type ClipboardEvent,
  type RefObject,
} from "react";
import { Textarea } from "@/components/ui/textarea";
import { ActionButtons } from "./actionButtons";
import { FileUploadButton } from "./fileUploadButton";
import { ToolsMenu } from "./toolsMenu";
import { FilePreview } from "./filePreview";
import { TextSnippetPreview, type TextSnippet } from "./textSnippetPreview";
import { DropZone } from "./dropZone";
import type { ToolId } from "@/lib/tools/config";
import type { DragState } from "@/hooks/useDragAndDrop";
import type { UploadPhase } from "@/hooks/useChatFileUpload";
import { VALIDATION_LIMITS } from "@/constants/validation";

interface FormState {
  input: string;
  selectedFiles: File[];
  isLoading: boolean;
  isUploading: boolean;
  uploadPhase: UploadPhase;
  getFileId: (file: File) => string;
  getFilePreviewUrl: (file: File) => string | null;
  isSending: boolean;
  disabled: boolean;
  activeTool: ToolId | null;
  memoryEnabled: boolean;
  thinkingEnabled: boolean;
}

interface FormHandlers {
  onSubmit: (e: FormEvent) => void;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onInput: (e: React.FormEvent<HTMLTextAreaElement>) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onRemoveFile: (file: File) => void;
  onRemoveSnippet: (id: string) => void;
  onToolSelected: (toolId: ToolId) => void;
  onMemoryToggle: (enabled: boolean) => void;
  onThinkingToggle?: (enabled: boolean) => void;
  onFilesSelected: (files: File[]) => void;
  onStop?: () => void;
  onAuthRequired?: () => void;
}

interface ChatInputFormProps {
  state: FormState;
  handlers: FormHandlers;
  textSnippets: TextSnippet[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  dropZoneRef: RefObject<HTMLDivElement | null>;
  dragState: DragState;
  dragHandlers: {
    onDragEnter: (e: React.DragEvent<Element>) => void;
    onDragLeave: (e: React.DragEvent<Element>) => void;
    onDragOver: (e: React.DragEvent<Element>) => void;
    onDrop: (e: React.DragEvent<Element>) => void;
  };
  placeholder: string;
  maxFilesReached: boolean;
  centered?: boolean;
}

export function ChatInputForm({
  state,
  handlers,
  textSnippets,
  textareaRef,
  dropZoneRef,
  dragState,
  dragHandlers,
  placeholder,
  maxFilesReached,
  centered = false,
}: ChatInputFormProps) {
  const {
    input,
    selectedFiles,
    isLoading,
    isUploading,
    uploadPhase,
    getFileId,
    getFilePreviewUrl,
    isSending,
    disabled,
    activeTool,
    memoryEnabled,
    thinkingEnabled,
  } = state;
  const {
    onSubmit,
    onInputChange,
    onKeyDown,
    onInput,
    onPaste,
    onRemoveFile,
    onRemoveSnippet,
    onToolSelected,
    onMemoryToggle,
    onThinkingToggle,
    onFilesSelected,
    onStop,
    onAuthRequired,
  } = handlers;

  const visibleFiles = useMemo(() => {
    if (textSnippets.length === 0) {
      return selectedFiles;
    }

    const snippetFileNames = new Set(textSnippets.map((s) => s.fileName));
    return selectedFiles.filter((file) => !snippetFileNames.has(file.name));
  }, [selectedFiles, textSnippets]);

  const maxLength = VALIDATION_LIMITS.CHAT_MESSAGE_MAX_LENGTH;
  const warningThreshold = maxLength * 0.9;
  const showCounter = input.length >= warningThreshold;
  const isOverLimit = input.length >= maxLength;

  const textareaClassName = centered
    ? "min-h-[96px] max-h-[280px] resize-none border-0 bg-transparent px-6 py-4 pr-28 text-base leading-relaxed align-top focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50"
    : "min-h-[88px] max-h-[280px] resize-none border-0 bg-transparent px-5 py-4 pr-24 text-base leading-relaxed align-top focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60";

  const buttonSize = centered ? "large" : "default";
  const buttonPosition = centered ? "bottom-3 right-3" : "bottom-2 right-2";

  return (
    <form onSubmit={onSubmit} className="relative">
      <DropZone
        dragState={dragState}
        disabled={disabled || isLoading || isUploading || maxFilesReached}
        dropZoneRef={dropZoneRef}
        handlers={dragHandlers}
      >
        <div className="relative isolate overflow-hidden rounded-2xl border border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,248,250,0.94))] shadow-[0_4px_12px_rgba(15,23,42,0.04)] transition-all duration-200 ease-out focus-within:border-black/10 focus-within:ring-1 focus-within:ring-black/6 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(24,24,28,0.96),rgba(12,12,15,0.96))] dark:shadow-[0_8px_24px_rgba(0,0,0,0.18)] dark:focus-within:border-white/[0.14] dark:focus-within:ring-white/10 group">
          <FilePreview
            files={visibleFiles}
            getFileKey={getFileId}
            getPreviewUrl={getFilePreviewUrl}
            onRemove={onRemoveFile}
            disabled={isSending}
            isUploading={isUploading}
            uploadPhase={uploadPhase}
          />
          <TextSnippetPreview
            snippets={textSnippets}
            onRemove={onRemoveSnippet}
            disabled={isSending}
            isUploading={isUploading}
          />
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            onInput={onInput}
            onPaste={onPaste}
            placeholder={placeholder}
            disabled={disabled || isLoading || isUploading || isSending}
            rows={1}
            className={textareaClassName}
          />

          {showCounter && (
            <div
              className={`px-5 pb-1 text-xs ${isOverLimit ? "text-destructive" : "text-muted-foreground"}`}
            >
              {input.length.toLocaleString()} / {maxLength.toLocaleString()}
            </div>
          )}

          <div className={`absolute ${buttonPosition} flex items-center gap-1`}>
            <div className="hidden md:block">
              <FileUploadButton
                disabled={
                  disabled ||
                  isLoading ||
                  isUploading ||
                  isSending ||
                  maxFilesReached
                }
                onFilesSelected={onFilesSelected}
                fileCount={selectedFiles.length}
              />
            </div>
            <div className="mr-1">
              <ToolsMenu
                disabled={disabled || isLoading || isUploading || isSending}
                onToolSelected={onToolSelected}
                activeTool={activeTool}
                memoryEnabled={memoryEnabled}
                onMemoryToggle={onMemoryToggle}
                thinkingEnabled={thinkingEnabled}
                onThinkingToggle={onThinkingToggle}
                onFilesSelected={onFilesSelected}
                fileCount={selectedFiles.length}
                onAuthRequired={onAuthRequired}
              />
            </div>
            <ActionButtons
              status={
                isLoading
                  ? "loading"
                  : isUploading
                    ? "uploading"
                    : isSending
                      ? "sending"
                      : "idle"
              }
              disabled={disabled}
              hasInput={!!input.trim() || textSnippets.length > 0}
              onStop={onStop}
              size={buttonSize}
            />
          </div>
        </div>
      </DropZone>
    </form>
  );
}
