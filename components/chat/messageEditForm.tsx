import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
} from "react";
import { Textarea } from "@/components/ui/textarea";
import { resizeTextarea } from "@/hooks/useChatTextarea";
import { VALIDATION_LIMITS } from "@/constants/validation";

const MAX_EDITOR_HEIGHT_PX = 320;

interface MessageEditFormProps {
  editText: string;
  sizingText?: string;
  onEditTextChange: (text: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

function getMaxEditorHeight(): number {
  if (typeof window === "undefined") return 200;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  return Math.max(48, Math.min(MAX_EDITOR_HEIGHT_PX, Math.floor(viewportHeight * 0.5)));
}

function adjustEditorHeight(textarea: HTMLTextAreaElement | null): void {
  if (textarea) resizeTextarea(textarea, getMaxEditorHeight());
}

export function MessageEditForm({
  editText,
  sizingText = editText,
  onEditTextChange,
  onSubmit,
  onCancel,
}: MessageEditFormProps) {
  const didFocusRef = useRef(false);
  const sizingContent = editText.length > sizingText.length ? editText : sizingText;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    adjustEditorHeight(textarea);
    if (!didFocusRef.current) {
      didFocusRef.current = true;
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }, [editText]);

  useEffect(() => {
    const resizeTarget = window.visualViewport ?? window;
    const handleResize = () => adjustEditorHeight(textareaRef.current);
    resizeTarget.addEventListener("resize", handleResize);
    return () => resizeTarget.removeEventListener("resize", handleResize);
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (editText.trim()) onSubmit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="grid min-w-48 w-fit max-w-full sm:min-w-64">
      <span
        aria-hidden="true"
        className="invisible pointer-events-none col-start-1 row-start-1 h-[1lh] max-w-full select-none overflow-hidden whitespace-pre-wrap break-words text-[15px] leading-relaxed"
      >
        {sizingContent || "\u00a0"}
      </span>
      <Textarea
        ref={textareaRef}
        value={editText}
        onChange={(event) => onEditTextChange(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Edit message"
        name="message"
        autoComplete="off"
        maxLength={VALIDATION_LIMITS.CHAT_MESSAGE_MAX_LENGTH}
        rows={1}
        cols={1}
        spellCheck
        className="col-start-1 row-start-1 block min-h-[24px] max-h-[min(320px,50dvh)] w-full min-w-0 resize-none overflow-x-hidden overflow-y-hidden whitespace-pre-wrap break-words rounded-none border-0 bg-transparent p-0 text-[15px] leading-relaxed text-foreground shadow-none outline-none transition-none focus-visible:border-0 focus-visible:ring-0"
      />
    </div>
  );
}
