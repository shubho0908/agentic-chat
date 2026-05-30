import { RoutingDecision } from "@/types/chat";
import { WebSearchContext } from "./webSearchContext";
import { VisionOnlyContext } from "./visionOnlyContext";
import { ToolOnlyDefaultContext } from "./toolOnlyDefaultContext";
import { HybridContext } from "./hybridContext";
import { DefaultRAGContext } from "./defaultRAGContext";
import { UrlContentContext } from "./urlContentContext";
import type { ContextDetailsProps } from "./types";

export function ContextDetails({ memoryStatus }: ContextDetailsProps) {
  const isWebSearch = memoryStatus.activeToolName === 'web_search';

  if (memoryStatus.routingDecision === RoutingDecision.UrlContent) {
    return <UrlContentContext memoryStatus={memoryStatus} />;
  }

  if (
    memoryStatus.hasImages &&
    memoryStatus.routingDecision !== RoutingDecision.Hybrid
  ) {
    return <VisionOnlyContext imageCount={memoryStatus.imageCount} />;
  }

  if (memoryStatus.routingDecision === RoutingDecision.ToolOnly) {
    if (isWebSearch) {
      return <WebSearchContext memoryStatus={memoryStatus} />;
    }

    return <ToolOnlyDefaultContext memoryStatus={memoryStatus} />;
  }

  if (memoryStatus.routingDecision === RoutingDecision.Hybrid) {
    if (memoryStatus.hasUrls && memoryStatus.hasImages) {
      return (
        <>
          <UrlContentContext memoryStatus={memoryStatus} />
          <VisionOnlyContext imageCount={memoryStatus.imageCount} />
        </>
      );
    }
    
    return (
      <HybridContext
        imageCount={memoryStatus.imageCount}
        documentCount={memoryStatus.documentCount}
      />
    );
  }

  return <DefaultRAGContext memoryStatus={memoryStatus} />;
}
