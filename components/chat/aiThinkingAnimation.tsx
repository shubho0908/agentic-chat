"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

const thinkingMessages = [
  "Processing your request...",
  "Analyzing the best response...",
  "Gathering insights...",
  "Crafting the perfect answer...",
  "Almost there...",
];

export function AIThinkingAnimation() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % thinkingMessages.length);
    }, 1500);

    return () => clearInterval(interval);
  }, []);

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
