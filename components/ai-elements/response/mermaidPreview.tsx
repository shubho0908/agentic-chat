"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AlertCircle, Code2, Expand, Eye, X } from "lucide-react";
import DOMPurify from "dompurify";
import { CodeCopyButton } from "./codeCopyButton";
import {
  CODE_BLOCK_SHELL_CLASS,
  MAX_MERMAID_ERROR_LENGTH,
  MERMAID_FALLBACK_ERROR,
  MERMAID_LOADING_TEXT,
} from "./constants";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/useMobile";

type MermaidViewMode = "preview" | "code";
type MermaidResolvedTheme = "light" | "dark";
type MermaidThemeName = "base";
type MermaidThemeVariables = Record<string, string>;
type MermaidAppearance = {
  cacheKey: `${MermaidResolvedTheme}-v2`;
  mermaidTheme: MermaidThemeName;
  darkMode: boolean;
  themeVariables: MermaidThemeVariables;
};

let mermaidModulePromise: Promise<typeof import("mermaid")> | null = null;
let mermaidInitializedThemeKey: MermaidAppearance["cacheKey"] | null = null;
let mermaidRenderQueue: Promise<void> = Promise.resolve();

// LRU Cache for Mermaid SVGs to prevent memory leaks
const MAX_CACHE_SIZE = 50;

function useDomResolvedTheme(): MermaidResolvedTheme | null {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof document === "undefined") {
        return () => {};
      }

      const root = document.documentElement;
      const observer = new MutationObserver(onStoreChange);
      observer.observe(root, {
        attributes: true,
        attributeFilter: ["class"],
      });

      return () => observer.disconnect();
    },
    () => {
      if (typeof document === "undefined") {
        return null;
      }

      return document.documentElement.classList.contains("dark") ? "dark" : "light";
    },
    () => null,
  );
}

function createLRUCache<K, V>() {
  const cache = new Map<K, V>();

  function get(key: K): V | undefined {
    const value = cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      cache.delete(key);
      cache.set(key, value);
    }
    return value;
  }

  function set(key: K, value: V): void {
    if (cache.has(key)) {
      cache.delete(key);
    } else if (cache.size >= MAX_CACHE_SIZE) {
      // Remove least recently used item (first item)
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) {
        cache.delete(firstKey);
      }
    }
    cache.set(key, value);
  }

  function clear(): void {
    cache.clear();
  }

  return { get, set, clear };
}

const mermaidSvgCache = createLRUCache<string, string>();
const mermaidRenderPromiseCache = new Map<string, Promise<string>>();

function cleanupLeakedMermaidArtifacts() {
  if (typeof document === "undefined") {
    return;
  }

  document.body
    .querySelectorAll<HTMLElement>(
      ':scope > [id^="dmermaid-"], :scope > [id^="imermaid-"], :scope > svg[id^="mermaid-"]',
    )
    .forEach((node) => node.remove());
}

async function loadMermaidModule() {
  if (!mermaidModulePromise) {
    cleanupLeakedMermaidArtifacts();
    mermaidModulePromise = import("mermaid");
  }

  return mermaidModulePromise;
}

function getMermaidAppearance(
  resolvedTheme: MermaidResolvedTheme | null | undefined,
): MermaidAppearance | null {
  if (resolvedTheme !== "light" && resolvedTheme !== "dark") {
    return null;
  }

  if (resolvedTheme === "light") {
    return {
      cacheKey: "light-v2",
      mermaidTheme: "base",
      darkMode: false,
      themeVariables: {
        background: "#ffffff",
        primaryColor: "#fafafa",
        primaryTextColor: "#18181b",
        primaryBorderColor: "#d4d4d8",
        lineColor: "#52525b",
        textColor: "#18181b",
        mainBkg: "#ffffff",
        secondBkg: "#f4f4f5",
        clusterBkg: "#f8fafc",
        clusterBorder: "#d4d4d8",
        nodeBorder: "#d4d4d8",
        defaultLinkColor: "#52525b",
        edgeLabelBackground: "#ffffff",
        labelBackground: "#ffffff",
        titleColor: "#09090b",
        noteBkgColor: "#fef3c7",
        noteTextColor: "#3f3f46",
      },
    };
  }

  return {
    cacheKey: "dark-v2",
    mermaidTheme: "base",
    darkMode: true,
    themeVariables: {
      background: "#09090b",
      primaryColor: "#18181b",
      primaryTextColor: "#fafafa",
      primaryBorderColor: "#71717a",
      lineColor: "#d4d4d8",
      textColor: "#fafafa",
      mainBkg: "#18181b",
      secondBkg: "#27272a",
      clusterBkg: "#111827",
      clusterBorder: "#52525b",
      nodeBorder: "#71717a",
      defaultLinkColor: "#d4d4d8",
      edgeLabelBackground: "#18181b",
      labelBackground: "#18181b",
      titleColor: "#fafafa",
      noteBkgColor: "#3f3f46",
      noteTextColor: "#fafafa",
    },
  };
}

function injectMermaidThemeOverrides(svg: string, appearance: MermaidAppearance): string {
  const nodeFill = appearance.themeVariables.mainBkg ?? appearance.themeVariables.primaryColor ?? "#ffffff";
  const nodeBorder = appearance.themeVariables.nodeBorder ?? appearance.themeVariables.primaryBorderColor ?? "#d4d4d8";
  const clusterFill = appearance.themeVariables.clusterBkg ?? appearance.themeVariables.secondBkg ?? nodeFill;
  const clusterBorder = appearance.themeVariables.clusterBorder ?? nodeBorder;
  const textColor =
    appearance.themeVariables.textColor ?? appearance.themeVariables.primaryTextColor ?? "#18181b";
  const lineColor = appearance.themeVariables.lineColor ?? "#52525b";
  const edgeLabelBackground =
    appearance.themeVariables.edgeLabelBackground ?? appearance.themeVariables.labelBackground ?? nodeFill;
  const titleColor = appearance.themeVariables.titleColor ?? textColor;
  const noteFill = appearance.themeVariables.noteBkgColor ?? clusterFill;
  const noteText = appearance.themeVariables.noteTextColor ?? textColor;

  const overrideStyle = `
<style data-mermaid-theme-override="true">
.node rect, .node circle, .node ellipse, .node polygon, .node path { fill: ${nodeFill} !important; stroke: ${nodeBorder} !important; }
.cluster rect { fill: ${clusterFill} !important; stroke: ${clusterBorder} !important; }
.label text, .nodeLabel, .edgeLabel, .cluster-label text, .cluster text, .label, text { fill: ${textColor} !important; color: ${textColor} !important; }
.label span, .nodeLabel span, .edgeLabel span, foreignObject div { color: ${textColor} !important; }
.edgeLabel .label rect, .labelBkg { fill: ${edgeLabelBackground} !important; background: ${edgeLabelBackground} !important; }
.path, .flowchart-link, .relationshipLine, .messageLine0, .messageLine1, .loopLine { stroke: ${lineColor} !important; }
marker path, .marker { fill: ${lineColor} !important; stroke: ${lineColor} !important; }
.cluster-label text, .classTitleText { fill: ${titleColor} !important; }
.note, .note rect { fill: ${noteFill} !important; stroke: ${clusterBorder} !important; }
.note text { fill: ${noteText} !important; }
</style>`;

  return svg.includes("</svg>") ? svg.replace("</svg>", `${overrideStyle}</svg>`) : `${svg}${overrideStyle}`;
}

function normalizeMermaidError(error: unknown): string {
  const rawMessage =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "str" in error
          ? String(error.str)
          : MERMAID_FALLBACK_ERROR;

  const compactMessage = rawMessage.replace(/\s+/g, " ").trim();
  if (!compactMessage) {
    return MERMAID_FALLBACK_ERROR;
  }

  if (compactMessage.length <= MAX_MERMAID_ERROR_LENGTH) {
    return compactMessage;
  }

  return `${compactMessage.slice(0, MAX_MERMAID_ERROR_LENGTH - 1).trimEnd()}...`;
}

function createMermaidRenderHost(): HTMLDivElement {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = "1px";
  host.style.height = "1px";
  host.style.overflow = "hidden";
  host.style.opacity = "0";
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";
  document.body.appendChild(host);
  return host;
}

async function renderMermaidSvg(source: string, appearance: MermaidAppearance): Promise<string> {
  const cacheKey = `${appearance.cacheKey}\n${source}`;
  const cachedSvg = mermaidSvgCache.get(cacheKey);
  if (cachedSvg) {
    return cachedSvg;
  }

  const pendingRender = mermaidRenderPromiseCache.get(cacheKey);
  if (pendingRender) {
    return pendingRender;
  }

  const renderPromise = (async () => {
    const mermaidModule = await loadMermaidModule();
    const mermaid = mermaidModule.default;
    const mermaidApi = mermaid.mermaidAPI;

    const runRender = async () => {
      if (mermaidInitializedThemeKey !== appearance.cacheKey) {
        mermaidApi.globalReset();
        mermaidApi.reset();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: appearance.mermaidTheme,
          darkMode: appearance.darkMode,
          themeVariables: appearance.themeVariables,
        });
        mermaid.setParseErrorHandler(() => undefined);
        mermaidInitializedThemeKey = appearance.cacheKey;
      }

      const renderHost = createMermaidRenderHost();
      const renderId = `mermaid-${appearance.cacheKey}-${Math.random().toString(36).slice(2)}`;

      try {
        cleanupLeakedMermaidArtifacts();
        await mermaid.parse(source, { suppressErrors: false });
        const { svg } = await mermaid.render(renderId, source, renderHost);
        const themedSvg = injectMermaidThemeOverrides(svg, appearance);
        mermaidSvgCache.set(cacheKey, themedSvg);
        return themedSvg;
      } finally {
        renderHost.remove();
        cleanupLeakedMermaidArtifacts();
      }
    };

    const queuedRender = mermaidRenderQueue.then(runRender);
    mermaidRenderQueue = queuedRender.then(() => undefined, () => undefined);
    return queuedRender;
  })();

  mermaidRenderPromiseCache.set(cacheKey, renderPromise);

  try {
    return await renderPromise;
  } finally {
    mermaidRenderPromiseCache.delete(cacheKey);
  }
}

function MermaidSvgCanvas({
  svg,
  className,
  onSvgRendered,
}: {
  svg: string;
  className: string;
  onSvgRendered?: (svgElement: SVGSVGElement | null) => void;
}) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const onSvgRenderedRef = useRef(onSvgRendered);

  useEffect(() => {
    onSvgRenderedRef.current = onSvgRendered;
  }, [onSvgRendered]);

  useEffect(() => {
    const previewElement = previewRef.current;
    if (!previewElement) {
      return;
    }

    const cleanSvg = DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      ADD_TAGS: ["#text"],
      ADD_ATTR: ["class", "style", "transform", "fill", "stroke", "stroke-width"],
    });

    previewElement.innerHTML = cleanSvg;
    const svgElement = previewElement.querySelector("svg");
    if (svgElement) {
      svgElement.style.display = "block";
      svgElement.style.overflow = "visible";
    }
    onSvgRenderedRef.current?.(svgElement);

    return () => {
      onSvgRenderedRef.current?.(null);
      previewElement.replaceChildren();
    };
  }, [svg]);

  return <div ref={previewRef} className={className} aria-label="Mermaid diagram preview" />;
}

function MermaidPanSurface({
  children,
  className,
  expanded = false,
}: {
  children: ReactNode;
  className: string;
  expanded?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({
    isDragging: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      ref={viewportRef}
      className={`${className} ${expanded ? (isDragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
      onPointerDown={(event) => {
        if (!expanded || event.pointerType !== "mouse" || event.button !== 0 || !viewportRef.current) {
          return;
        }

        dragStateRef.current = {
          isDragging: true,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          scrollLeft: viewportRef.current.scrollLeft,
          scrollTop: viewportRef.current.scrollTop,
        };

        setIsDragging(true);
        viewportRef.current.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!dragStateRef.current.isDragging || dragStateRef.current.pointerId !== event.pointerId || !viewportRef.current) {
          return;
        }

        event.preventDefault();
        const deltaX = event.clientX - dragStateRef.current.startX;
        const deltaY = event.clientY - dragStateRef.current.startY;
        viewportRef.current.scrollLeft = dragStateRef.current.scrollLeft - deltaX;
        viewportRef.current.scrollTop = dragStateRef.current.scrollTop - deltaY;
      }}
      onPointerUp={(event) => {
        if (!dragStateRef.current.isDragging || dragStateRef.current.pointerId !== event.pointerId || !viewportRef.current) {
          return;
        }

        dragStateRef.current.isDragging = false;
        setIsDragging(false);
        if (viewportRef.current.hasPointerCapture(event.pointerId)) {
          viewportRef.current.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={(event) => {
        if (!dragStateRef.current.isDragging || dragStateRef.current.pointerId !== event.pointerId || !viewportRef.current) {
          return;
        }

        dragStateRef.current.isDragging = false;
        setIsDragging(false);
        if (viewportRef.current.hasPointerCapture(event.pointerId)) {
          viewportRef.current.releasePointerCapture(event.pointerId);
        }
      }}
      style={{ userSelect: isDragging ? "none" : undefined }}
    >
      {children}
    </div>
  );
}

function MermaidFullscreenViewer({
  open,
  onOpenChange,
  svg,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  svg: string;
}) {
  const isMobile = useIsMobile();
  const viewer = (
    <div className={`flex min-h-0 flex-col overflow-hidden border border-zinc-200/80 bg-zinc-50/96 text-zinc-900 shadow-2xl shadow-black/15 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/96 dark:text-zinc-50 ${isMobile ? "h-full rounded-t-[28px] border-b-0" : "h-[min(92vh,64rem)] w-[min(96vw,96rem)] rounded-[28px]"}`}>
      <div className="relative px-4 py-3 sm:px-5">
        <div className="pointer-events-none absolute inset-x-4 bottom-0 border-b border-zinc-200/80 sm:inset-x-5 dark:border-zinc-800/80" />
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Mermaid diagram</p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              Scroll or swipe to explore large diagrams.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-zinc-200/80 bg-white/80 text-zinc-600 transition hover:bg-white hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-700/80 dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
            aria-label="Close Mermaid fullscreen preview"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className={`min-h-0 flex-1 p-3 sm:p-4 ${isMobile ? "pb-[calc(0.75rem+env(safe-area-inset-bottom))]" : ""}`}>
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <MermaidPanSurface
            className="mermaidPreview-viewport mermaidPreview-viewport-expanded h-full rounded-2xl border border-zinc-200/80 bg-white/90 dark:border-zinc-800/80 dark:bg-zinc-950/80"
          >
            <MermaidSvgCanvas svg={svg} className="mermaidPreview-svg mermaidPreview-svg-expanded" />
          </MermaidPanSurface>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
        <DrawerContent
          variant="bare"
          showHandle={false}
          className="h-[100dvh] overflow-hidden border-0 bg-transparent p-0 shadow-none"
        >
          <DrawerTitle className="sr-only">Mermaid diagram</DrawerTitle>
          {viewer}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        variant="bare"
        className="max-h-[96vh] max-w-none overflow-visible border-0 bg-transparent p-0 shadow-none"
      >
        <DialogTitle className="sr-only">Mermaid diagram</DialogTitle>
        {viewer}
      </DialogContent>
    </Dialog>
  );
}

function MermaidPreviewContent({
  source,
  appearance,
}: {
  source: string;
  appearance: MermaidAppearance;
}) {
  const idBase = useId();
  const [viewMode, setViewMode] = useState<MermaidViewMode>("preview");
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [state, setState] = useState<{
    svg: string | null;
    error: string | null;
    isLoading: boolean;
  }>({
    svg: null,
    error: null,
    isLoading: true,
  });

  useEffect(() => {
    let isActive = true;

    void renderMermaidSvg(source, appearance)
      .then((nextSvg) => {
        if (!isActive) return;
        setState({
          svg: nextSvg,
          error: null,
          isLoading: false,
        });
      })
      .catch((renderError: unknown) => {
        if (!isActive) return;
        setState({
          svg: null,
          error: normalizeMermaidError(renderError),
          isLoading: false,
        });
      });

    return () => {
      isActive = false;
    };
  }, [source, appearance]);

  const previewPanelId = `${idBase}-preview`;
  const codePanelId = `${idBase}-code`;
  const tabButtonClass =
    "inline-flex size-8 items-center justify-center rounded-lg border border-transparent transition-all";

  return (
    <div className={CODE_BLOCK_SHELL_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/80 bg-zinc-100/70 px-3 py-2 sm:px-3.5 dark:border-zinc-800/80 dark:bg-zinc-900/70">
        <span className="block truncate text-[11px] font-medium lowercase tracking-wide text-zinc-600 dark:text-zinc-400">
          mermaid
        </span>

        <div className="inline-flex items-center gap-2">
          <div
            role="tablist"
            aria-label="Mermaid diagram views"
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200/80 bg-white/90 p-0.5 shadow-[0_1px_0_rgba(255,255,255,0.75)_inset,0_1px_2px_rgba(15,23,42,0.08)] dark:border-zinc-800/80 dark:bg-zinc-950/90 dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_1px_2px_rgba(0,0,0,0.3)]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "preview"}
              aria-controls={previewPanelId}
              aria-label="Show Mermaid preview"
              onClick={() => setViewMode("preview")}
              className={`${tabButtonClass} ${
                viewMode === "preview"
                  ? "border-zinc-900/90 bg-zinc-900 text-white shadow-sm dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                  : "text-zinc-600 hover:border-zinc-200 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <Eye className="size-3.5" />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "code"}
              aria-controls={codePanelId}
              aria-label="Show Mermaid code"
              onClick={() => setViewMode("code")}
              className={`${tabButtonClass} ${
                viewMode === "code"
                  ? "border-zinc-900/90 bg-zinc-900 text-white shadow-sm dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                  : "text-zinc-600 hover:border-zinc-200 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <Code2 className="size-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setIsFullscreenOpen(true)}
            disabled={!state.svg}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-zinc-200/80 bg-white/90 text-zinc-600 transition-all hover:border-zinc-300 hover:bg-white hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-800/80 dark:bg-zinc-950/90 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-950 dark:hover:text-zinc-100"
            aria-label="Open Mermaid diagram fullscreen preview"
          >
            <Expand className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="mermaidPreview px-3 py-4 sm:px-4 sm:py-5">
        {viewMode === "preview" && (
          <div role="tabpanel" id={previewPanelId}>
            {state.isLoading && (
              <div className="mermaidPreview-viewport inline-flex min-h-[140px] min-w-[16rem] items-center justify-center rounded-lg border border-dashed border-zinc-300/70 bg-white/70 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700/70 dark:bg-zinc-900/40 dark:text-zinc-400">
                <span>{MERMAID_LOADING_TEXT}</span>
              </div>
            )}

            {!state.isLoading && state.svg && (
              <MermaidPanSurface className="mermaidPreview-viewport mermaidPreview-viewport-inline inline-block rounded-lg border border-zinc-200/80 bg-white/85 dark:border-zinc-800/80 dark:bg-zinc-950/70">
                <MermaidSvgCanvas svg={state.svg} className="mermaidPreview-svg" />
              </MermaidPanSurface>
            )}

            {!state.isLoading && state.error && (
              <div className="inline-block max-w-full space-y-3 rounded-lg border border-amber-300/80 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium">Preview unavailable for this diagram.</p>
                    <p className="max-w-[42rem] whitespace-pre-wrap break-words text-amber-900/80 dark:text-amber-100/80">
                      {state.error}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === "code" && (
          <div role="tabpanel" id={codePanelId} className="inline-block max-w-full">
            {state.error && (
              <div className="mb-3 flex max-w-[42rem] items-start gap-2 rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <p className="whitespace-pre-wrap break-words text-amber-900/80 dark:text-amber-100/80">
                  Preview unavailable. The Mermaid source is still available below.
                </p>
              </div>
            )}

            <div className="relative max-w-full rounded-lg bg-zinc-950/90">
              <div className="absolute right-2 top-2 z-10">
                <CodeCopyButton content={source} />
              </div>
              <pre className="no-scrollbar max-w-full overflow-x-auto rounded-lg bg-transparent">
                <code className="block min-w-max px-3 pb-3 pt-10 text-[12px] leading-5 font-mono text-zinc-100 sm:px-4 sm:pb-3.5 sm:pt-10 sm:text-[13px] whitespace-pre">
                  {source}
                </code>
              </pre>
            </div>
          </div>
        )}
      </div>

      {state.svg && (
        <MermaidFullscreenViewer
          open={isFullscreenOpen && !!state.svg}
          onOpenChange={setIsFullscreenOpen}
          svg={state.svg}
        />
      )}
    </div>
  );
}

export function MermaidPreview({ source }: { source: string }) {
  const resolvedTheme = useDomResolvedTheme();
  const appearance = getMermaidAppearance(resolvedTheme);

  if (!appearance) {
    return (
      <div className={CODE_BLOCK_SHELL_CLASS}>
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200/80 bg-zinc-100/70 px-3 py-2 sm:px-3.5 dark:border-zinc-800/80 dark:bg-zinc-900/70">
          <span className="block truncate text-[11px] font-medium lowercase tracking-wide text-zinc-600 dark:text-zinc-400">
            mermaid
          </span>
        </div>
        <div className="mermaidPreview px-3 py-4 sm:px-4 sm:py-5">
          <div className="mermaidPreview-viewport inline-flex min-h-[140px] min-w-[16rem] items-center justify-center rounded-lg border border-dashed border-zinc-300/70 bg-white/70 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700/70 dark:bg-zinc-900/40 dark:text-zinc-400">
            <span>{MERMAID_LOADING_TEXT}</span>
          </div>
        </div>
      </div>
    );
  }

  const previewKey = `${appearance.cacheKey}\n${source}`;

  return <MermaidPreviewContent key={previewKey} source={source} appearance={appearance} />;
}
