"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { OPENAI_MODELS } from "@/constants/openai-models";

const normalThinkingMessages = ["Processing your request..."];

const reasoningThinkingMessages = [
  "Analyzing the problem...",
  "Reasoning through solutions...",
  "Evaluating approaches...",
  "Synthesizing insights...",
  "Formulating response...",
];

interface AIThinkingAnimationProps {
  model?: string;
}

export function AIThinkingAnimation({ model }: AIThinkingAnimationProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  const modelCategory = model
    ? OPENAI_MODELS.find((m) => m.id === model)?.category
    : "chat";

  const isReasoningModel = modelCategory === "reasoning";
  const thinkingMessages = isReasoningModel
    ? reasoningThinkingMessages
    : normalThinkingMessages;

  useEffect(() => {
    if (!isReasoningModel) return;

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % thinkingMessages.length);
    }, 1500);

    return () => clearInterval(interval);
  }, [isReasoningModel, thinkingMessages.length]);

  return (
    <motion.div
      className="bg-[linear-gradient(110deg,#404040,35%,#fff,50%,#404040,75%,#404040)] dark:bg-[linear-gradient(110deg,#525252,35%,#fff,50%,#525252,75%,#525252)] bg-[length:200%_100%] bg-clip-text text-base font-medium text-transparent"
      initial={{ backgroundPosition: "200% 0" }}
      animate={{ backgroundPosition: "-200% 0" }}
      transition={{
        repeat: Infinity,
        duration: 2,
        ease: "linear",
      }}
    >
      {thinkingMessages[messageIndex]}
    </motion.div>
  );
}
