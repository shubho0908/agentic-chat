import { RoutingDecision } from "@/types/chat";
import { TOOL_IDS } from "@/lib/tools/config";
import { isToolActive } from "./utils";
import { DeepResearchContext } from "./deepResearchContext";
import { WebSearchContext } from "./webSearchContext";
import { YouTubeContext } from "./youtubeContext";
import { GoogleSuiteContext } from "./googleSuiteContext";
import { VisionOnlyContext } from "./visionOnlyContext";
import { ToolOnlyDefaultContext } from "./toolOnlyDefaultContext";
import { HybridContext } from "./hybridContext";
import { DefaultRAGContext } from "./defaultRAGContext";
import type { ContextDetailsProps } from "./types";

export function ContextDetails({ memoryStatus }: ContextDetailsProps) {
  const isWebSearch = isToolActive(memoryStatus, TOOL_IDS.WEB_SEARCH);
  const isYouTube = isToolActive(memoryStatus, TOOL_IDS.YOUTUBE);
  const isDeepResearch = isToolActive(memoryStatus, TOOL_IDS.DEEP_RESEARCH);
  const isGoogleSuite = isToolActive(memoryStatus, TOOL_IDS.GOOGLE_SUITE);

  if (isDeepResearch) {
    return <DeepResearchContext memoryStatus={memoryStatus} />;
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

    if (isYouTube) {
      return <YouTubeContext memoryStatus={memoryStatus} />;
    }

    if (isGoogleSuite) {
      return <GoogleSuiteContext memoryStatus={memoryStatus} />;
    }

    return <ToolOnlyDefaultContext memoryStatus={memoryStatus} />;
  }

  if (memoryStatus.routingDecision === RoutingDecision.Hybrid) {
    return (
      <HybridContext
        imageCount={memoryStatus.imageCount}
        documentCount={memoryStatus.documentCount}
      />
    );
  }

  return <DefaultRAGContext memoryStatus={memoryStatus} />;
}
