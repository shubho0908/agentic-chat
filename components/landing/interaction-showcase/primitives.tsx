"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";
import { m } from "framer-motion";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Globe,
  Telescope,
} from "lucide-react";
import { GoogleIcon } from "@/components/icons/googleIcon";
import { OpenAIIcon } from "@/components/icons/openaiIcon";
import {
  CHIP_SURFACE_CLASS,
  DIVIDER_CLASS,
  FRAME_RING_CLASS,
  FRAME_SURFACE_CLASS,
  SOFT_BORDER_CLASS,
  SUBTLE_PANEL_SURFACE_CLASS,
  SURFACE_BORDER_CLASS,
  VIEWPORT_SURFACE_CLASS,
} from "@/components/landing/interaction-showcase/constants";
import type { DeviceKind, ProcessState, SceneKind } from "@/components/landing/interaction-showcase/types";

function ChromeUtilityRail({
  onPreviousScene,
  onNextScene,
  ariaHidden = false,
}: {
  onPreviousScene: () => void;
  onNextScene: () => void;
  ariaHidden?: boolean;
}) {
  return (
    <div aria-hidden={ariaHidden} className={`flex items-center ${ariaHidden ? "invisible" : ""}`}>
      <div className="flex items-center gap-1 text-muted-foreground/70">
        <button
          type="button"
          onClick={onPreviousScene}
          aria-label={ariaHidden ? undefined : "Show previous animation"}
          tabIndex={ariaHidden ? -1 : 0}
          className="flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.06] dark:hover:text-white/[0.88]"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={onNextScene}
          aria-label={ariaHidden ? undefined : "Show next animation"}
          tabIndex={ariaHidden ? -1 : 0}
          className="flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.06] dark:hover:text-white/[0.88]"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

function ContentChrome({
  device,
  scene,
  chromeTitle,
  onPreviousScene,
  onNextScene,
}: {
  device: DeviceKind;
  scene: SceneKind;
  chromeTitle: string;
  onPreviousScene: () => void;
  onNextScene: () => void;
}) {
  const isPhone = device === "phone";
  const toolbarHeight = isPhone ? "h-[68px]" : device === "tablet" ? "h-[58px]" : "h-14";
  const toolbarRadius =
    device === "phone"
      ? "rounded-t-[24px]"
      : device === "tablet"
        ? "rounded-t-[22px]"
        : "rounded-t-[16px]";
  const omnibarClass =
    device === "phone"
      ? "h-[1.875rem] max-w-[198px] rounded-full px-2.5"
      : device === "tablet"
        ? "h-[2.125rem] max-w-[250px] rounded-full px-3"
        : "h-9 max-w-[350px] rounded-full px-4";
  const omnibarSurfaceClass =
    "border border-black/[0.08] bg-[linear-gradient(180deg,rgba(241,243,248,0.98),rgba(232,235,241,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/[0.08] dark:bg-[linear-gradient(180deg,rgba(33,36,44,0.98),rgba(24,27,33,0.98))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";
  const omnibarIcon =
    scene === "workspace" ? (
      <GoogleIcon className="size-3.5 shrink-0" />
    ) : scene === "research" ? (
      <Telescope className="size-3.5 shrink-0 text-muted-foreground/90" />
    ) : (
      <Globe className="size-3.5 shrink-0 text-muted-foreground/90" />
    );

  return (
    <div
      className={`shrink-0 border-b backdrop-blur ${toolbarHeight} ${toolbarRadius} ${VIEWPORT_SURFACE_CLASS} ${DIVIDER_CLASS}`}
    >
      <div
        className={`relative flex h-full px-3 sm:px-4 ${
          isPhone ? "items-end justify-center pb-2.5" : "items-center"
        }`}
      >
        {!isPhone ? (
          <div className="grid w-full grid-cols-[auto,minmax(0,1fr),auto] items-center gap-3">
            <ChromeUtilityRail onPreviousScene={onPreviousScene} onNextScene={onNextScene} />
            <div className="flex min-w-0 justify-center">
              <div
                className={`flex w-full items-center justify-center gap-2 ${omnibarSurfaceClass} ${omnibarClass}`}
              >
                {omnibarIcon}
                <span className="truncate text-[10px] font-medium uppercase tracking-[0.09em] text-foreground/52 dark:text-white/[0.62] sm:text-[11px]">
                  {chromeTitle}
                </span>
              </div>
            </div>
            <ChromeUtilityRail
              ariaHidden
              onPreviousScene={onPreviousScene}
              onNextScene={onNextScene}
            />
          </div>
        ) : (
          <div className="flex w-full justify-center">
            <div
              className={`flex w-full items-center justify-center gap-2 ${omnibarSurfaceClass} ${omnibarClass}`}
            >
              {omnibarIcon}
              <span className="truncate text-[10px] font-medium uppercase tracking-[0.09em] text-foreground/52 dark:text-white/[0.62]">
                {chromeTitle}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function DeviceShell({
  device,
  scene,
  chromeTitle,
  onPreviousScene,
  onNextScene,
  children,
}: {
  device: DeviceKind;
  scene: SceneKind;
  chromeTitle: string;
  onPreviousScene: () => void;
  onNextScene: () => void;
  children: ReactNode;
}) {
  if (device === "phone") {
    return (
      <div className="mx-auto w-full max-w-[clamp(15.75rem,84vw,18.75rem)]">
        <div className={`relative aspect-[10/19] overflow-hidden rounded-[30px] bg-[#f5f6f9] p-[8px] shadow-sm dark:bg-[#07080b] ${FRAME_RING_CLASS}`}>
          <div className="pointer-events-none absolute inset-[1px] rounded-[29px] border border-black/[0.08] dark:border-white/[0.08]" />
          <div className="absolute left-1/2 top-[17px] z-20 h-[7px] w-[54px] -translate-x-1/2 rounded-full bg-black/12 dark:bg-white/12" />
          <div className={`relative flex h-full flex-col overflow-hidden rounded-[24px] ${VIEWPORT_SURFACE_CLASS} ${FRAME_RING_CLASS}`}>
            <ContentChrome
              device={device}
              scene={scene}
              chromeTitle={chromeTitle}
              onPreviousScene={onPreviousScene}
              onNextScene={onNextScene}
            />
            {children}
          </div>
        </div>
      </div>
    );
  }

  if (device === "tablet") {
    return (
      <div className="mx-auto w-full max-w-[clamp(20rem,80vw,29rem)]">
        <div className={`relative aspect-[4/5] overflow-hidden rounded-[28px] p-[8px] shadow-sm ${FRAME_SURFACE_CLASS} ${FRAME_RING_CLASS}`}>
          <div className="absolute left-1/2 top-[5px] z-20 h-[4px] w-[64px] -translate-x-1/2 rounded-full bg-black/12 dark:bg-white/18" />
          <div className={`relative flex h-full flex-col overflow-hidden rounded-[22px] ${VIEWPORT_SURFACE_CLASS} ${FRAME_RING_CLASS}`}>
            <ContentChrome
              device={device}
              scene={scene}
              chromeTitle={chromeTitle}
              onPreviousScene={onPreviousScene}
              onNextScene={onNextScene}
            />
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[46rem]">
      <div
        className={`relative aspect-[39/32] overflow-hidden rounded-[22px] p-[6px] shadow-sm ${FRAME_SURFACE_CLASS} ${FRAME_RING_CLASS}`}
      >
        <div className={`relative flex h-full flex-col overflow-hidden rounded-[16px] ${VIEWPORT_SURFACE_CLASS} ${FRAME_RING_CLASS}`}>
          <ContentChrome
            device={device}
            scene={scene}
            chromeTitle={chromeTitle}
            onPreviousScene={onPreviousScene}
            onNextScene={onNextScene}
          />
          {children}
        </div>
      </div>
    </div>
  );
}

export function SceneFrame({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${VIEWPORT_SURFACE_CLASS}`}>
      <div className={`shrink-0 border-b px-2.5 py-2.5 sm:px-4 sm:py-3 ${DIVIDER_CLASS}`}>
        <div>
          <p className="text-[10px] font-medium tracking-[0.06em] text-muted-foreground/80 dark:text-white/[0.52] sm:text-[11px]">{caption}</p>
          <h3 className="mt-1 text-[15px] font-medium text-foreground sm:text-[17px]">{title}</h3>
        </div>
      </div>

      <div className="min-h-0 max-h-full flex-1 overflow-hidden p-2 sm:p-3">
        {children}
      </div>
    </div>
  );
}

export function AutoScrollStage({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;

    if (!viewport || !content) {
      return;
    }

    let frame = 0;

    const scrollToLatest = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        viewport.scrollTop = viewport.scrollHeight;
      });
    };

    scrollToLatest();

    const observer = new ResizeObserver(scrollToLatest);
    observer.observe(content);
    observer.observe(viewport);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={viewportRef}
      className="scrollbar-hide relative h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain"
    >
      <div ref={contentRef} className="flex min-h-full flex-col gap-2 sm:gap-2.5">
        {children}
      </div>
    </div>
  );
}

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[92%] whitespace-pre-wrap break-words rounded-[18px] rounded-br-[6px] border border-chat-user-bubble-border bg-chat-user-bubble px-2.5 py-2 text-[11.5px] leading-[1.25rem] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] dark:border-white/[0.12] dark:bg-[#222329] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:max-w-[78%] sm:px-3 sm:text-[13px] sm:leading-[1.3rem]">
        {text}
      </div>
    </div>
  );
}

export function AssistantShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 sm:gap-2.5">
      <div className="flex items-center gap-2">
        <div className="relative flex size-6 items-center justify-center overflow-hidden rounded-full border border-black/5 bg-white shadow-sm dark:border-white/[0.14] dark:bg-[#14161a] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <OpenAIIcon className="size-3 text-black dark:text-primary" />
        </div>
        <span className="text-[12px] font-semibold tracking-tight text-muted-foreground dark:text-white/[0.68] sm:text-[13px]">
          AI assistant
        </span>
      </div>
      <div className="min-h-0 flex-1 pl-1">{children}</div>
    </div>
  );
}

export function ResponseBubble({
  text,
  minHeight = "min-h-[58px]",
  showCursor = false,
  prefersReducedMotion = false,
}: {
  text: string;
  minHeight?: string;
  showCursor?: boolean;
  prefersReducedMotion?: boolean;
}) {
  return (
    <div className={`min-w-0 ${minHeight}`}>
      <p className="whitespace-pre-line text-[11.5px] leading-[1.28rem] text-foreground sm:text-[12.5px] sm:leading-[1.35rem]">
        {text}
        {showCursor && text.length > 0 && !prefersReducedMotion && (
          <m.span
            initial={{ opacity: 0.2 }}
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.05 }}
            className="ml-0.5 inline-block h-[1em] w-px translate-y-[0.12em] bg-foreground/70 align-baseline"
          />
        )}
      </p>
    </div>
  );
}

export function ServiceAction({
  icon,
  service,
  action,
  status,
  statusLabel,
}: {
  icon: ReactNode;
  service: string;
  action: string;
  status: "current" | "completed";
  statusLabel: string;
}) {
  return (
    <div className="flex justify-start">
      <div
        className={`w-fit max-w-[95%] rounded-xl px-2.5 py-2 sm:max-w-[84%] ${SUBTLE_PANEL_SURFACE_CLASS} ${SURFACE_BORDER_CLASS}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className={`flex size-6 shrink-0 items-center justify-center rounded-lg text-foreground ${CHIP_SURFACE_CLASS} ${SOFT_BORDER_CLASS}`}>
              {icon}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-foreground sm:text-[12px]">{service}</p>
              <p className="truncate text-[10px] text-muted-foreground dark:text-white/[0.5]">{action}</p>
            </div>
          </div>
          {status === "completed" ? (
            <div className="flex shrink-0 items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-300">
              <CheckCircle2 className="size-3" />
              {statusLabel}
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground dark:text-white/[0.5]">
              <Clock3 className="size-3" />
              {statusLabel}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProcessMarker({
  state,
  prefersReducedMotion = false,
}: {
  state: ProcessState;
  prefersReducedMotion?: boolean;
}) {
  if (state === "completed") {
    return (
      <div className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
        <CheckCircle2 className="size-3.5" />
      </div>
    );
  }

  if (state === "current") {
    return (
      <div className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-sky-500/10 text-sky-400">
        {prefersReducedMotion ? (
          <div className="size-2 rounded-full bg-current" />
        ) : (
          <m.div
            animate={{ scale: [0.8, 1, 0.8], opacity: [0.6, 1, 0.6] }}
            transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.2 }}
            className="size-2 rounded-full bg-current"
          />
        )}
      </div>
    );
  }

  return (
    <div className={`mt-0.5 flex size-5 items-center justify-center rounded-full bg-background dark:bg-[#121418] ${SOFT_BORDER_CLASS}`}>
      <div className="size-1.5 rounded-full bg-muted-foreground/40" />
    </div>
  );
}
