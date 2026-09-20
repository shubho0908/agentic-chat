import {
  useMemo,
  type FormEvent,
  type ClipboardEvent,
  type RefObject,
} from "react";
import { Textarea } from "@/components/ui/textarea";
import { ActionButtons } from "./actionButtons";
import { ToolsMenu } from "./toolsMenu";
import { ModelPicker } from "./modelPicker";
import { FilePreview } from "./filePreview";
import { TextSnippetPreview, type TextSnippet } from "./textSnippetPreview";
import { DropZone } from "./dropZone";
import type { ReasoningEffortLevel } from "@/constants/openai-models";
import type { ReasoningEffortMap } from "@/lib/storage";
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
  effortByModel: ReasoningEffortMap;
  selectedModel: string;
}

interface FormHandlers {
  onSubmit: (e: FormEvent) => void;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onInput: (e: React.FormEvent<HTMLTextAreaElement>) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onRemoveFile: (file: File) => void;
  onRemoveSnippet: (id: string) => void;
  onReasoningEffortChange: (modelId: string, effort: ReasoningEffortLevel) => void;
  onModelSelect: (modelId: string) => void;
  onFilesSelected: (files: File[]) => void;
  onStop?: () => void;
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
    effortByModel,
    selectedModel,
  } = state;
  const {
    onSubmit,
    onInputChange,
    onKeyDown,
    onInput,
    onPaste,
    onRemoveFile,
    onRemoveSnippet,
    onReasoningEffortChange,
    onModelSelect,
    onFilesSelected,
    onStop,
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
    ? "min-h-[60px] max-h-[280px] flex-1 resize-none border-0 bg-transparent shadow-none px-2 py-[17px] text-base leading-relaxed align-top focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground"
    : "min-h-[40px] max-h-[280px] flex-1 resize-none border-0 bg-transparent shadow-none px-2 py-[7px] text-base leading-relaxed align-top focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground";

  const buttonSize = centered ? "large" : "default";

  // When nothing renders above the input row, use symmetric vertical padding
  // (same total as the attachment state) so the row's controls sit on the
  // container's exact vertical centerline without changing its height.
  const hasTopContent =
    visibleFiles.length > 0 || textSnippets.length > 0 || showCounter;

  return (
    <form onSubmit={onSubmit} className="relative">
      <DropZone
        dragState={dragState}
        disabled={disabled || isLoading || isUploading || maxFilesReached}
        dropZoneRef={dropZoneRef}
        handlers={dragHandlers}
      >
        <div className="relative isolate overflow-hidden rounded-2xl border border-black/8 bg-[rgb(252_252_253)] shadow-[0_4px_12px_rgba(15,23,42,0.04)] transition-all duration-200 ease-out focus-within:border-black/10 focus-within:ring-1 focus-within:ring-black/6 dark:border-white/10 dark:bg-[rgb(18_18_22)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.18)] dark:focus-within:border-white/[0.14] dark:focus-within:ring-white/10 group">
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
          {showCounter && (
            <div
              className={`px-5 pb-1 text-right text-xs ${isOverLimit ? "text-destructive" : "text-muted-foreground"}`}
            >
              {input.length.toLocaleString()} / {maxLength.toLocaleString()}
            </div>
          )}

          <div
            className={`flex items-center gap-1 ${
              centered
                ? `px-3 ${hasTopContent ? "pb-3 pt-1" : "py-2"}`
                : `px-2.5 ${hasTopContent ? "pb-2.5 pt-1" : "py-[7px]"}`
            }`}
          >
            <div className="shrink-0">
              <ToolsMenu
                disabled={disabled || isLoading || isUploading || isSending}
                onFilesSelected={onFilesSelected}
                fileCount={selectedFiles.length}
              />
            </div>
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
            <div className="flex shrink-0 items-center gap-1.5">
              <ModelPicker
                selectedModel={selectedModel}
                effortByModel={effortByModel}
                onModelSelect={onModelSelect}
                onEffortChange={onReasoningEffortChange}
                disabled={disabled || isLoading || isUploading || isSending}
              />
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
        </div>
      </DropZone>
    </form>
  );
}
