"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Brain, FileText, Eye, Zap, Focus } from "lucide-react";

interface AIThinkingAnimationProps {
  memoryStatus?: {
    hasMemories: boolean;
    hasDocuments: boolean;
    memoryCount: number;
    documentCount: number;
    hasImages: boolean;
    imageCount: number;
    routingDecision?: 'vision-only' | 'documents-only' | 'memory-only' | 'hybrid';
    skippedMemory?: boolean;
  };
}

export function AIThinkingAnimation({ memoryStatus }: AIThinkingAnimationProps) {
  const hasContext = memoryStatus && (memoryStatus.hasMemories || memoryStatus.hasDocuments || memoryStatus.hasImages);
  
  const contextualMessage = useMemo(() => {
    if (!hasContext) {
      return "Processing your request...";
    }
    
    const routing = memoryStatus?.routingDecision;
    
    if (routing === 'vision-only') {
      return `Analyzing image${memoryStatus.imageCount > 1 ? 's' : ''} with focused attention...`;
    }
    
    if (routing === 'hybrid') {
      return `Analyzing image${memoryStatus.imageCount > 1 ? 's' : ''} and ${memoryStatus.documentCount} doc${memoryStatus.documentCount !== 1 ? 's' : ''} together...`;
    }
    
    if (routing === 'documents-only') {
      return `Analyzing ${memoryStatus.documentCount} attached doc${memoryStatus.documentCount !== 1 ? 's' : ''} with focused context...`;
    }
    
    if (routing === 'memory-only') {
      return "Synthesizing response from conversation history...";
    }
    
    const contexts = [];
    if (memoryStatus?.hasDocuments) contexts.push("documents");
    if (memoryStatus?.hasMemories) contexts.push("memories");
    
    return contexts.length > 0 
      ? `Synthesizing response with ${contexts.join(" and ")}...`
      : "Generating response...";
  }, [hasContext, memoryStatus]);

  const getRoutingIcon = () => {
    switch (memoryStatus?.routingDecision) {
      case 'vision-only': return <Eye className="w-3.5 h-3.5 text-cyan-500" />;
      case 'hybrid': return <Zap className="w-3.5 h-3.5 text-purple-500" />;
      case 'documents-only': return <Focus className="w-3.5 h-3.5 text-amber-500" />;
      case 'memory-only': return <Brain className="w-3.5 h-3.5 text-indigo-500" />;
      default: return <Zap className="w-3.5 h-3.5 text-gray-500" />;
    }
  };

  const getRoutingLabel = () => {
    switch (memoryStatus?.routingDecision) {
      case 'vision-only': return 'Vision Focus';
      case 'hybrid': return 'Hybrid Mode';
      case 'documents-only': return 'Document Focus';
      case 'memory-only': return 'Memory Context';
      default: return 'Standard';
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {hasContext && (
        <div className="flex flex-col gap-1 rounded-lg bg-muted/30 p-3 text-xs border border-border/50">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-foreground/70 font-semibold">Context retrieved:</span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-background/60 border border-border/30">
              {getRoutingIcon()}
              <span className="text-[10px] font-medium text-foreground/60">
                {getRoutingLabel()}
              </span>
            </div>
          </div>
          
          <div className="flex flex-col gap-1.5">
            {memoryStatus?.hasImages && memoryStatus?.routingDecision !== 'hybrid' ? (
              <div className="flex items-center gap-2">
                <span className="text-foreground/40 font-mono text-[10px] select-none">└─</span>
                <Eye className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 animate-pulse flex-shrink-0" />
                <span className="font-medium text-cyan-700 dark:text-cyan-300">
                  {memoryStatus.imageCount > 0
                    ? `${memoryStatus.imageCount} ${memoryStatus.imageCount === 1 ? 'image' : 'images'}`
                    : 'Vision analysis'}
                </span>
                <span className="text-foreground/40 text-[10px] ml-auto">
                  (text context skipped)
                </span>
              </div>
            ) : memoryStatus?.routingDecision === 'hybrid' ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-foreground/40 font-mono text-[10px] select-none">├─</span>
                  <Eye className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 animate-pulse flex-shrink-0" />
                  <span className="font-medium text-cyan-700 dark:text-cyan-300">
                    {memoryStatus.imageCount > 0
                      ? `${memoryStatus.imageCount} ${memoryStatus.imageCount === 1 ? 'image' : 'images'}`
                      : 'Vision analysis'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-foreground/40 font-mono text-[10px] select-none">└─</span>
                  <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-pulse flex-shrink-0" />
                  <span className="font-medium text-amber-700 dark:text-amber-300">
                    {memoryStatus.documentCount > 0
                      ? `${memoryStatus.documentCount} attached ${memoryStatus.documentCount === 1 ? 'doc' : 'docs'}`
                      : 'Document context'}
                  </span>
                </div>
              </>
            ) : (
              <>
                {memoryStatus?.hasDocuments && (
                  <div className="flex items-center gap-2">
                    <span className="text-foreground/40 font-mono text-[10px] select-none">
                      {!memoryStatus?.hasMemories ? '└─' : '├─'}
                    </span>
                    <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-pulse flex-shrink-0" />
                    <span className="font-medium text-amber-700 dark:text-amber-300">
                      {memoryStatus.documentCount > 0
                        ? `${memoryStatus.documentCount} attached ${memoryStatus.documentCount === 1 ? 'doc' : 'docs'}`
                        : 'Searching documents'}
                    </span>
                  </div>
                )}
                
                {memoryStatus?.hasMemories && (
                  <div className="flex items-center gap-2">
                    <span className="text-foreground/40 font-mono text-[10px] select-none">└─</span>
                    <Brain className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 animate-pulse flex-shrink-0" />
                    <span className="font-medium text-indigo-700 dark:text-indigo-300">
                      {memoryStatus.memoryCount > 0 
                        ? `${memoryStatus.memoryCount} ${memoryStatus.memoryCount === 1 ? 'memory' : 'memories'} (past chats)`
                        : 'Searching memories'}
                    </span>
                  </div>
                )}

                {memoryStatus?.skippedMemory && !memoryStatus?.hasMemories && (
                  <div className="flex items-center gap-2">
                    <span className="text-foreground/40 font-mono text-[10px] select-none">└─</span>
                    <Brain className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    <span className="font-medium text-gray-500 dark:text-gray-400 line-through">
                      Memories
                    </span>
                    <span className="text-foreground/40 text-[10px] ml-auto">
                      (skipped - focused mode)
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
