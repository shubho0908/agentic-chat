import { motion } from "framer-motion";

interface ThinkingMessageProps {
  message: string;
}

export function ThinkingMessage({ message }: ThinkingMessageProps) {
  return (
    <div className="flex items-center gap-2.5">
      <motion.div
        className="w-1.5 h-1.5 rounded-full bg-primary/60"
        animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        className="bg-[linear-gradient(110deg,#404040,35%,#fff,50%,#404040,75%,#404040)] dark:bg-[linear-gradient(110deg,#525252,35%,#fff,50%,#525252,75%,#525252)] bg-[length:200%_100%] bg-clip-text text-sm font-medium text-transparent"
        initial={{ backgroundPosition: "200% 0" }}
        animate={{ backgroundPosition: "-200% 0" }}
        transition={{
          repeat: Infinity,
          duration: 2,
          ease: "linear",
        }}
      >
        {message}
      </motion.span>
    </div>
  );
}
