import {
  ArtifactEventType,
  ArtifactType,
  type Artifact,
  type ArtifactEvent,
  type ArtifactMetadata,
  type ArtifactTypeValue,
} from "@/types/artifact";

const VALID_ARTIFACT_TYPES = new Set<string>(Object.values(ArtifactType));

export function isArtifactType(value: unknown): value is ArtifactTypeValue {
  return typeof value === "string" && VALID_ARTIFACT_TYPES.has(value);
}

function normalizeTitle(value: unknown): string {
  if (typeof value !== "string") return "Untitled";
  const trimmed = value.trim();
  return trimmed || "Untitled";
}

function normalizeLanguage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function normalizeArtifactMetadata(value: unknown): ArtifactMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
  if (!isArtifactType(candidate.type)) return null;
  if (typeof candidate.content !== "string") return null;

  return {
    id: candidate.id,
    type: candidate.type,
    title: normalizeTitle(candidate.title),
    language: normalizeLanguage(candidate.language),
    content: candidate.content,
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : Date.now(),
  };
}

export function artifactMetadataToArtifact(
  messageId: string,
  metadata: ArtifactMetadata
): Artifact {
  return {
    id: metadata.id,
    messageId,
    type: metadata.type,
    title: metadata.title,
    language: metadata.language,
    content: metadata.content,
    versions: [{ content: metadata.content, createdAt: metadata.createdAt }],
    currentVersion: 0,
    isStreaming: false,
  };
}

export function createArtifactMetadataCollector() {
  const artifacts = new Map<string, ArtifactMetadata>();

  function getArtifacts(): ArtifactMetadata[] {
    return Array.from(artifacts.values());
  }

  function ensureArtifact(event: ArtifactEvent): ArtifactMetadata | null {
    if (!event.artifactId) return null;

    const existing = artifacts.get(event.artifactId);
    if (existing) return existing;

    const fallback: ArtifactMetadata = {
      id: event.artifactId,
      type: isArtifactType(event.artifactType) ? event.artifactType : ArtifactType.CODE,
      title: normalizeTitle(event.title),
      language: normalizeLanguage(event.language),
      content: "",
      createdAt: Date.now(),
    };
    artifacts.set(event.artifactId, fallback);
    return fallback;
  }

  return {
    push(event: ArtifactEvent): ArtifactMetadata[] {
      switch (event.type) {
        case ArtifactEventType.START: {
          if (!event.artifactId) break;
          artifacts.set(event.artifactId, {
            id: event.artifactId,
            type: isArtifactType(event.artifactType) ? event.artifactType : ArtifactType.CODE,
            title: normalizeTitle(event.title),
            language: normalizeLanguage(event.language),
            content: "",
            createdAt: Date.now(),
          });
          break;
        }
        case ArtifactEventType.CHUNK: {
          const artifact = ensureArtifact(event);
          if (!artifact) break;
          artifacts.set(event.artifactId, {
            ...artifact,
            content: artifact.content + (event.content ?? ""),
          });
          break;
        }
        case ArtifactEventType.END:
          ensureArtifact(event);
          break;
      }

      return getArtifacts();
    },
    getArtifacts,
    hasArtifacts(): boolean {
      return artifacts.size > 0;
    },
  };
}
