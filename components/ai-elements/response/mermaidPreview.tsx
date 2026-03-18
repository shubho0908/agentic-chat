import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Code2, Eye } from "lucide-react";
import { useTheme } from "next-themes";
import { CodeCopyButton } from "./codeCopyButton";
import {
  CODE_BLOCK_SHELL_CLASS,
  MAX_MERMAID_ERROR_LENGTH,
  MERMAID_FALLBACK_ERROR,
  MERMAID_LOADING_TEXT,
  MERMAID_THEME_DARK,
  MERMAID_THEME_DEFAULT,
} from "./constants";

type MermaidTheme = typeof MERMAID_THEME_DEFAULT | typeof MERMAID_THEME_DARK;
type MermaidViewMode = "preview" | "code";

let mermaidModulePromise: Promise<typeof import("mermaid")> | null = null;
let mermaidInitializedTheme: MermaidTheme | null = null;
const mermaidSvgCache = new Map<string, string>();
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

function getMermaidTheme(resolvedTheme: string | undefined): MermaidTheme {
  return resolvedTheme === "light" ? MERMAID_THEME_DEFAULT : MERMAID_THEME_DARK;
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

async function renderMermaidSvg(source: string, theme: MermaidTheme): Promise<string> {
  const cacheKey = `${theme}\n${source}`;
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

    if (mermaidInitializedTheme !== theme) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme,
        darkMode: theme === MERMAID_THEME_DARK,
      });
      mermaid.setParseErrorHandler(() => undefined);
      mermaidInitializedTheme = theme;
    }

    const renderHost = createMermaidRenderHost();

    const renderId = `mermaid-${theme}-${Math.random().toString(36).slice(2)}`;
    try {
      cleanupLeakedMermaidArtifacts();
      await mermaid.parse(source, { suppressErrors: false });
      const { svg } = await mermaid.render(renderId, source, renderHost);
      mermaidSvgCache.set(cacheKey, svg);
      return svg;
    } finally {
      renderHost.remove();
      cleanupLeakedMermaidArtifacts();
    }
  })();

  mermaidRenderPromiseCache.set(cacheKey, renderPromise);

  try {
    return await renderPromise;
  } finally {
    mermaidRenderPromiseCache.delete(cacheKey);
  }
}

function MermaidPreviewContent({
  source,
  theme,
}: {
  source: string;
  theme: MermaidTheme;
}) {
  const idBase = useId();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = useState<MermaidViewMode>("preview");
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
    const previewElement = previewRef.current;
    previewElement?.replaceChildren();

    void renderMermaidSvg(source, theme)
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
      previewElement?.replaceChildren();
    };
  }, [source, theme]);

  useEffect(() => {
    if (viewMode !== "preview" || !previewRef.current) {
      return;
    }

    previewRef.current.innerHTML = state.svg ?? "";
  }, [state.svg, viewMode]);

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
              <div className="mermaidPreview-viewport inline-block rounded-lg border border-zinc-200/80 bg-white/85 dark:border-zinc-800/80 dark:bg-zinc-950/70">
                <div
                  ref={previewRef}
                  className="mermaidPreview-svg"
                  aria-label="Mermaid diagram preview"
                />
              </div>
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
    </div>
  );
}

export function MermaidPreview({ source }: { source: string }) {
  const { resolvedTheme } = useTheme();
  const theme = getMermaidTheme(resolvedTheme);
  const previewKey = `${theme}\n${source}`;

  return <MermaidPreviewContent key={previewKey} source={source} theme={theme} />;
}
