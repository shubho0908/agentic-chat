import { RoutingDecision } from "@/types/chat";
import { TOOL_IDS } from "@/lib/tools/config";
import { isToolActive } from "./utils";
import { WebSearchContext } from "./webSearchContext";
import { GoogleSuiteContext } from "./googleSuiteContext";
import { VisionOnlyContext } from "./visionOnlyContext";
import { ToolOnlyDefaultContext } from "./toolOnlyDefaultContext";
import { HybridContext } from "./hybridContext";
import { DefaultRAGContext } from "./defaultRAGContext";
import { UrlContentContext } from "./urlContentContext";
import type { ContextDetailsProps } from "./types";

export function ContextDetails({ memoryStatus }: ContextDetailsProps) {
  const isWebSearch = isToolActive(memoryStatus, TOOL_IDS.WEB_SEARCH);
  const isGoogleSuite = isToolActive(memoryStatus, TOOL_IDS.GOOGLE_SUITE);

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

    if (isGoogleSuite) {
      return <GoogleSuiteContext memoryStatus={memoryStatus} />;
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
