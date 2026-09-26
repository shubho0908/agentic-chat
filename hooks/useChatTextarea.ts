import { useState, useRef, useLayoutEffect, useCallback, KeyboardEvent } from "react";

const MAX_TEXTAREA_HEIGHT = 200;

type ResizableTextarea = Pick<HTMLTextAreaElement, "scrollHeight" | "style">;

export function resizeTextarea(textarea: ResizableTextarea, maxHeight: number): void {
  textarea.style.height = "auto";
  textarea.style.overflowY = "hidden";
  const contentHeight = textarea.scrollHeight;
  textarea.style.height = `${Math.min(contentHeight, maxHeight)}px`;
  textarea.style.overflowY = contentHeight > maxHeight ? "auto" : "";
}

export function useChatTextarea(onSend: () => void) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend],
  );

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) resizeTextarea(textarea, MAX_TEXTAREA_HEIGHT);
  }, []);

  // Covers programmatic value changes too, and runs pre-paint so no flicker.
  useLayoutEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  function clearInput() {
    setInput("");
  }

  return {
    input,
    setInput,
    textareaRef,
    handleKeyDown,
    clearInput,
  };
}
