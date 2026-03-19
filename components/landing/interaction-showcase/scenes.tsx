"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { AnimatePresence, m } from "framer-motion";
import { Search } from "lucide-react";
import { CalendarIcon, DriveIcon, GmailIcon } from "@/components/icons/googleSuiteIcons";
import {
  CALENDAR_RESPONSE,
  CHIP_SURFACE_CLASS,
  DRIVE_RESPONSE,
  GMAIL_RESPONSE,
  PANEL_SURFACE_CLASS,
  RESEARCH_REPORT,
  RESEARCH_STEPS,
  SCENE_TRANSITION,
  SOFT_BORDER_CLASS,
  SOURCE_ITEMS,
  SUBTLE_PANEL_SURFACE_CLASS,
  SURFACE_BORDER_CLASS,
  WEB_IMAGE_ITEMS,
  WEB_RESPONSE,
} from "@/components/landing/interaction-showcase/constants";
import {
  AssistantShell,
  AutoScrollStage,
  ProcessMarker,
  ResponseBubble,
  SceneFrame,
  ServiceAction,
  UserBubble,
} from "@/components/landing/interaction-showcase/primitives";
import {
  getResearchStepState,
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

export function DeepResearchScene({
  step,
  sceneElapsed,
  prefersReducedMotion,
}: {
  step: number;
  sceneElapsed: number;
  prefersReducedMotion: boolean;
}) {
  const reportStartStep = 7;
  const report = getTypedText(
    RESEARCH_REPORT,
    sceneElapsed,
    getStepStart("research", reportStartStep),
    getResponsiveTypingSpeed({
      scene: "research",
      startStep: reportStartStep,
      target: RESEARCH_REPORT,
      preferredSpeed: 2.8,
    }),
  );
  const visibleSteps = Math.min(step, RESEARCH_STEPS.length);
  const reportVisible = step >= 7;
  const motionProps = getMotionProps(prefersReducedMotion);

  return (
    <SceneFrame title="Deep research" caption="Multi-step research with quality control">
      <div className="flex h-full min-h-0 flex-col gap-2.5 sm:gap-3">
        <UserBubble text="Do a comprehensive deep research run on how AI search products are repositioning for enterprise adoption." />

        <AssistantShell>
          <AutoScrollStage>
            <AnimatePresence initial={false}>
              {visibleSteps > 0 && (
                <m.div
                  key="research-pipeline"
                  {...motionProps}
                  className={`overflow-hidden rounded-2xl px-3 py-3 ${PANEL_SURFACE_CLASS} ${SURFACE_BORDER_CLASS}`}
                >
                  <div className="flex flex-col gap-1.5">
                    {RESEARCH_STEPS.slice(0, visibleSteps).map((item, index) => {
                      const state = getResearchStepState(step, index);

                      return (
                        <div
                          key={item.key}
                          className={`rounded-xl border px-3 py-2 ${
                            state === "current"
                              ? `border-border ${CHIP_SURFACE_CLASS}`
                              : state === "completed"
                                ? `border-border/50 ${SUBTLE_PANEL_SURFACE_CLASS}`
                                : `border-border/40 ${PANEL_SURFACE_CLASS}`
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <ProcessMarker state={state} prefersReducedMotion={prefersReducedMotion} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-[11px] font-medium text-foreground sm:text-[12px]">{item.title}</p>
                                {item.key === "evaluator" && step >= 5 && (
                                  <span className="rounded-md border border-emerald-500/18 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:border-emerald-400/[0.18] dark:text-emerald-300 sm:text-[11px]">
                                    91%
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-[10px] leading-[1.05rem] text-muted-foreground dark:text-white/[0.54] sm:text-[11px] sm:leading-[1.1rem]">
                                {item.detail}
                              </p>
                              {item.key === "worker" && step >= 3 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {["packaging shifts", "review workflows", "trust signals"].map((task) => (
                                    <span
                                      key={task}
                                      className={`rounded-md px-1.5 py-0.5 text-[9px] text-muted-foreground sm:text-[10px] ${CHIP_SURFACE_CLASS} ${SOFT_BORDER_CLASS}`}
                                    >
                                      {task}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </m.div>
              )}

              {reportVisible && (
                <TimelineItem
                  itemKey="research-report"
                  node={
                    <ResponseBubble
                      text={report}
                      minHeight="min-h-[148px]"
                      showCursor={!prefersReducedMotion}
                      prefersReducedMotion={prefersReducedMotion}
                    />
                  }
                  prefersReducedMotion={prefersReducedMotion}
                />
              )}
            </AnimatePresence>
          </AutoScrollStage>
        </AssistantShell>
      </div>
    </SceneFrame>
  );
}

export function GoogleWorkspaceScene({
  step,
  sceneElapsed,
  prefersReducedMotion,
}: {
  step: number;
  sceneElapsed: number;
  prefersReducedMotion: boolean;
}) {
  const gmailReply = getTypedText(
    GMAIL_RESPONSE,
    sceneElapsed,
    getStepStart("workspace", 2),
    getResponsiveTypingSpeed({
      scene: "workspace",
      startStep: 2,
      target: GMAIL_RESPONSE,
      preferredSpeed: 6,
    }),
  );
  const driveReply = getTypedText(
    DRIVE_RESPONSE,
    sceneElapsed,
    getStepStart("workspace", 5),
    getResponsiveTypingSpeed({
      scene: "workspace",
      startStep: 5,
      target: DRIVE_RESPONSE,
      preferredSpeed: 6,
    }),
  );
  const calendarReply = getTypedText(
    CALENDAR_RESPONSE,
    sceneElapsed,
    getStepStart("workspace", 8),
    getResponsiveTypingSpeed({
      scene: "workspace",
      startStep: 8,
      target: CALENDAR_RESPONSE,
      preferredSpeed: 6,
      endHold: 180,
    }),
  );
  const timelineItems: Array<{ key: string; node: ReactNode }> = [
    {
      key: "w-user-0",
      node: <UserBubble text="Reply to Maya and confirm I can send the updated portfolio case study tonight." />,
    },
  ];

  if (step >= 1) {
    timelineItems.push({
      key: "w-gmail-action",
      node: (
        <ServiceAction
          icon={<GmailIcon className="size-4" />}
          service="Gmail"
          action="gmail_search -> gmail_reply"
          status={step >= 2 ? "completed" : "current"}
          statusLabel={step >= 2 ? "Done" : "Drafting"}
        />
      ),
    });
  }

  if (step >= 2) {
    timelineItems.push({
      key: "w-gmail-reply",
      node: (
        <ResponseBubble
          text={gmailReply}
          minHeight="min-h-[72px]"
          showCursor={step >= 2 && step < 5 && !prefersReducedMotion}
          prefersReducedMotion={prefersReducedMotion}
        />
      ),
    });
  }

  if (step >= 3) {
    timelineItems.push({
      key: "w-user-1",
      node: <UserBubble text="Find the latest creator launch brief in Drive." />,
    });
  }

  if (step >= 4) {
    timelineItems.push({
      key: "w-drive-action",
      node: (
        <ServiceAction
          icon={<DriveIcon className="size-4" />}
          service="Drive"
          action="drive_search -> drive_read_file"
          status={step >= 5 ? "completed" : "current"}
          statusLabel={step >= 5 ? "Done" : "Reviewing"}
        />
      ),
    });
  }

  if (step >= 5) {
    timelineItems.push({
      key: "w-drive-reply",
      node: (
        <ResponseBubble
          text={driveReply}
          minHeight="min-h-[72px]"
          showCursor={step >= 5 && step < 8 && !prefersReducedMotion}
          prefersReducedMotion={prefersReducedMotion}
        />
      ),
    });
  }

  if (step >= 6) {
    timelineItems.push({
      key: "w-user-2",
      node: <UserBubble text="Set up a portfolio review with Jordan next Tuesday at 6 PM." />,
    });
  }

  if (step >= 7) {
    timelineItems.push({
      key: "w-calendar-action",
      node: (
        <ServiceAction
          icon={<CalendarIcon className="size-4" />}
          service="Calendar"
          action="calendar_list_events -> calendar_create_event"
          status={step >= 8 ? "completed" : "current"}
          statusLabel={step >= 8 ? "Done" : "Scheduling"}
        />
      ),
    });
  }

  if (step >= 8) {
    timelineItems.push({
      key: "w-calendar-reply",
      node: (
        <ResponseBubble
          text={calendarReply}
          minHeight="min-h-[72px]"
          showCursor={!prefersReducedMotion}
          prefersReducedMotion={prefersReducedMotion}
        />
      ),
    });
  }

  return (
    <SceneFrame title="Google Workspace" caption="Gmail, Drive, and Calendar in one flow">
      <div className="flex h-full min-h-0 flex-col gap-2.5 sm:gap-3">
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
      </div>
    </SceneFrame>
  );
}
