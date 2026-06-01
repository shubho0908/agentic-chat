"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { AnimatePresence, m } from "framer-motion";
import { Route } from "lucide-react";
import {
  CHIP_SURFACE_CLASS,
  DR_SCENE_ACTIVITIES_1_CALLING,
  DR_SCENE_ACTIVITIES_1_DONE,
  DR_SCENE_ACTIVITIES_2_CALLING,
  DR_SCENE_ACTIVITIES_2_DONE,
  DR_SCENE_ACTIVITIES_3_CALLING,
  DR_SCENE_ACTIVITIES_3_DONE,
  DEEP_RESEARCH_RESPONSE,
  ORCHESTRATION_RESPONSE,
  ORCH_STEP1_CALLING,
  ORCH_STEP1_DONE,
  ORCH_STEP2_CALLING,
  ORCH_STEP2_DONE,
  ORCH_STEP3_CALLING,
  ORCH_STEP3_DONE,
  PANEL_SURFACE_CLASS,
  SCENE_TRANSITION,
  SOFT_BORDER_CLASS,
  SOURCE_ITEMS,
  SURFACE_BORDER_CLASS,
  WEB_IMAGE_ITEMS,
  WEB_RESPONSE,
  WEB_SCENE_ACTIVITIES,
  WEB_SCENE_ACTIVITIES_DONE,
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
import { ToolActivityDisplay } from "@/components/chat/aiThinkingAnimation/toolActivityDisplay";

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

const TOOL_CARD_CLASS =
  "rounded-xl border border-border/60 bg-gradient-to-b from-card to-muted/60 px-3.5 py-2.5 text-xs shadow-[0_1px_3px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.08)]";

function PlanCard({ plan, done }: { plan: string; done: boolean }) {
  return (
    <div className={TOOL_CARD_CLASS}>
      <div className="flex items-center gap-2 min-w-0">
        <Route className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[12px] font-medium text-foreground/80 truncate">Planning…</span>
        <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">{plan}</span>
        <span className="ml-auto shrink-0">
          {done ? (
            <span className="text-[10px] text-emerald-400">✓</span>
          ) : (
            <span className="size-3 inline-block animate-spin rounded-full border border-muted-foreground/30 border-t-muted-foreground" />
          )}
        </span>
      </div>
    </div>
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
    getResponsiveTypingSpeed({ scene: "web", startStep: 3, target: WEB_RESPONSE, preferredSpeed: 6 }),
  );
  const chipTransition = prefersReducedMotion ? { duration: 0 } : { duration: 0.2 };
  const showSources = device !== "phone";
  const showImages = device === "desktop" ? step >= 2 : step >= 3;
  const timelineItems: Array<{ key: string; node: ReactNode }> = [];

  if (step >= 1) {
    const activities = step >= 3 ? WEB_SCENE_ACTIVITIES_DONE : WEB_SCENE_ACTIVITIES;
    timelineItems.push({
      key: "web-tool",
      node: (
        <div className={TOOL_CARD_CLASS}>
          <ToolActivityDisplay toolActivities={activities} />
          {showSources && step < 3 && (
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
        <div className={`grid gap-2 ${device === "desktop" ? "grid-cols-3" : device === "tablet" ? "grid-cols-2" : "grid-cols-1"}`}>
          {WEB_IMAGE_ITEMS.map((item) => (
            <div key={item.key} className={`relative aspect-[16/9] min-w-0 overflow-hidden rounded-xl ${PANEL_SURFACE_CLASS} ${SURFACE_BORDER_CLASS}`}>
              <div className="absolute inset-0 overflow-hidden bg-muted/30">
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  sizes={device === "desktop" ? "(max-width: 1023px) 33vw, 200px" : device === "tablet" ? "(max-width: 719px) 100vw, 220px" : "260px"}
                  quality={70}
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
      node: <ResponseBubble text={response} minHeight="min-h-[48px]" showCursor={!prefersReducedMotion} prefersReducedMotion={prefersReducedMotion} />,
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
                <TimelineItem key={item.key} itemKey={item.key} node={item.node} prefersReducedMotion={prefersReducedMotion} />
              ))}
            </AnimatePresence>
          </AutoScrollStage>
        </AssistantShell>
      </div>
    </SceneFrame>
  );
}

export function OrchestrationScene({
  step,
  sceneElapsed,
  prefersReducedMotion,
}: {
  step: number;
  sceneElapsed: number;
  prefersReducedMotion: boolean;
}) {
  const response = getTypedText(
    ORCHESTRATION_RESPONSE,
    sceneElapsed,
    getStepStart("orchestration", 7),
    getResponsiveTypingSpeed({ scene: "orchestration", startStep: 7, target: ORCHESTRATION_RESPONSE, preferredSpeed: 6 }),
  );
  const timelineItems: Array<{ key: string; node: ReactNode }> = [];

  if (step >= 1) {
    timelineItems.push({
      key: "orch-planning",
      node: <PlanCard plan="Search → scrape each → draft comparison → post to Slack" done={step >= 2} />,
    });
  }

  if (step >= 2) {
    const activities = step >= 4 ? ORCH_STEP1_DONE : ORCH_STEP1_CALLING;
    timelineItems.push({
      key: "orch-step1",
      node: (
        <div className={TOOL_CARD_CLASS}>
          <ToolActivityDisplay toolActivities={activities} />
        </div>
      ),
    });
  }

  if (step >= 4) {
    const activities = step >= 6 ? ORCH_STEP2_DONE : ORCH_STEP2_CALLING;
    timelineItems.push({
      key: "orch-step2",
      node: (
        <div className={TOOL_CARD_CLASS}>
          <ToolActivityDisplay toolActivities={activities} />
        </div>
      ),
    });
  }

  if (step >= 6) {
    const activities = step >= 7 ? ORCH_STEP3_DONE : ORCH_STEP3_CALLING;
    timelineItems.push({
      key: "orch-step3",
      node: (
        <div className={TOOL_CARD_CLASS}>
          <ToolActivityDisplay toolActivities={activities} />
        </div>
      ),
    });
  }

  if (step >= 7) {
    timelineItems.push({
      key: "orch-response",
      node: <ResponseBubble text={response} minHeight="min-h-[48px]" showCursor={!prefersReducedMotion} prefersReducedMotion={prefersReducedMotion} />,
    });
  }

  return (
    <SceneFrame title="Orchestration" caption="One prompt, executed step by step">
      <div className="flex h-full min-h-0 flex-col gap-2.5 sm:gap-3">
        <UserBubble text="Search for the top 3 AI dev tools this week, scrape each homepage, then post a comparison table to Slack." />
        <AssistantShell>
          <AutoScrollStage>
            <AnimatePresence initial={false}>
              {timelineItems.map((item) => (
                <TimelineItem key={item.key} itemKey={item.key} node={item.node} prefersReducedMotion={prefersReducedMotion} />
              ))}
            </AnimatePresence>
          </AutoScrollStage>
        </AssistantShell>
      </div>
    </SceneFrame>
  );
}

export function DeepResearchScene({
  step,
  sceneElapsed,
  prefersReducedMotion,
}: {
  step: number;
  sceneElapsed: number;
  prefersReducedMotion: boolean;
}) {
  const response = getTypedText(
    DEEP_RESEARCH_RESPONSE,
    sceneElapsed,
    getStepStart("deep-research", 7),
    getResponsiveTypingSpeed({ scene: "deep-research", startStep: 7, target: DEEP_RESEARCH_RESPONSE, preferredSpeed: 5 }),
  );
  const timelineItems: Array<{ key: string; node: ReactNode }> = [];

  if (step >= 1) {
    timelineItems.push({
      key: "dr-planning",
      node: <PlanCard plan="Benchmark accuracy → scale thresholds → self-consistency tradeoffs" done={step >= 2} />,
    });
  }

  if (step >= 2) {
    const activities = step >= 3 ? DR_SCENE_ACTIVITIES_1_DONE : DR_SCENE_ACTIVITIES_1_CALLING;
    timelineItems.push({
      key: "dr-r1",
      node: <div className={TOOL_CARD_CLASS}><ToolActivityDisplay toolActivities={activities} /></div>,
    });
  }

  if (step >= 4) {
    const activities = step >= 5 ? DR_SCENE_ACTIVITIES_2_DONE : DR_SCENE_ACTIVITIES_2_CALLING;
    timelineItems.push({
      key: "dr-r2",
      node: <div className={TOOL_CARD_CLASS}><ToolActivityDisplay toolActivities={activities} /></div>,
    });
  }

  if (step >= 6) {
    const activities = step >= 7 ? DR_SCENE_ACTIVITIES_3_DONE : DR_SCENE_ACTIVITIES_3_CALLING;
    timelineItems.push({
      key: "dr-r3",
      node: <div className={TOOL_CARD_CLASS}><ToolActivityDisplay toolActivities={activities} /></div>,
    });
  }

  if (step >= 7) {
    timelineItems.push({
      key: "dr-response",
      node: <ResponseBubble text={response} minHeight="min-h-[48px]" showCursor={!prefersReducedMotion} prefersReducedMotion={prefersReducedMotion} />,
    });
  }

  return (
    <SceneFrame title="Deep research" caption="Plans, sources, synthesizes">
      <div className="flex h-full min-h-0 flex-col gap-2.5 sm:gap-3">
        <UserBubble text="Do a deep dive on how chain-of-thought prompting affects LLM reasoning accuracy across benchmarks." />
        <AssistantShell>
          <AutoScrollStage>
            <AnimatePresence initial={false}>
              {timelineItems.map((item) => (
                <TimelineItem key={item.key} itemKey={item.key} node={item.node} prefersReducedMotion={prefersReducedMotion} />
              ))}
            </AnimatePresence>
          </AutoScrollStage>
        </AssistantShell>
      </div>
    </SceneFrame>
  );
}

