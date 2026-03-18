"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Globe,
  Search,
  Telescope,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GoogleIcon } from "@/components/icons/googleIcon";
import { OpenAIIcon } from "@/components/icons/openaiIcon";
import { CalendarIcon, DriveIcon, GmailIcon } from "@/components/icons/googleSuiteIcons";

type DeviceKind = "desktop" | "tablet" | "phone";
type SceneKind = "web" | "research" | "workspace";
type ProcessState = "completed" | "current" | "pending";

interface ResearchStep {
  key: string;
  title: string;
  detail: string;
}

interface TimelinePosition {
  cycle: number;
  scene: SceneKind;
  sceneIndex: number;
  sceneElapsed: number;
  step: number;
  stepElapsed: number;
}

const SCENE_ORDER: SceneKind[] = ["web", "research", "workspace"];
const SCENE_TRANSITION = { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const };
const SOURCE_ITEMS = ["Reuters", "Perplexity blog", "The Information"];
const WEB_IMAGE_ITEMS = [
  {
    key: "search-entry",
    title: "ChatGPT search entry",
    source: "OpenAI",
    src: "/landing/openai-search-ui.webp",
    alt: "OpenAI ChatGPT search entry interface.",
  },
  {
    key: "enterprise-visual",
    title: "Enterprise knowledge view",
    source: "Anthropic",
    src: "/landing/anthropic-enterprise.webp",
    alt: "Anthropic enterprise interface visual.",
  },
  {
    key: "citations-panel",
    title: "Citations sidebar",
    source: "OpenAI",
    src: "/landing/openai-sources.webp",
    alt: "OpenAI search results with a citations sidebar.",
  },
] as const;

const RESEARCH_STEPS: ResearchStep[] = [
  {
    key: "gate",
    title: "Gate",
    detail: "Checks whether the request needs a real research run instead of a direct answer.",
  },
  {
    key: "planner",
    title: "Planner",
    detail: "Breaks the topic into concrete research questions and assigns a sequence.",
  },
  {
    key: "worker",
    title: "Worker",
    detail: "Runs the research tasks one by one and gathers evidence for each question.",
  },
  {
    key: "aggregator",
    title: "Aggregator",
    detail: "Merges overlapping findings into one coherent draft with the strongest signals.",
  },
  {
    key: "evaluator",
    title: "Evaluator",
    detail: "Grades the draft for coverage, quality, and whether it meets the standard.",
  },
  {
    key: "formatter",
    title: "Formatter",
    detail: "Turns the research into a readable response with citations and follow-ups.",
  },
];

const WEB_RESPONSE =
  "Three launch patterns matter this week. OpenAI pushed search closer to a default assistant behavior, Anthropic framed retrieval around trustworthy task completion, and Perplexity kept leaning into speed plus visual evidence. Across the strongest source cluster, the common signal is not just 'better answers' but faster multimodal discovery: search that can pull screenshots, product UI, and market context into one response without making the user hunt across tabs. The product takeaway is that visual retrieval is becoming part of the baseline search experience rather than a premium, edge-case feature.";

const RESEARCH_REPORT = `Executive summary
Enterprise AI search is moving away from "chat with files" positioning and toward opinionated research systems that can plan, verify, synthesize, and defend an answer. The strongest products are not selling raw model access. They are selling confidence, faster review loops, and a shorter path from question to decision.

Core market shift
Leaders are absorbing more of the workflow stack. Retrieval, ranking, evaluation, and final answer shaping are being presented as one product experience instead of separate tools that an operations team has to stitch together manually.

Competitive pattern
The category is converging on a common promise: fewer tabs, fewer handoffs, and fewer moments where a human has to manually reconcile conflicting evidence. Product language is becoming more operational and less experimental. Instead of highlighting raw model capability, vendors are highlighting research flows, evaluation layers, and outputs that are closer to an analyst-ready brief.

What buyers now care about
1. Evidence quality: teams want citations, source visibility, and cleaner provenance.
2. Review speed: answers need to arrive in a form that is ready for executive review, not just exploration.
3. Operational trust: buyers prefer systems that expose evaluation and guardrails before broad rollout.

Why this matters
This changes the buying conversation. Vendors win less on model novelty and more on whether the product can reliably reduce synthesis time for analysts, strategy teams, and operators handling messy internal knowledge.

Implications for positioning
Position against fragmented research workflows rather than against generic chat interfaces. Emphasize research orchestration, stronger judgment layers, and response quality that holds up under review.

Where products are moving next
Expect more visible planning steps, tighter reviewer controls, and clearer quality signals in the interface itself. Buyers increasingly want to see what the system searched, which sources were weighted more heavily, and where uncertainty still remains. The winning products will make that judgment process legible without turning the interface into a dashboard full of noise.

Recommended move
Frame the product as a research operating system: one surface that gathers evidence, resolves overlap, scores quality, and produces a board-ready answer with citations and follow-up prompts.

Recommendation for launch narrative
Lead with decision support instead of model power. The strongest messaging frame is that the system helps a team move from messy questions to defendable conclusions quickly, with enough evidence quality to support real operational use. That framing better matches how enterprise buyers describe the problem internally.

Execution risks
The main risk is overclaiming autonomy. If the product sounds like it replaces judgment, trust drops. If it sounds like it structures evidence, flags uncertainty, and speeds up review, trust rises. The experience should feel like a disciplined research partner, not a black-box oracle.

Execution note
The winning UX pattern is not a louder interface. It is a calmer one that makes the system's judgment legible: what was searched, what was ignored, what survived evaluation, and why the final recommendation deserves trust.`;

const GMAIL_RESPONSE =
  "I found Maya's latest thread, drafted the reply, and confirmed that we can send the updated portfolio case study tonight. I tightened the wording, made the timeline clearer, and kept the tone confident so it reads like a solid follow-through instead of a vague maybe.";
const DRIVE_RESPONSE =
  "The latest creator launch brief is in Drive under Brand / Launch Assets. I checked the newest version, confirmed the rollout notes are up to date, and the talking points now match the latest announcement plan, so this looks like the right file to share.";
const CALENDAR_RESPONSE =
  "Jordan is free next Tuesday at 6 PM, so I set up the portfolio review, added a short agenda, and made the title easy to scan in a busy calendar. The invite now includes the time, review focus, and enough context for both sides to show up prepared.";

const SCENE_DURATIONS: Record<SceneKind, number[]> = {
  web: [900, 2000, 1200, 2800, 2200],
  research: [1000, 900, 1000, 1400, 1000, 950, 900, 4800, 2600],
  workspace: [850, 1000, 2900, 850, 1000, 3000, 850, 1000, 3200, 1800],
};

const FRAME_SURFACE_CLASS =
  "bg-[linear-gradient(180deg,rgba(247,248,251,0.94),rgba(239,242,247,0.98))] dark:bg-[linear-gradient(180deg,rgba(16,18,23,0.985),rgba(8,10,14,0.995))] backdrop-blur-xl";
const VIEWPORT_SURFACE_CLASS =
  "bg-[linear-gradient(180deg,rgba(254,254,255,0.99),rgba(249,250,252,0.99))] dark:bg-[linear-gradient(180deg,rgba(11,13,17,0.998),rgba(6,8,11,0.998))]";
const PANEL_SURFACE_CLASS =
  "bg-background/92 dark:bg-[linear-gradient(180deg,rgba(20,22,28,0.985),rgba(14,16,21,0.99))] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]";
const SUBTLE_PANEL_SURFACE_CLASS =
  "bg-muted/42 dark:bg-[linear-gradient(180deg,rgba(24,27,33,0.98),rgba(17,19,24,0.99))] shadow-[inset_0_1px_0_rgba(255,255,255,0.42)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
const CHIP_SURFACE_CLASS =
  "bg-muted/62 dark:bg-[linear-gradient(180deg,rgba(30,33,40,0.98),rgba(22,25,30,0.99))]";
const FRAME_RING_CLASS =
  "ring-1 ring-black/[0.08] shadow-[0_24px_60px_rgba(15,23,42,0.08)] dark:ring-white/[0.14] dark:shadow-[0_30px_90px_rgba(0,0,0,0.58)]";
const SURFACE_BORDER_CLASS = "border border-black/[0.07] dark:border-white/[0.11]";
const SOFT_BORDER_CLASS = "border border-black/[0.06] dark:border-white/[0.08]";
const DIVIDER_CLASS = "border-black/[0.08] dark:border-white/[0.07]";

const SCENE_TOTALS = SCENE_ORDER.reduce(
  (totals, scene) => {
    totals[scene] = SCENE_DURATIONS[scene].reduce((sum, duration) => sum + duration, 0);
    return totals;
  },
  {} as Record<SceneKind, number>,
);

const LOOP_DURATION = SCENE_ORDER.reduce((sum, scene) => sum + SCENE_TOTALS[scene], 0);

function useShowcaseWidth(targetRef: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(700);

  useEffect(() => {
    const node = targetRef.current;

    if (!node) {
      return;
    }

    const updateWidth = () => {
      setWidth(node.getBoundingClientRect().width);
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [targetRef]);

  return width;
}

function useViewportWidth() {
  const [width, setWidth] = useState(1280);

  useEffect(() => {
    const updateWidth = () => {
      setWidth(window.innerWidth);
    };

    updateWidth();
    window.addEventListener("resize", updateWidth, { passive: true });

    return () => {
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  return width;
}

function useAnimationClock() {
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    let animationFrame = 0;

    const updateElapsed = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const startTime = startTimeRef.current;
      setElapsed(() => timestamp - startTime);
      animationFrame = window.requestAnimationFrame(updateElapsed);
    };

    animationFrame = window.requestAnimationFrame(updateElapsed);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return elapsed;
}

function getTimelinePosition(elapsed: number): TimelinePosition {
  if (LOOP_DURATION === 0) {
    return {
      cycle: 0,
      scene: "web",
      sceneIndex: 0,
      sceneElapsed: 0,
      step: 0,
      stepElapsed: 0,
    };
  }

  const cycle = Math.floor(elapsed / LOOP_DURATION);
  let loopCursor = elapsed % LOOP_DURATION;

  for (let sceneIndex = 0; sceneIndex < SCENE_ORDER.length; sceneIndex += 1) {
    const scene = SCENE_ORDER[sceneIndex];
    const sceneDuration = SCENE_TOTALS[scene];

    if (loopCursor < sceneDuration) {
      let sceneCursor = loopCursor;

      for (let stepIndex = 0; stepIndex < SCENE_DURATIONS[scene].length; stepIndex += 1) {
        const stepDuration = SCENE_DURATIONS[scene][stepIndex];

        if (sceneCursor < stepDuration) {
          return {
            cycle,
            scene,
            sceneIndex,
            sceneElapsed: loopCursor,
            step: stepIndex,
            stepElapsed: sceneCursor,
          };
        }

        sceneCursor -= stepDuration;
      }

      const finalStep = SCENE_DURATIONS[scene].length - 1;

      return {
        cycle,
        scene,
        sceneIndex,
        sceneElapsed: loopCursor,
        step: finalStep,
        stepElapsed: SCENE_DURATIONS[scene][finalStep],
      };
    }

    loopCursor -= sceneDuration;
  }

  return {
    cycle: 0,
    scene: "web",
    sceneIndex: 0,
    sceneElapsed: 0,
    step: 0,
    stepElapsed: 0,
  };
}

function getStepStart(scene: SceneKind, step: number) {
  return SCENE_DURATIONS[scene]
    .slice(0, step)
    .reduce((sum, duration) => sum + duration, 0);
}

function getSceneLoopOffset(targetScene: SceneKind) {
  return SCENE_ORDER.slice(0, SCENE_ORDER.indexOf(targetScene)).reduce(
    (sum, scene) => sum + SCENE_TOTALS[scene],
    0,
  );
}

function getRemainingSceneDuration(scene: SceneKind, startStep: number) {
  return SCENE_DURATIONS[scene]
    .slice(startStep)
    .reduce((sum, duration) => sum + duration, 0);
}

function getResponsiveTypingSpeed({
  scene,
  startStep,
  target,
  preferredSpeed,
  endHold = 420,
}: {
  scene: SceneKind;
  startStep: number;
  target: string;
  preferredSpeed: number;
  endHold?: number;
}) {
  const availableDuration = Math.max(180, getRemainingSceneDuration(scene, startStep) - endHold);
  const maxSafeSpeed = availableDuration / Math.max(target.length, 1);

  return Math.min(preferredSpeed, maxSafeSpeed);
}

function getTypedText(target: string, sceneElapsed: number, startAt: number, speed: number) {
  if (sceneElapsed < startAt) {
    return "";
  }

  const visibleCharacters = Math.floor((sceneElapsed - startAt) / speed);

  return target.slice(0, Math.min(target.length, visibleCharacters));
}

function getDeviceKind(showcaseWidth: number, viewportWidth: number): DeviceKind {
  if (showcaseWidth >= 620) {
    return "desktop";
  }

  // Only use phone chrome on genuinely small screens.
  if (viewportWidth < 640 && showcaseWidth < 430) {
    return "phone";
  }

  if (showcaseWidth >= 430) {
    return "tablet";
  }

  if (viewportWidth >= 640) {
    return "tablet";
  }

  return "phone";
}

function getSceneTitle(scene: SceneKind) {
  if (scene === "research") {
    return "Deep research";
  }

  if (scene === "workspace") {
    return "Google Workspace";
  }

  return "Web search";
}

export function InteractionShowcase() {
  const showcaseRef = useRef<HTMLDivElement>(null);
  const showcaseWidth = useShowcaseWidth(showcaseRef);
  const viewportWidth = useViewportWidth();
  const device = getDeviceKind(showcaseWidth, viewportWidth);
  const elapsed = useAnimationClock();
  const [timelineAnchor, setTimelineAnchor] = useState({ elapsedAtAnchor: 0, timelineElapsed: 0 });
  const effectiveElapsed = timelineAnchor.timelineElapsed + (elapsed - timelineAnchor.elapsedAtAnchor);
  const timeline = getTimelinePosition(effectiveElapsed);
  const { cycle, scene, step, sceneElapsed } = timeline;

  const navigateScene = (direction: -1 | 1) => {
    const nextSceneIndex =
      (timeline.sceneIndex + direction + SCENE_ORDER.length) % SCENE_ORDER.length;
    const nextScene = SCENE_ORDER[nextSceneIndex];

    setTimelineAnchor({
      elapsedAtAnchor: elapsed,
      timelineElapsed: getSceneLoopOffset(nextScene),
    });
  };

  return (
    <div ref={showcaseRef} className="relative mx-auto w-full max-w-[700px]">
      <DeviceShell
        device={device}
        scene={scene}
        chromeTitle={getSceneTitle(scene)}
        onPreviousScene={() => navigateScene(-1)}
        onNextScene={() => navigateScene(1)}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`${cycle}-${scene}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -18, filter: "blur(6px)" }}
            transition={SCENE_TRANSITION}
            className="flex min-h-0 flex-1 flex-col"
          >
            {scene === "web" && (
              <WebSearchScene
                device={device}
                step={step}
                sceneElapsed={sceneElapsed}
              />
            )}
            {scene === "research" && (
              <DeepResearchScene
                step={step}
                sceneElapsed={sceneElapsed}
              />
            )}
            {scene === "workspace" && (
              <GoogleWorkspaceScene
                step={step}
                sceneElapsed={sceneElapsed}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </DeviceShell>
    </div>
  );
}

function DeviceShell({
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
  children: React.ReactNode;
}) {
  if (device === "phone") {
    return (
      <div className="mx-auto w-full max-w-[318px]">
        <div className={`relative aspect-[10/19] overflow-hidden rounded-[34px] bg-[#f5f6f9] p-[9px] shadow-sm dark:bg-[#07080b] ${FRAME_RING_CLASS}`}>
          <div className="pointer-events-none absolute inset-[1px] rounded-[33px] border border-black/[0.08] dark:border-white/[0.08]" />
          <div className="absolute left-1/2 top-[19px] z-20 h-[8px] w-[58px] -translate-x-1/2 rounded-full bg-black/12 dark:bg-white/12" />
          <div className={`relative flex h-full flex-col overflow-hidden rounded-[26px] ${VIEWPORT_SURFACE_CLASS} ${FRAME_RING_CLASS}`}>
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
      <div className="mx-auto w-full max-w-[470px]">
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
    <div className="w-full">
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
  const toolbarHeight = isPhone ? "h-[74px]" : "h-14";
  const toolbarRadius =
    device === "phone"
      ? "rounded-t-[26px]"
      : device === "tablet"
        ? "rounded-t-[22px]"
        : "rounded-t-[16px]";
  const omnibarClass =
    device === "phone"
      ? "h-8 max-w-[224px] rounded-full px-3"
      : device === "tablet"
        ? "h-9 max-w-[280px] rounded-full px-3.5"
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
          isPhone ? "items-end justify-center pb-3" : "items-center"
        }`}
      >
        {!isPhone ? (
          <div className="grid w-full grid-cols-[auto,minmax(0,1fr),auto] items-center gap-3">
            <ChromeUtilityRail
              onPreviousScene={onPreviousScene}
              onNextScene={onNextScene}
            />
            <div className="flex min-w-0 justify-center">
              <div
                className={`flex w-full items-center justify-center gap-2 ${omnibarSurfaceClass} ${omnibarClass}`}
              >
                {omnibarIcon}
                <span className="truncate text-[11px] font-medium tracking-[0.09em] text-foreground/52 uppercase dark:text-white/[0.62]">
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
              <span className="truncate text-[11px] font-medium tracking-[0.09em] text-foreground/52 uppercase dark:text-white/[0.62]">
                {chromeTitle}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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

function SceneFrame({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${VIEWPORT_SURFACE_CLASS}`}>
      <div
        className={`shrink-0 flex items-start justify-between border-b px-3 py-3 sm:px-4 ${DIVIDER_CLASS}`}
      >
        <div>
          <p className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground/80 dark:text-white/[0.52]">{caption}</p>
          <h3 className="mt-1 text-[17px] font-medium text-foreground">{title}</h3>
        </div>
      </div>

      <div className="min-h-0 max-h-full flex-1 overflow-hidden p-2.5 sm:p-3">
        {children}
      </div>
    </div>
  );
}

function AutoScrollStage({ children }: { children: React.ReactNode }) {
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

    const observer = new ResizeObserver(() => {
      scrollToLatest();
    });

    observer.observe(content);
    observer.observe(viewport);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [children]);

  return (
    <div
      ref={viewportRef}
      className="scrollbar-hide relative h-full min-h-0 overflow-y-auto overflow-x-hidden"
    >
      <div ref={contentRef} className="flex min-h-full flex-col gap-2.5">
        {children}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] rounded-[18px] rounded-br-[6px] border border-chat-user-bubble-border bg-chat-user-bubble px-3 py-2 text-[12.5px] leading-[1.3rem] text-foreground whitespace-pre-wrap break-words shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] dark:border-white/[0.12] dark:bg-[#222329] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:max-w-[78%] sm:text-[13px]">
        {text}
      </div>
    </div>
  );
}

function AssistantShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <div className="relative flex size-6 items-center justify-center overflow-hidden rounded-full border border-black/5 bg-white shadow-sm dark:border-white/[0.14] dark:bg-[#14161a] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <OpenAIIcon className="size-3 text-black dark:text-primary" />
        </div>
        <span className="text-[13px] font-semibold tracking-tight text-muted-foreground dark:text-white/[0.68]">
          Ai assistant
        </span>
      </div>
      <div className="min-h-0 flex-1 pl-1">{children}</div>
    </div>
  );
}

function ResponseBubble({
  text,
  minHeight = "min-h-[58px]",
  showCursor = false,
}: {
  text: string;
  minHeight?: string;
  showCursor?: boolean;
}) {
  return (
    <div className={`min-w-0 ${minHeight}`}>
      <p className="whitespace-pre-line text-[12px] leading-[1.35rem] text-foreground sm:text-[12.5px]">
        {text}
        {showCursor && text.length > 0 && (
          <motion.span
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

function WebSearchScene({
  device,
  step,
  sceneElapsed,
}: {
  device: DeviceKind;
  step: number;
  sceneElapsed: number;
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
  const showSources = device !== "phone";
  const showImages = device === "desktop" ? step >= 2 : step >= 3;
  const timelineItems: Array<{ key: string; node: React.ReactNode }> = [];

  if (step >= 1) {
    timelineItems.push({
      key: "web-searching",
      node: (
        <div className={`rounded-xl px-3 py-2.5 ${PANEL_SURFACE_CLASS} ${SURFACE_BORDER_CLASS}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              <Search className="size-3.5 text-sky-400" />
              Searching the web
            </div>
            <span className="text-[11px] text-muted-foreground dark:text-white/[0.5]">2.0s</span>
          </div>
          {showSources && (
            <div className="mt-2 flex flex-wrap gap-2">
              {SOURCE_ITEMS.map((source, index) => (
                <motion.span
                  key={source}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.15 + 0.12 }}
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-medium text-muted-foreground/90 ${CHIP_SURFACE_CLASS} ${SOFT_BORDER_CLASS}`}
                >
                  {source}
                </motion.span>
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
                    <p className="truncate text-[10px] font-medium text-white">{item.title}</p>
                    <p className="truncate text-[9px] text-white/70">{item.source}</p>
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
      node: <ResponseBubble text={response} minHeight="min-h-[48px]" showCursor />,
    });
  }

  return (
    <SceneFrame title="Web search" caption="Searches, verifies, then answers">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <UserBubble text="Find the most important product launches in AI search this week and show the strongest visuals too." />

        <AssistantShell>
          <AutoScrollStage>
            <AnimatePresence initial={false}>
              {timelineItems.map((item) => (
                <motion.div
                  key={item.key}
                  initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -10, filter: "blur(8px)" }}
                  transition={SCENE_TRANSITION}
                >
                  {item.node}
                </motion.div>
              ))}
            </AnimatePresence>
          </AutoScrollStage>
        </AssistantShell>
      </div>
    </SceneFrame>
  );
}

function DeepResearchScene({
  step,
  sceneElapsed,
}: {
  step: number;
  sceneElapsed: number;
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

  return (
    <SceneFrame title="Deep research" caption="Multi-step research with quality control">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <UserBubble text="Do a comprehensive deep research run on how AI search products are repositioning for enterprise adoption." />

        <AssistantShell>
          <AutoScrollStage>
            <AnimatePresence initial={false}>
              {visibleSteps > 0 && (
                <motion.div
                  key="research-pipeline"
                  initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={SCENE_TRANSITION}
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
                            <ProcessMarker state={state} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-[12px] font-medium text-foreground">{item.title}</p>
                                {item.key === "evaluator" && step >= 5 && (
                                  <span className="rounded-md border border-emerald-500/18 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:border-emerald-400/[0.18] dark:text-emerald-300">
                                    91%
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-[11px] leading-[1.1rem] text-muted-foreground dark:text-white/[0.54]">
                                {item.detail}
                              </p>
                              {item.key === "worker" && step >= 3 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {["packaging shifts", "review workflows", "trust signals"].map((task) => (
                                    <span
                                      key={task}
                                      className={`rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground ${CHIP_SURFACE_CLASS} ${SOFT_BORDER_CLASS}`}
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
                </motion.div>
              )}

              {reportVisible && (
                <motion.div
                  key="research-report"
                  initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={SCENE_TRANSITION}
                >
                  <ResponseBubble text={report} minHeight="min-h-[148px]" showCursor />
                </motion.div>
              )}
            </AnimatePresence>
          </AutoScrollStage>
        </AssistantShell>
      </div>
    </SceneFrame>
  );
}

function GoogleWorkspaceScene({
  step,
  sceneElapsed,
}: {
  step: number;
  sceneElapsed: number;
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
  const timelineItems: Array<{ key: string; node: React.ReactNode }> = [];

  if (step >= 0) {
    timelineItems.push({
      key: "w-user-0",
      node: <UserBubble text="Reply to Maya and confirm I can send the updated portfolio case study tonight." />,
    });
  }

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
      node: <ResponseBubble text={gmailReply} minHeight="min-h-[72px]" showCursor={step >= 2 && step < 5} />,
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
      node: <ResponseBubble text={driveReply} minHeight="min-h-[72px]" showCursor={step >= 5 && step < 8} />,
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
      node: <ResponseBubble text={calendarReply} minHeight="min-h-[72px]" showCursor={step >= 8} />,
    });
  }

  return (
    <SceneFrame title="Google Workspace" caption="Gmail, Drive, and Calendar in one flow">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <AutoScrollStage>
          <AnimatePresence initial={false}>
            {timelineItems.map((item) => (
              <motion.div
                key={item.key}
                initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -10, filter: "blur(8px)" }}
                transition={SCENE_TRANSITION}
              >
                {item.node}
              </motion.div>
            ))}
          </AnimatePresence>
        </AutoScrollStage>
      </div>
    </SceneFrame>
  );
}

function ServiceAction({
  icon,
  service,
  action,
  status,
  statusLabel,
}: {
  icon: React.ReactNode;
  service: string;
  action: string;
  status: "current" | "completed";
  statusLabel: string;
}) {
  return (
    <div className="flex justify-start">
      <div
        className={`w-fit max-w-[92%] rounded-xl px-2.5 py-2 sm:max-w-[84%] ${SUBTLE_PANEL_SURFACE_CLASS} ${SURFACE_BORDER_CLASS}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className={`flex size-6 shrink-0 items-center justify-center rounded-lg text-foreground ${CHIP_SURFACE_CLASS} ${SOFT_BORDER_CLASS}`}>
              {icon}
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-foreground">{service}</p>
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

function ProcessMarker({ state }: { state: ProcessState }) {
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
        <motion.div
          animate={{ scale: [0.8, 1, 0.8], opacity: [0.6, 1, 0.6] }}
          transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.2 }}
          className="size-2 rounded-full bg-current"
        />
      </div>
    );
  }

  return (
      <div className={`mt-0.5 flex size-5 items-center justify-center rounded-full bg-background dark:bg-[#121418] ${SOFT_BORDER_CLASS}`}>
        <div className="size-1.5 rounded-full bg-muted-foreground/40" />
      </div>
  );
}

function getResearchStepState(step: number, index: number): ProcessState {
  const stagePointer = step - 1;

  if (stagePointer < index) {
    return "pending";
  }

  if (stagePointer === index && step < 7) {
    return "current";
  }

  return "completed";
}
