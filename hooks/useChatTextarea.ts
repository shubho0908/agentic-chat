import { useState, useRef, useLayoutEffect, useCallback, KeyboardEvent } from "react";

const MAX_TEXTAREA_HEIGHT = 200;

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
    if (!textarea) return;

    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    // Default (uncapped) overflow-y:hidden comes from the textarea's class.
    textarea.style.overflowY =
      textarea.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "";
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
