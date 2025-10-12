"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Brain, FileText, Eye, Zap, Focus, Wrench, Search } from "lucide-react";
import { MemoryStatus, RoutingDecision, ToolProgressStatus } from "@/hooks/chat/types";
import { TOOL_IDS } from "@/lib/tools/config";

interface AIThinkingAnimationProps {
  memoryStatus?: MemoryStatus
}

export function AIThinkingAnimation({ memoryStatus }: AIThinkingAnimationProps) {
  const isWebSearch = memoryStatus?.routingDecision === RoutingDecision.ToolOnly && 
                       memoryStatus?.activeToolName === TOOL_IDS.WEB_SEARCH;
  
  const hasContext = memoryStatus && (
    memoryStatus.hasMemories || 
    memoryStatus.hasDocuments || 
    memoryStatus.hasImages ||
    memoryStatus.routingDecision === RoutingDecision.ToolOnly
  );
  
  const contextualMessage = useMemo(() => {
    if (!hasContext) {
      return "Processing your request...";
    }
    
    const routing = memoryStatus?.routingDecision;
    
    if (routing === RoutingDecision.VisionOnly) {
      return `Analyzing image${memoryStatus.imageCount > 1 ? 's' : ''} with focused attention...`;
    }
    
    if (routing === RoutingDecision.Hybrid) {
      return `Analyzing image${memoryStatus.imageCount > 1 ? 's' : ''} and ${memoryStatus.documentCount} doc${memoryStatus.documentCount !== 1 ? 's' : ''} together...`;
    }
    
    if (routing === RoutingDecision.DocumentsOnly) {
      return `Analyzing ${memoryStatus.documentCount} attached doc${memoryStatus.documentCount !== 1 ? 's' : ''} with focused context...`;
    }
    
    if (routing === RoutingDecision.MemoryOnly) {
      return "Synthesizing response from conversation history...";
    }
    
    if (routing === RoutingDecision.ToolOnly) {
      if (memoryStatus?.toolProgress?.message) {
        return memoryStatus.toolProgress.message;
      }
      const toolName = memoryStatus?.activeToolName?.replace('_', ' ') || 'tool';
      return `Using ${toolName} to process your request...`;
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
      case RoutingDecision.VisionOnly: return <Eye className="w-3.5 h-3.5 text-cyan-500" />;
      case RoutingDecision.Hybrid: return <Zap className="w-3.5 h-3.5 text-purple-500" />;
      case RoutingDecision.DocumentsOnly: return <Focus className="w-3.5 h-3.5 text-amber-500" />;
      case RoutingDecision.MemoryOnly: return <Brain className="w-3.5 h-3.5 text-indigo-500" />;
      case RoutingDecision.ToolOnly: return <Wrench className="w-3.5 h-3.5 text-blue-500" />;
      default: return <Zap className="w-3.5 h-3.5 text-gray-500" />;
    }
  };

  const getRoutingLabel = () => {
    switch (memoryStatus?.routingDecision) {
      case RoutingDecision.VisionOnly: return 'Vision Focus';
      case RoutingDecision.Hybrid: return 'Hybrid Mode';
      case RoutingDecision.DocumentsOnly: return 'Document Focus';
      case RoutingDecision.MemoryOnly: return 'Memory Context';
      case RoutingDecision.ToolOnly: return 'Tool Active';
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
            {memoryStatus?.hasImages && memoryStatus?.routingDecision !== RoutingDecision.Hybrid ? (
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
            ) : memoryStatus?.routingDecision === RoutingDecision.ToolOnly ? (
              <div className="flex flex-col gap-1.5">
                {isWebSearch ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-foreground/40 font-mono text-[10px] select-none">
                        {memoryStatus.toolProgress?.details?.sources && memoryStatus.toolProgress.details.sources.length > 0 ? '├─' : '└─'}
                      </span>
                      <Search className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-pulse flex-shrink-0" />
                      <span className="font-medium text-blue-700 dark:text-blue-300">
                        {memoryStatus.toolProgress?.status === ToolProgressStatus.Searching && 'Searching web'}
                        {memoryStatus.toolProgress?.status === ToolProgressStatus.Found && 
                          `Found ${memoryStatus.toolProgress.details?.resultsCount || 0} sources`}
                        {memoryStatus.toolProgress?.status === ToolProgressStatus.ProcessingSources && 
                          `Processing ${memoryStatus.toolProgress.details?.processedCount || 0}/${memoryStatus.toolProgress.details?.resultsCount || 0}`}
                        {memoryStatus.toolProgress?.status === ToolProgressStatus.Completed && 
                          `${memoryStatus.toolProgress.details?.resultsCount || 0} sources analyzed`}
                        {!memoryStatus.toolProgress?.status && 'Web search'}
                      </span>
                      <span className="text-foreground/40 text-[10px] ml-auto">
                        (memory skipped)
                      </span>
                    </div>
                    {memoryStatus.toolProgress?.details?.sources && memoryStatus.toolProgress.details.sources.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-foreground/40 font-mono text-[10px] select-none">└─</span>
                        <div className="flex flex-wrap gap-1 items-center">
                          {memoryStatus.toolProgress.details.sources.slice(0, 5).map((source, idx) => (
                            <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 font-mono">
                              {source.domain}
                            </span>
                          ))}
                          {memoryStatus.toolProgress.details.sources.length > 5 && (
                            <span className="text-[10px] text-foreground/50">
                              +{memoryStatus.toolProgress.details.sources.length - 5} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-foreground/40 font-mono text-[10px] select-none">└─</span>
                    <Wrench className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-pulse flex-shrink-0" />
                    <span className="font-medium text-blue-700 dark:text-blue-300">
                      {memoryStatus.activeToolName 
                        ? `${memoryStatus.activeToolName.replace('_', ' ')} tool`
                        : 'Tool active'}
                    </span>
                    <span className="text-foreground/40 text-[10px] ml-auto">
                      (memory skipped)
                    </span>
                  </div>
                )}
              </div>
            ) : memoryStatus?.routingDecision === RoutingDecision.Hybrid ? (
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
