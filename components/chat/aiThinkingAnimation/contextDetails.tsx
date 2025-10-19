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
import { UrlContentContext } from "./urlContentContext";
import type { ContextDetailsProps } from "./types";

export function ContextDetails({ memoryStatus }: ContextDetailsProps) {
  const isWebSearch = isToolActive(memoryStatus, TOOL_IDS.WEB_SEARCH);
  const isYouTube = isToolActive(memoryStatus, TOOL_IDS.YOUTUBE);
  const isDeepResearch = isToolActive(memoryStatus, TOOL_IDS.DEEP_RESEARCH);
  const isGoogleSuite = isToolActive(memoryStatus, TOOL_IDS.GOOGLE_SUITE);

  if (isDeepResearch) {
    const progress = memoryStatus.toolProgress;
    const status = progress?.details?.status || progress?.status;
    
    const docPrepStatuses = ['preparing_documents', 'waiting_documents', 'documents_ready', 'analyzing_documents'];
    const isPreparingDocs = status && docPrepStatuses.includes(status);
    const isProcessingImages = status === 'processing_images';
    
    const researchHasStarted = status && !['preparing_documents', 'waiting_documents', 'documents_ready', 'processing_images', 'analyzing_documents'].includes(status);
    
    if (researchHasStarted) {
      return <DeepResearchContext memoryStatus={memoryStatus} />;
    }
    if (isPreparingDocs && memoryStatus.hasDocuments) {
      return <DefaultRAGContext memoryStatus={memoryStatus} />;
    }
    if (isProcessingImages && memoryStatus.hasImages) {
      return <VisionOnlyContext imageCount={memoryStatus.imageCount} />;
    }
    if (memoryStatus.hasDocuments || memoryStatus.hasImages) {
      return <DefaultRAGContext memoryStatus={memoryStatus} />;
    }
  }

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

    if (isYouTube) {
      return <YouTubeContext memoryStatus={memoryStatus} />;
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
