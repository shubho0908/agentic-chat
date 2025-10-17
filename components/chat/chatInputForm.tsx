import { FormEvent, ClipboardEvent, RefObject } from "react";
import { Textarea } from "@/components/ui/textarea";
import { ActionButtons } from "./actionButtons";
import { FileUploadButton } from "./fileUploadButton";
import { ToolsMenu } from "./toolsMenu";
import { FilePreview } from "./filePreview";
import { DropZone } from "./dropZone";
import type { ToolId } from "@/lib/tools/config";
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
}

interface FormHandlers {
  onSubmit: (e: FormEvent) => void;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onInput: (e: React.FormEvent<HTMLTextAreaElement>) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onRemoveFile: (index: number) => void;
  onToolSelected: (toolId: ToolId) => void;
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
  const { input, selectedFiles, isLoading, isUploading, isSending, disabled, activeTool, memoryEnabled } = state;
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
        <div className="relative rounded-2xl bg-muted/50 border border-border/50 shadow-sm transition-all focus-within:border-border focus-within:shadow-md overflow-hidden">
          <FilePreview files={selectedFiles} onRemove={onRemoveFile} disabled={isSending} />
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            onInput={onInput}
            onPaste={onPaste}
            placeholder={placeholder}
            disabled={disabled || isLoading || isUploading}
            rows={1}
            className={textareaClassName}
          />

          <div className={`absolute ${buttonPosition} flex items-center gap-1`}>
            <div className="hidden md:block">
              <FileUploadButton
                disabled={disabled || isLoading || isUploading || maxFilesReached}
                onFilesSelected={onFilesSelected}
                fileCount={selectedFiles.length}
              />
            </div>
            <div className="mr-1">
              <ToolsMenu
                disabled={disabled || isLoading || isUploading}
                onToolSelected={onToolSelected}
                activeTool={activeTool}
                memoryEnabled={memoryEnabled}
                onMemoryToggle={onMemoryToggle}
                onFilesSelected={onFilesSelected}
                fileCount={selectedFiles.length}
                onAuthRequired={onAuthRequired}
              />
            </div>
            <ActionButtons
              isLoading={isLoading}
              isUploading={isUploading}
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
