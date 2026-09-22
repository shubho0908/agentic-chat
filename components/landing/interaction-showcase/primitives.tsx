"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { m } from "framer-motion";
import { ArrowUp, ChevronDown, Plus } from "lucide-react";
import { OpenAIIcon } from "@/components/icons/openaiIcon";
import { cn } from "@/lib/utils";
import {
  DIVIDER_CLASS,
  VIEWPORT_SURFACE_CLASS,
} from "@/components/landing/interaction-showcase/constants";
import {
  IpadFrame,
  LaptopFrame,
  PhoneFrame,
} from "@/components/landing/interaction-showcase/deviceFrames";
import {
  DeviceKind,
  DeviceOrientation,
} from "@/components/landing/interaction-showcase/types";

export function ScreenScaler({
  designWidth,
  fallbackScale,
  children,
}: {
  designWidth: number;
  fallbackScale: number;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const update = () => {
      const rect = node.getBoundingClientRect();
      setScreen((prev) =>
        prev &&
        Math.abs(prev.width - rect.width) < 0.5 &&
        Math.abs(prev.height - rect.height) < 0.5
          ? prev
          : { width: rect.width, height: rect.height },
      );
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  const scale = screen ? screen.width / designWidth : fallbackScale;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <div
        className="@container absolute left-0 top-0"
        style={{
          width: designWidth,
          height: screen ? screen.height / scale : "100%",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ComposerBar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none shrink-0 select-none px-2 pb-2 @[40rem]:px-3 @[40rem]:pb-3",
        className,
      )}
    >
      <div className="relative isolate overflow-hidden rounded-3xl border border-black/[0.07] bg-[rgb(252_252_253)] shadow-[0_2px_6px_rgba(15,23,42,0.04),0_12px_32px_-8px_rgba(15,23,42,0.08)] dark:border-white/[0.09] dark:bg-[rgb(24_24_27)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.25),0_16px_40px_-12px_rgba(0,0,0,0.5)]">
        <div className="px-4 pt-3">
          <span className="block truncate text-[13px] leading-6 text-muted-foreground">
            Ask me anything...
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-2">
          <button
            type="button"
            disabled
            tabIndex={-1}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground"
          >
            <Plus className="size-4" />
          </button>
          <div className="min-w-0 flex-1" />
          <button
            type="button"
            disabled
            tabIndex={-1}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium text-foreground/80"
          >
            <OpenAIIcon className="size-3.5 shrink-0" />
            <span className="truncate">GPT-5.6 Sol</span>
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          </button>
          <button
            type="button"
            disabled
            tabIndex={-1}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-muted-foreground shadow-none dark:bg-white/[0.08]"
          >
            <ArrowUp className="size-4" strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeviceShell({
  device,
  tabletLandscape = false,
  children,
}: {
  device: DeviceKind;
  tabletLandscape?: boolean;
  children: ReactNode;
}) {
  const designSpecs: Record<DeviceKind, { designWidth: number; fallbackScale: number }> = {
    [DeviceKind.Phone]: { designWidth: 390, fallbackScale: 0.74 },
    [DeviceKind.Tablet]: tabletLandscape
      ? { designWidth: 880, fallbackScale: 0.6 }
      : { designWidth: 660, fallbackScale: 0.68 },
    [DeviceKind.Desktop]: { designWidth: 720, fallbackScale: 0.88 },
  };
  const { designWidth, fallbackScale } = designSpecs[device];

  const screenContent = (
    <ScreenScaler designWidth={designWidth} fallbackScale={fallbackScale}>
      <div
        className={`flex h-full min-h-0 flex-col ${VIEWPORT_SURFACE_CLASS} ${
          device === DeviceKind.Phone ? "pt-11" : ""
        }`}
      >
        {children}
        {device !== DeviceKind.Desktop ? (
          <ComposerBar className={device === DeviceKind.Phone ? "mb-3" : undefined} />
        ) : null}
      </div>
    </ScreenScaler>
  );

  const frames: Record<DeviceKind, ReactNode> = {
    [DeviceKind.Phone]: (
      <div className="mx-auto w-full max-w-[clamp(15.75rem,84vw,18.75rem)]">
        <PhoneFrame>{screenContent}</PhoneFrame>
      </div>
    ),
    [DeviceKind.Tablet]: (
      <div
        className={`mx-auto w-full ${
          tabletLandscape
            ? "max-w-[min(34rem,112vh)]"
            : "max-w-[clamp(20rem,80vw,29rem)]"
        }`}
      >
        <IpadFrame
          orientation={tabletLandscape ? DeviceOrientation.Landscape : DeviceOrientation.Portrait}
        >
          {screenContent}
        </IpadFrame>
      </div>
    ),
    [DeviceKind.Desktop]: (
      <div className="w-full max-w-[46rem]">
        <LaptopFrame>{screenContent}</LaptopFrame>
      </div>
    ),
  };

  return frames[device];
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
      <div className={`shrink-0 border-b px-2.5 py-2.5 @[40rem]:px-4 @[40rem]:py-3 ${DIVIDER_CLASS}`}>
        <div>
          <p className="text-[10px] font-medium tracking-[0.06em] text-muted-foreground/80 dark:text-white/[0.52] @[40rem]:text-[11px]">{caption}</p>
          <h3 className="mt-1 text-[15px] font-medium text-foreground @[40rem]:text-[17px]">{title}</h3>
        </div>
      </div>

      <div className="min-h-0 max-h-full flex-1 overflow-hidden p-2 @[40rem]:p-3">
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
      <div ref={contentRef} className="flex min-h-full flex-col gap-2 @[40rem]:gap-2.5">
        {children}
      </div>
    </div>
  );
}

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[92%] whitespace-pre-wrap break-words rounded-[18px] rounded-br-[6px] border border-chat-user-bubble-border bg-chat-user-bubble px-2.5 py-2 text-[11.5px] leading-[1.25rem] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] dark:border-white/[0.12] dark:bg-[#222329] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] @[40rem]:max-w-[78%] @[40rem]:px-3 @[40rem]:text-[13px] @[40rem]:leading-[1.3rem]">
        {text}
      </div>
    </div>
  );
}

export function AssistantShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 @[40rem]:gap-2.5">
      <div className="flex items-center gap-2">
        <div className="relative flex size-6 items-center justify-center overflow-hidden rounded-full border border-black/5 bg-white shadow-sm dark:border-white/[0.14] dark:bg-[#14161a] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <OpenAIIcon className="size-3 text-black dark:text-primary" />
        </div>
        <span className="text-[12px] font-semibold tracking-tight text-muted-foreground dark:text-white/[0.68] @[40rem]:text-[13px]">
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
      <p className="whitespace-pre-line text-[11.5px] leading-[1.28rem] text-foreground @[40rem]:text-[12.5px] @[40rem]:leading-[1.35rem]">
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


