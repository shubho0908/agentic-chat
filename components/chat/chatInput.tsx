import { useState, useRef, KeyboardEvent, FormEvent } from "react";
import { Send, StopCircle, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/themeToggle";
import { FileUploadButton } from "./fileUploadButton";
import { FilePreview } from "./filePreview";
import { useUploadThing } from "@/utils/uploadthing";
import { getApiKeyHash } from "@/lib/storage";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  const [input, setInput] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { startUpload } = useUploadThing("ragDocumentUploader", {
    onClientUploadComplete: (res) => {
      toast.success("Files uploaded", {
        description: `${res.length} file(s) uploaded successfully`,
      });
      setIsUploading(false);
      setSelectedFiles([]);
    },
    onUploadError: (error: Error) => {
      toast.error("Upload failed", {
        description: error.message,
      });
      setIsUploading(false);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage();
  }

  async function sendMessage() {
    if (!input.trim() || isLoading || disabled || isUploading) return;

    if (selectedFiles.length > 0) {
      setIsUploading(true);
      try {
        const userHash = await getApiKeyHash();
        if (!userHash) {
          toast.error("Authentication required", {
            description: "Please configure your API key first",
          });
          setIsUploading(false);
          return;
        }

        await startUpload(selectedFiles, { userHash });
      } catch (error) {
        toast.error("Upload failed", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
        setIsUploading(false);
        return;
      }
    }

    onSend(input);
    setInput("");
    resetTextareaHeight();
  }

  function handleFilesSelected(files: File[]) {
    setSelectedFiles(prev => [...prev, ...files]);
  }

  function handleRemoveFile(index: number) {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleInput() {
    adjustTextareaHeight();
  }

  function adjustTextareaHeight() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }

  function resetTextareaHeight() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
  }

  if (centered) {
    return (
      <>
        <div className="fixed top-4 right-4 z-50 animate-in fade-in duration-500">
          <ThemeToggle />
        </div>

        <div className="flex min-h-screen flex-col items-center justify-center p-6">
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
                className={cn(
                  "min-h-[64px] max-h-[200px] resize-none border-0 bg-transparent px-6 py-5 pr-16 text-base focus-visible:ring-0 focus-visible:ring-offset-0",
                  "placeholder:text-muted-foreground/50"
                )}
              />

              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                <FileUploadButton
                  disabled={disabled || isLoading || isUploading}
                  onFilesSelected={handleFilesSelected}
                />
                {isLoading && onStop ? (
                  <Button
                    type="button"
                    onClick={onStop}
                    size="icon"
                    variant="ghost"
                    className="size-11 rounded-2xl hover:bg-destructive/10"
                  >
                    <StopCircle className="size-5 text-destructive" />
                    <span className="sr-only">Stop generating</span>
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={!input.trim() || isLoading || disabled || isUploading}
                    size="icon"
                    className="size-11 rounded-full"
                  >
                    {isUploading ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <Send className="size-5" />
                    )}
                    <span className="sr-only">Send message</span>
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-4" />
                Press <kbd className="rounded-md bg-muted px-2 py-1 text-xs font-semibold">Enter</kbd> to send
              </span>
            </div>
          </form>
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
              className={cn(
                "min-h-[56px] max-h-[200px] resize-none border-0 bg-transparent px-4 py-4 pr-14 focus-visible:ring-0 focus-visible:ring-offset-0",
                "placeholder:text-muted-foreground/60"
              )}
            />

            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              <FileUploadButton
                disabled={disabled || isLoading || isUploading}
                onFilesSelected={handleFilesSelected}
              />
              {isLoading && onStop ? (
                <Button
                  type="button"
                  onClick={onStop}
                  size="icon"
                  variant="ghost"
                  className="size-10 rounded-xl"
                >
                  <StopCircle className="size-5 text-destructive" />
                  <span className="sr-only">Stop generating</span>
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!input.trim() || isLoading || disabled || isUploading}
                  size="icon"
                  className="size-10 rounded-xl"
                >
                  {isUploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  <span className="sr-only">Send message</span>
                </Button>
              )}
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
