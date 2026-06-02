"use client";

import { Component, memo, useCallback, useMemo, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Code2, Copy, Download, Eye, Maximize2, X } from "lucide-react";
import { useState } from "react";
import { useArtifacts } from "@/contexts/artifact-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { HtmlArtifact } from "./HtmlArtifact";
import { ReactArtifact } from "./ReactArtifact";
import { CodeArtifact } from "./CodeArtifact";
import { SvgArtifact } from "./SvgArtifact";
import { MarkdownArtifact } from "./MarkdownArtifact";
import { MermaidPreview } from "@/components/ai-elements/response/mermaidPreview";
import { ArtifactType, PREVIEWABLE_ARTIFACT_TYPES, type Artifact } from "@/types/artifact";

interface ErrorBoundaryProps { fallback: (error: Error, reset: () => void) => ReactNode; children: ReactNode }
interface ErrorBoundaryState { error: Error | null }

class ArtifactErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ArtifactPanel] Render error:", error, info.componentStack);
  }
  reset = () => { this.setState({ error: null }); };
  render() {
    if (this.state.error) return this.props.fallback(this.state.error, this.reset);
    return this.props.children;
  }
}

function ArtifactError({ error, onRetry, onViewCode }: { error: Error; onRetry: () => void; onViewCode: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="rounded-full bg-destructive/10 p-3">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Failed to render artifact</p>
        <p className="max-w-sm text-xs text-muted-foreground">{error.message}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
        <Button variant="outline" size="sm" onClick={onViewCode}>View Code</Button>
      </div>
    </div>
  );
}

const ViewMode = { PREVIEW: "preview", CODE: "code" } as const;
type ViewMode = (typeof ViewMode)[keyof typeof ViewMode];

const IFRAME_TYPES: Set<string> = new Set([ArtifactType.HTML, ArtifactType.REACT]);

const EXT_MAP: Record<string, string> = {
  [ArtifactType.REACT]: "tsx",
  [ArtifactType.HTML]: "html",
  [ArtifactType.SVG]: "svg",
  [ArtifactType.MARKDOWN]: "md",
  [ArtifactType.MERMAID]: "mmd",
};

const ArtifactRenderer = memo(function ArtifactRenderer({ artifact, viewMode }: { artifact: Artifact; viewMode: ViewMode }) {
  if (!artifact.content && artifact.isStreaming) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-primary" />
          <span className="text-xs text-muted-foreground">Generating artifact…</span>
        </div>
      </div>
    );
  }

  if (!artifact.content) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No content available
      </div>
    );
  }

  const effectiveViewMode = (artifact.isStreaming && IFRAME_TYPES.has(artifact.type))
    ? ViewMode.CODE
    : viewMode;

  if (effectiveViewMode === ViewMode.CODE) {
    return <CodeArtifact content={artifact.content} language={artifact.language ?? artifact.type} />;
  }

  switch (artifact.type) {
    case ArtifactType.HTML:
      return <HtmlArtifact content={artifact.content} />;
    case ArtifactType.REACT:
      return <ReactArtifact content={artifact.content} />;
    case ArtifactType.SVG:
      return <SvgArtifact content={artifact.content} />;
    case ArtifactType.MERMAID:
      return <MermaidPreview source={artifact.content} />;
    case ArtifactType.MARKDOWN:
      return <MarkdownArtifact content={artifact.content} />;
    case ArtifactType.CODE:
      return <CodeArtifact content={artifact.content} language={artifact.language ?? "typescript"} />;
    default:
      return <CodeArtifact content={artifact.content} language="text" />;
  }
});

const VersionNav = memo(function VersionNav({ artifact }: { artifact: Artifact }) {
  const { setVersion } = useArtifacts();
  if (artifact.versions.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        disabled={artifact.currentVersion === 0}
        onClick={() => setVersion(artifact.id, artifact.currentVersion - 1)}
        aria-label="Previous artifact version"
      >
        <ChevronLeft className="size-3" />
      </Button>
      <span>{artifact.currentVersion + 1} / {artifact.versions.length}</span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        disabled={artifact.currentVersion === artifact.versions.length - 1}
        onClick={() => setVersion(artifact.id, artifact.currentVersion + 1)}
        aria-label="Next artifact version"
      >
        <ChevronRight className="size-3" />
      </Button>
    </div>
  );
});

export const ArtifactPanel = memo(function ArtifactPanel() {
  const { activeArtifact, closePanel } = useArtifacts();
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.PREVIEW);
  const [fullscreen, setFullscreen] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!activeArtifact) return;
    try {
      await navigator.clipboard.writeText(activeArtifact.content);
      toast.success("Artifact copied");
    } catch {
      toast.error("Failed to copy artifact");
    }
  }, [activeArtifact]);

  const handleDownload = useCallback(() => {
    if (!activeArtifact) return;
    const ext = sanitizeFilePart(EXT_MAP[activeArtifact.type] ?? activeArtifact.language ?? "txt") || "txt";
    const blob = new Blob([activeArtifact.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeFilePart(activeArtifact.title) || "artifact"}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [activeArtifact]);

  const openFullscreen = useCallback(() => setFullscreen(true), []);

  const effectiveViewMode = useMemo(() => {
    if (!activeArtifact) return ViewMode.CODE;
    const supportsPreview = PREVIEWABLE_ARTIFACT_TYPES.has(activeArtifact.type);
    return supportsPreview ? viewMode : ViewMode.CODE;
  }, [activeArtifact, viewMode]);

  if (!activeArtifact) return null;

  const supportsPreview = PREVIEWABLE_ARTIFACT_TYPES.has(activeArtifact.type);

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="truncate text-sm font-medium">{activeArtifact.title}</h3>
          {activeArtifact.isStreaming && (
            <span className="shrink-0 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">
              Streaming
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <VersionNav artifact={activeArtifact} />
          {supportsPreview && (
            <div className="flex items-center rounded-md border border-border">
              <Button
                variant="ghost"
                size="icon"
                className={cn("size-7 rounded-r-none", viewMode === ViewMode.PREVIEW && "bg-muted")}
                onClick={() => setViewMode(ViewMode.PREVIEW)}
                aria-label="Show artifact preview"
              >
                <Eye className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn("size-7 rounded-l-none", viewMode === ViewMode.CODE && "bg-muted")}
                onClick={() => setViewMode(ViewMode.CODE)}
                aria-label="Show artifact code"
              >
                <Code2 className="size-3.5" />
              </Button>
            </div>
          )}
          <Button variant="ghost" size="icon" className="size-7" onClick={handleCopy} aria-label="Copy artifact">
            <Copy className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={handleDownload} aria-label="Download artifact">
            <Download className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden size-7 lg:inline-flex" onClick={openFullscreen} aria-label="Fullscreen artifact">
            <Maximize2 className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={closePanel} aria-label="Close artifact panel">
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <ArtifactErrorBoundary
          fallback={(error, reset) => (
            <ArtifactError
              error={error}
              onRetry={reset}
              onViewCode={() => { reset(); setViewMode(ViewMode.CODE); }}
            />
          )}
        >
          <ArtifactRenderer artifact={activeArtifact} viewMode={effectiveViewMode} />
        </ArtifactErrorBoundary>
      </div>

      {fullscreen && (
        <Dialog open onOpenChange={setFullscreen}>
          <DialogContent showCloseButton={false} className="!inset-0 !translate-x-0 !translate-y-0 !top-0 !left-0 !max-w-none !w-screen !h-screen !rounded-none !border-none !p-0 !gap-0 flex flex-col">
            <DialogTitle className="sr-only">{activeArtifact.title}</DialogTitle>
            <div className="flex items-center justify-between border-b px-4 py-2">
              <h3 className="text-sm font-medium truncate">{activeArtifact.title}</h3>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => setFullscreen(false)} aria-label="Exit fullscreen">
                <X className="size-3.5" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto">
              <ArtifactRenderer artifact={activeArtifact} viewMode={effectiveViewMode} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
});

function sanitizeFilePart(value: string): string {
  return value
    .replace(/[^a-z0-9._-]/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 80);
}
