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
  uploadingFileIds: ReadonlySet<string>;
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
    uploadingFileIds,
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

  // max-h must equal MAX_TEXTAREA_HEIGHT in useChatTextarea (single source
  // of truth for the grow cap); overflow stays hidden until JS flips it on.
  const textareaClassName = centered
    ? "block min-h-[52px] max-h-[200px] w-full resize-none rounded-none border-0 bg-transparent shadow-none px-0 py-0 text-[15px] leading-6 overflow-y-hidden focus-visible:ring-0 focus-visible:ring-offset-0"
    : "block min-h-[24px] max-h-[200px] w-full resize-none rounded-none border-0 bg-transparent shadow-none px-0 py-0 text-[15px] leading-6 overflow-y-hidden focus-visible:ring-0 focus-visible:ring-offset-0";

  const buttonSize = centered ? "large" : "default";

  return (
    <form onSubmit={onSubmit} className="relative">
      <DropZone
        dragState={dragState}
        disabled={disabled || isLoading || isUploading || maxFilesReached}
        dropZoneRef={dropZoneRef}
        handlers={dragHandlers}
      >
        <div className="relative isolate overflow-hidden rounded-3xl border border-black/[0.07] bg-[rgb(252_252_253)] shadow-[0_2px_6px_rgba(15,23,42,0.04),0_12px_32px_-8px_rgba(15,23,42,0.08)] transition-all duration-200 ease-out focus-within:border-black/[0.12] focus-within:shadow-[0_2px_6px_rgba(15,23,42,0.05),0_16px_40px_-8px_rgba(15,23,42,0.12)] dark:border-white/[0.09] dark:bg-[rgb(24_24_27)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.25),0_16px_40px_-12px_rgba(0,0,0,0.5)] dark:focus-within:border-white/[0.16] group [&_textarea]:[scrollbar-width:thin] [&_textarea]:[scrollbar-color:transparent_transparent] [&_textarea:hover]:[scrollbar-color:rgba(120,120,128,0.35)_transparent]">
          <FilePreview
            files={visibleFiles}
            getFileKey={getFileId}
            getPreviewUrl={getFilePreviewUrl}
            onRemove={onRemoveFile}
            disabled={isSending}
            uploadingFileIds={uploadingFileIds}
            uploadPhase={uploadPhase}
          />
          <TextSnippetPreview
            snippets={textSnippets}
            onRemove={onRemoveSnippet}
            disabled={isSending}
            isUploading={isUploading}
          />

          <div
            className={`relative ${
              centered ? "px-5 pt-4" : "px-4 pt-3.5"
            }`}
          >
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              aria-label={placeholder}
              disabled={disabled || isLoading || isUploading || isSending}
              rows={1}
              className={textareaClassName}
            />
            {input.length === 0 && (
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-0 top-0 overflow-hidden ${
                  centered ? "px-5 pt-4" : "px-4 pt-3.5"
                }`}
              >
                <span className="block w-full truncate text-[15px] leading-6 text-muted-foreground">
                  {placeholder}
                </span>
              </span>
            )}
          </div>

          <div
            className={`flex items-center gap-1.5 ${
              centered ? "px-3 pb-3 pt-2" : "px-2.5 pb-2.5 pt-2"
            }`}
          >
            <div className="shrink-0">
              <ToolsMenu
                disabled={disabled || isLoading || isUploading || isSending}
                onFilesSelected={onFilesSelected}
                fileCount={selectedFiles.length}
              />
            </div>

            <div className="min-w-0 flex-1">
              {showCounter && (
                <p
                  className={`text-right text-[11px] leading-none tabular-nums ${
                    isOverLimit ? "text-destructive" : "text-muted-foreground/70"
                  }`}
                >
                  {input.length.toLocaleString()} / {maxLength.toLocaleString()}
                </p>
              )}
            </div>

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
