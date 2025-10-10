"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { OPENAI_MODELS } from "@/constants/openai-models";
import { Brain, FileText, Eye } from "lucide-react";

const reasoningThinkingMessages = [
  "Analyzing the problem...",
  "Reasoning through solutions...",
  "Evaluating approaches...",
  "Synthesizing insights...",
  "Formulating response...",
];

interface AIThinkingAnimationProps {
  model?: string;
  memoryStatus?: {
    hasMemories: boolean;
    hasDocuments: boolean;
    memoryCount: number;
    documentCount: number;
    processingDocuments?: boolean;
    hasImages: boolean;
    imageCount: number;
  };
}

export function AIThinkingAnimation({ model, memoryStatus }: AIThinkingAnimationProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  const modelCategory = model
    ? OPENAI_MODELS.find((m) => m.id === model)?.category
    : "chat";

  const isReasoningModel = modelCategory === "reasoning";
  
  const hasContext = memoryStatus && (memoryStatus.hasMemories || memoryStatus.hasDocuments || memoryStatus.hasImages);
  
  const contextualMessage = useMemo(() => {
    if (!hasContext) {
      return isReasoningModel ? reasoningThinkingMessages[messageIndex] : "Processing your request...";
    }
    
    if (memoryStatus?.hasImages) {
      return `Analyzing image${memoryStatus.imageCount > 1 ? 's' : ''} and generating response...`;
    }
    
    const contexts = [];
    if (memoryStatus?.hasMemories) contexts.push("memories");
    if (memoryStatus?.hasDocuments) contexts.push("documents");
    
    return `Synthesizing response with ${contexts.join(", ")}...`;
  }, [hasContext, memoryStatus, isReasoningModel, messageIndex]);

  useEffect(() => {
    if (!isReasoningModel || hasContext) return;

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % reasoningThinkingMessages.length);
    }, 1500);

    return () => clearInterval(interval);
  }, [isReasoningModel, hasContext]);

  const contextItems = useMemo(() => {
    const items = [];
    if (memoryStatus?.hasImages) {
      items.push('images');
    } else {
      if (memoryStatus?.hasMemories) items.push('memories');
      if (memoryStatus?.hasDocuments) items.push('documents');
    }
    return items;
  }, [memoryStatus]);

  return (
    <div className="flex flex-col gap-2.5">
      {hasContext && (
        <div className="flex flex-col gap-1 rounded-lg bg-muted/30 p-3 text-xs border border-border/50">
          <div className="flex items-center gap-2 text-foreground/70 font-semibold mb-1">
            <span>Context retrieved:</span>
          </div>
          
          <div className="flex flex-col gap-1.5">
            {memoryStatus?.hasImages ? (
              <div className="flex items-center gap-2">
                <span className="text-foreground/40 font-mono text-[10px] select-none">└─</span>
                <Eye className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 animate-pulse flex-shrink-0" />
                <span className="font-medium text-cyan-700 dark:text-cyan-300">
                  {memoryStatus.imageCount > 0
                    ? `Analyzing ${memoryStatus.imageCount} ${memoryStatus.imageCount === 1 ? 'image' : 'images'}`
                    : 'Vision analysis'}
                </span>
              </div>
            ) : (
              <>
                {memoryStatus?.hasMemories && (
                  <div className="flex items-center gap-2">
                    <span className="text-foreground/40 font-mono text-[10px] select-none">
                      {contextItems.indexOf('memories') === contextItems.length - 1 ? '└─' : '├─'}
                    </span>
                    <Brain className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 animate-pulse flex-shrink-0" />
                    <span className="font-medium text-indigo-700 dark:text-indigo-300">
                      {memoryStatus.memoryCount > 0 
                        ? `${memoryStatus.memoryCount} relevant ${memoryStatus.memoryCount === 1 ? 'memory' : 'memories'}`
                        : 'Searching memories'}
                    </span>
                  </div>
                )}
                
                {memoryStatus?.hasDocuments && (
                  <div className="flex items-center gap-2">
                    <span className="text-foreground/40 font-mono text-[10px] select-none">
                      {contextItems.indexOf('documents') === contextItems.length - 1 ? '└─' : '├─'}
                    </span>
                    <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-pulse flex-shrink-0" />
                    <span className="font-medium text-amber-700 dark:text-amber-300">
                      {memoryStatus.processingDocuments 
                        ? 'Processing documents'
                        : memoryStatus.documentCount > 0
                          ? `${memoryStatus.documentCount} relevant ${memoryStatus.documentCount === 1 ? 'document' : 'documents'}`
                          : 'Using documents'}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      
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
          {contextualMessage}
        </motion.span>
      </div>
    </div>
  );
}
