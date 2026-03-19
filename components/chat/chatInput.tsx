import { ChatInputHeader } from "./chatInputHeader";
import { ChatInputFooter } from "./chatInputFooter";
import { ChatInputForm } from "./chatInputForm";
import type { MessageSendHandler, TokenUsage } from "@/types/chat";
import type { Message } from "@/lib/schemas/chat";
import { useChatInputController } from "@/hooks/chat/useChatInputController";
import { useSession } from "@/lib/authClient";

interface ChatInputProps {
  onSend: MessageSendHandler;
  isLoading: boolean;
  onStop?: () => void;
  placeholder?: string;
  disabled?: boolean;
  centered?: boolean;
  onAuthRequired?: () => void;
  tokenUsage?: TokenUsage;
  conversationId?: string | null;
  messages?: Message[];
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
  conversationId,
  messages,
}: ChatInputProps) {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.trim().split(/\s+/)[0] ?? null;

  const {
    centered: isCentered,
    placeholder: resolvedPlaceholder,
    maxFilesReached,
    textareaRef,
    dropZoneRef,
    dragState,
    dragHandlers,
    formState,
    formHandlers,
  } = useChatInputController({
    onSend,
    isLoading,
    onStop,
    placeholder,
    disabled,
    centered,
      onAuthRequired,
      tokenUsage,
      conversationId,
      messages,
    });

  if (isCentered) {
    return (
      <>
        <div className="flex min-h-screen flex-col items-center justify-center p-6 pt-24 md:pr-20 md:pt-12 xl:pr-6 xl:pt-6">
          <div className="w-full max-w-2xl space-y-6 md:space-y-8">
            <ChatInputHeader firstName={firstName} />

            <ChatInputForm
              state={formState}
              handlers={formHandlers}
              textareaRef={textareaRef}
              dropZoneRef={dropZoneRef}
              dragState={dragState}
              dragHandlers={dragHandlers}
              placeholder={resolvedPlaceholder}
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
    <div className="sticky bottom-0 pb-4 md:pb-6 bg-gradient-to-t from-background via-background/80 to-transparent pt-6 pointer-events-none">
      <div className="mx-auto max-w-3xl px-4 pointer-events-auto md:pr-20 xl:pr-4">
        <ChatInputForm
          state={formState}
          handlers={formHandlers}
          textareaRef={textareaRef}
          dropZoneRef={dropZoneRef}
          dragState={dragState}
          dragHandlers={dragHandlers}
          placeholder={resolvedPlaceholder}
          maxFilesReached={maxFilesReached}
          centered={false}
        />

        <ChatInputFooter centered={false} />
      </div>
    </div>
  );
}
