import { FormEvent, ClipboardEvent, RefObject } from "react";
import { Textarea } from "@/components/ui/textarea";
import { ActionButtons } from "./actionButtons";
import { FileUploadButton } from "./fileUploadButton";
import { ToolsMenu } from "./toolsMenu";
import { FilePreview } from "./filePreview";
import { DropZone } from "./dropZone";
import type { ToolId } from "@/lib/tools/config";
import type { SearchDepth } from "@/lib/schemas/webSearchTools";
import type { DragState } from "@/hooks/useDragAndDrop";

interface FormState {
  input: string;
  selectedFiles: File[];
  isLoading: boolean;
  isUploading: boolean;
  isSending: boolean;
  disabled: boolean;
  activeTool: ToolId | null;
  memoryEnabled: boolean;
  searchDepth: SearchDepth;
}

interface FormHandlers {
  onSubmit: (e: FormEvent) => void;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onInput: (e: React.FormEvent<HTMLTextAreaElement>) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onRemoveFile: (index: number) => void;
  onToolSelected: (toolId: ToolId, selectedDepth?: SearchDepth) => void;
  onMemoryToggle: (enabled: boolean) => void;
  onFilesSelected: (files: File[]) => void;
  onStop?: () => void;
  onAuthRequired?: () => void;
}

interface ChatInputFormProps {
  state: FormState;
  handlers: FormHandlers;
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
  textareaRef,
  dropZoneRef,
  dragState,
  dragHandlers,
  placeholder,
  maxFilesReached,
  centered = false,
}: ChatInputFormProps) {
  const { input, selectedFiles, isLoading, isUploading, isSending, disabled, activeTool, memoryEnabled, searchDepth } = state;
  const { onSubmit, onInputChange, onKeyDown, onInput, onPaste, onRemoveFile, onToolSelected, onMemoryToggle, onFilesSelected, onStop, onAuthRequired } = handlers;

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
        <div className="relative isolate overflow-hidden rounded-2xl border border-black/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,248,250,0.94))] shadow-[0_4px_12px_rgba(15,23,42,0.04)] transition-all duration-200 ease-out focus-within:border-black/[0.1] focus-within:ring-1 focus-within:ring-black/[0.06] dark:border-white/[0.1] dark:bg-[linear-gradient(180deg,rgba(24,24,28,0.96),rgba(12,12,15,0.96))] dark:shadow-[0_8px_24px_rgba(0,0,0,0.18)] dark:focus-within:border-white/[0.14] dark:focus-within:ring-white/[0.1] group">
          <FilePreview files={selectedFiles} onRemove={onRemoveFile} disabled={isSending} />
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

          <div className={`absolute ${buttonPosition} flex items-center gap-1`}>
            <div className="hidden md:block">
              <FileUploadButton
                disabled={disabled || isLoading || isUploading || isSending || maxFilesReached}
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
                searchDepth={searchDepth}
                onFilesSelected={onFilesSelected}
                fileCount={selectedFiles.length}
                onAuthRequired={onAuthRequired}
              />
            </div>
            <ActionButtons
              isLoading={isLoading}
              isUploading={isUploading}
              isSending={isSending}
              disabled={disabled}
              hasInput={!!input.trim()}
              onStop={onStop}
              size={buttonSize}
            />
          </div>
        </div>
      </DropZone>
    </form>
  );
}
