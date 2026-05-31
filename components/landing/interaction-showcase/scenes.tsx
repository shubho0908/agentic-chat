"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { AnimatePresence, m } from "framer-motion";
import { Search } from "lucide-react";
import {
  CHIP_SURFACE_CLASS,
  PANEL_SURFACE_CLASS,
  SCENE_TRANSITION,
  SOFT_BORDER_CLASS,
  SOURCE_ITEMS,
  SURFACE_BORDER_CLASS,
  WEB_IMAGE_ITEMS,
  WEB_RESPONSE,
} from "@/components/landing/interaction-showcase/constants";
import {
  AssistantShell,
  AutoScrollStage,
  ResponseBubble,
  SceneFrame,
  UserBubble,
} from "@/components/landing/interaction-showcase/primitives";
import {
  getResponsiveTypingSpeed,
  getStepStart,
  getTypedText,
} from "@/components/landing/interaction-showcase/timeline";
import type { DeviceKind } from "@/components/landing/interaction-showcase/types";

function getMotionProps(prefersReducedMotion: boolean) {
  return prefersReducedMotion
    ? {
        initial: false as const,
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        exit: undefined,
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: 10, filter: "blur(8px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        exit: { opacity: 0, y: -10, filter: "blur(8px)" },
        transition: SCENE_TRANSITION,
      };
}

function TimelineItem({
  itemKey,
  node,
  prefersReducedMotion,
}: {
  itemKey: string;
  node: ReactNode;
  prefersReducedMotion: boolean;
}) {
  const motionProps = getMotionProps(prefersReducedMotion);

  return (
    <m.div key={itemKey} {...motionProps}>
      {node}
    </m.div>
  );
}

export function WebSearchScene({
  device,
  step,
  sceneElapsed,
  prefersReducedMotion,
}: {
  device: DeviceKind;
  step: number;
  sceneElapsed: number;
  prefersReducedMotion: boolean;
}) {
  const response = getTypedText(
    WEB_RESPONSE,
    sceneElapsed,
    getStepStart("web", 3),
    getResponsiveTypingSpeed({
      scene: "web",
      startStep: 3,
      target: WEB_RESPONSE,
      preferredSpeed: 6,
    }),
  );
  const chipTransition = prefersReducedMotion ? { duration: 0 } : { duration: 0.2 };
  const showSources = device !== "phone";
  const showImages = device === "desktop" ? step >= 2 : step >= 3;
  const timelineItems: Array<{ key: string; node: ReactNode }> = [];

  if (step >= 1) {
    timelineItems.push({
      key: "web-searching",
      node: (
        <div className={`rounded-xl px-3 py-2.5 ${PANEL_SURFACE_CLASS} ${SURFACE_BORDER_CLASS}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[12px] font-medium text-foreground sm:text-[13px]">
              <Search className="size-3.5 text-sky-400" />
              Searching the web
            </div>
            <span className="text-[10px] text-muted-foreground dark:text-white/[0.5] sm:text-[11px]">2.0s</span>
          </div>
          {showSources && (
            <div className="mt-2 flex flex-wrap gap-2">
              {SOURCE_ITEMS.map((source) => (
                <m.span
                  key={source}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={chipTransition}
                  className={`rounded-lg px-2 py-0.5 text-[9px] font-medium text-muted-foreground/90 sm:text-[10px] ${CHIP_SURFACE_CLASS} ${SOFT_BORDER_CLASS}`}
                >
                  {source}
                </m.span>
              ))}
            </div>
          )}
        </div>
      ),
    });
  }

  if (showImages) {
    timelineItems.push({
      key: "web-images",
      node: (
        <div
          className={`grid gap-2 ${
            device === "desktop"
              ? "grid-cols-3"
              : device === "tablet"
                ? "grid-cols-2"
                : "grid-cols-1"
          }`}
        >
          {WEB_IMAGE_ITEMS.map((item) => (
            <div
              key={item.key}
              className={`relative aspect-[16/9] min-w-0 overflow-hidden rounded-xl ${PANEL_SURFACE_CLASS} ${SURFACE_BORDER_CLASS}`}
            >
              <div className="absolute inset-0 overflow-hidden bg-muted/30">
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  sizes={
                    device === "desktop"
                      ? "(max-width: 1023px) 33vw, 200px"
                      : device === "tablet"
                        ? "(max-width: 719px) 100vw, 220px"
                        : "260px"
                  }
                  quality={68}
                  className="object-cover"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-2.5 pb-2">
                  <div className="min-w-0">
                    <p className="truncate text-[9.5px] font-medium text-white sm:text-[10px]">{item.title}</p>
                    <p className="truncate text-[8.5px] text-white/70 sm:text-[9px]">{item.source}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ),
    });
  }

  if (step >= 3) {
    timelineItems.push({
      key: "web-response",
      node: (
        <ResponseBubble
          text={response}
          minHeight="min-h-[48px]"
          showCursor={!prefersReducedMotion}
          prefersReducedMotion={prefersReducedMotion}
        />
      ),
    });
  }

  return (
    <SceneFrame title="Web search" caption="Searches, verifies, then answers">
      <div className="flex h-full min-h-0 flex-col gap-2.5 sm:gap-3">
        <UserBubble text="Find the most important product launches in AI search this week and show the strongest visuals too." />

        <AssistantShell>
          <AutoScrollStage>
            <AnimatePresence initial={false}>
              {timelineItems.map((item) => (
                <TimelineItem
                  key={item.key}
                  itemKey={item.key}
                  node={item.node}
                  prefersReducedMotion={prefersReducedMotion}
                />
              ))}
            </AnimatePresence>
          </AutoScrollStage>
        </AssistantShell>
      </div>
    </SceneFrame>
  );
}


