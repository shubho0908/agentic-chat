import { FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { ActionButtons } from "./actionButtons";
import { FileUploadButton } from "./fileUploadButton";
import { FilePreview } from "./filePreview";
import { useChatFileUpload } from "@/hooks/useChatFileUpload";
import { useChatTextarea } from "@/hooks/useChatTextarea";
import { MAX_FILE_ATTACHMENTS } from "@/constants/upload";

interface ChatInputProps {
  onSend: (message: string) => void;
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
  const {
    selectedFiles,
    isUploading,
    uploadFiles,
    handleFilesSelected,
    handleRemoveFile,
  } = useChatFileUpload();

  const {
    input,
    setInput,
    textareaRef,
    handleKeyDown,
    handleInput,
    clearInput,
  } = useChatTextarea(sendMessage);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage();
  }

  async function sendMessage() {
    if (!input.trim() || isLoading || disabled || isUploading) return;

    if (selectedFiles.length > 0) {
      const success = await uploadFiles();
      if (!success) return;
    }

    onSend(input);
    clearInput();
  }

  if (centered) {
    return (
      <>
        <div className="flex min-h-screen flex-col items-center justify-center p-6 pt-24 md:pt-6">
          <div className="w-full max-w-2xl space-y-8">
            <div className="text-center space-y-4">
              <h1 className="text-5xl font-bold tracking-tight text-foreground">
                Agentic chat
              </h1>

              <p className="text-lg text-muted-foreground">
                Your intelligent assistant powered by advanced AI
              </p>
            </div>

            <form onSubmit={handleSubmit} className="relative">
              <div className="relative rounded-3xl bg-muted/50 shadow-lg transition-all focus-within:shadow-xl overflow-hidden">
                <FilePreview files={selectedFiles} onRemove={handleRemoveFile} />
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onInput={handleInput}
                  placeholder={placeholder}
                  disabled={disabled || isLoading || isUploading}
                  rows={1}
                  className="min-h-[64px] max-h-[200px] resize-none border-0 bg-transparent px-6 py-5 pr-16 text-base focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50"
                />

                <div className="absolute bottom-3 right-3 flex items-center gap-2">
                  <FileUploadButton
                    disabled={disabled || isLoading || isUploading || selectedFiles.length >= MAX_FILE_ATTACHMENTS}
                    onFilesSelected={handleFilesSelected}
                    currentFileCount={selectedFiles.length}
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
          <div className="relative rounded-2xl bg-muted/50 shadow-sm transition-all focus-within:bg-muted focus-within:shadow-md overflow-hidden">
            <FilePreview files={selectedFiles} onRemove={handleRemoveFile} />
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder={placeholder}
              disabled={disabled || isLoading || isUploading}
              rows={1}
              className="min-h-[56px] max-h-[200px] resize-none border-0 bg-transparent px-4 py-4 pr-14 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
            />

            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              <FileUploadButton
                disabled={disabled || isLoading || isUploading || selectedFiles.length >= MAX_FILE_ATTACHMENTS}
                onFilesSelected={handleFilesSelected}
                currentFileCount={selectedFiles.length}
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
