export const ArtifactType = {
  HTML: 'html',
  REACT: 'react',
  SVG: 'svg',
  MERMAID: 'mermaid',
  CODE: 'code',
  MARKDOWN: 'markdown',
} as const;

export type ArtifactTypeValue = (typeof ArtifactType)[keyof typeof ArtifactType];

export const ArtifactEventType = {
  START: 'artifact_start',
  CHUNK: 'artifact_chunk',
  END: 'artifact_end',
} as const;

export type ArtifactEventTypeValue = (typeof ArtifactEventType)[keyof typeof ArtifactEventType];

/** Artifact types that support live preview (not just code display) */
export const PREVIEWABLE_ARTIFACT_TYPES: ReadonlySet<ArtifactTypeValue> = new Set([
  ArtifactType.HTML,
  ArtifactType.REACT,
  ArtifactType.SVG,
  ArtifactType.MERMAID,
  ArtifactType.MARKDOWN,
]);

export interface ArtifactVersion {
  content: string;
  createdAt: number;
}

export interface ArtifactMetadata {
  id: string;
  type: ArtifactTypeValue;
  title: string;
  language?: string;
  content: string;
  createdAt: number;
}

export interface Artifact {
  id: string;
  messageId: string;
  type: ArtifactTypeValue;
  title: string;
  content: string;
  language?: string;
  versions: ArtifactVersion[];
  currentVersion: number;
  isStreaming: boolean;
}

export interface ArtifactEvent {
  type: ArtifactEventTypeValue;
  artifactId: string;
  artifactType?: ArtifactTypeValue;
  title?: string;
  language?: string;
  content?: string;
  messageId?: string;
}
