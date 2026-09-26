import { filterDocumentAttachments, filterImageAttachments } from "@/lib/attachmentUtils";
import type { Attachment } from "@/lib/schemas/chat";
import type { MemoryStatus } from "@/types/chat";

export function resolveContextSources(memoryStatus: MemoryStatus, attachments?: Attachment[]) {
  const isSnippet = memoryStatus.attachmentContextKind === "snippet";
  const imageCount = memoryStatus.hasImages ? memoryStatus.imageCount : 0;
  const documentSources = memoryStatus.documentEvidenceFiles;
  const candidateDocuments = isSnippet
    ? (attachments ?? []).filter((attachment) => attachment.kind === "snippet")
    : filterDocumentAttachments(attachments);
  const sourcedAttachment = (source: {
    id: string; fileUrl: string; fileName?: string; fileType?: string;
    fileSize?: number; kind?: "image" | "document" | "snippet";
  }, kind: "image" | "document" | "snippet"): Attachment | null => {
    if (!source.id || !source.fileName || !source.fileType ||
        typeof source.fileSize !== "number" || source.fileSize < 0 ||
        source.kind !== kind) return null;
    try {
      const url = new URL(source.fileUrl);
      if (url.protocol !== "https:") return null;
    } catch { return null; }
    return {
      id: source.id, fileUrl: source.fileUrl, fileName: source.fileName,
      fileType: source.fileType, fileSize: source.fileSize, kind,
    };
  };
  const uniqueSource = <T extends { id: string; fileUrl: string }>(source: T, all: T[]) =>
    all.filter((item) => item.id === source.id).length === 1 &&
    all.filter((item) => item.fileUrl === source.fileUrl).length === 1;
  const safeDocuments = (documentSources ?? []).flatMap((source) => {
    if (!uniqueSource(source, documentSources ?? [])) return [];
    const currentMatches = candidateDocuments.filter((file) => file.fileUrl === source.fileUrl);
    if (currentMatches.length === 1) return [currentMatches[0]];
    const historical = sourcedAttachment(source, isSnippet ? "snippet" : "document");
    return historical ? [historical] : [];
  });
  const imageAttachments = filterImageAttachments(attachments);
  const historicalImageSources = memoryStatus.historicalImageFiles ?? [];
  const safeHistoricalImages = historicalImageSources.flatMap((source) =>
    uniqueSource(source, historicalImageSources)
      ? [sourcedAttachment(source, "image")].filter((file): file is Attachment => file !== null)
      : []);
  const currentImageCount = Math.max(0, imageCount - historicalImageSources.length);
  const currentSources = memoryStatus.selectedCurrentImageFiles;
  const safeCurrentImages = currentSources
    ? currentSources.flatMap((source) => {
        if (!uniqueSource(source, currentSources)) return [];
        const matches = imageAttachments.filter((file) => file.fileUrl === source.fileUrl);
        return matches.length === 1 ? [matches[0]] : [];
      })
    : (historicalImageSources.length === 0 || memoryStatus.includeCurrentImages) &&
      imageAttachments.length === currentImageCount ? imageAttachments : [];
  const safeImages = [...safeHistoricalImages, ...safeCurrentImages];
  return { safeImages, safeDocuments };
}
