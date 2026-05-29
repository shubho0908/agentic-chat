import type { SceneKind } from "@/components/landing/interaction-showcase/types";

export const SCENE_ORDER: SceneKind[] = ["web", "workspace"];
export const SCENE_TRANSITION = { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const };

export const SOURCE_ITEMS = ["Reuters", "Perplexity blog", "The Information"];

export const WEB_IMAGE_ITEMS = [
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

export const WEB_RESPONSE =
  "Three launch patterns stood out this week. OpenAI pushed search closer to the default assistant flow, Anthropic kept leaning on evidence and task completion, and Perplexity stayed focused on speed. The common thread is simple: people want search that can pull screenshots, product pages, and source context into one answer without making them hop across tabs.";

export const GMAIL_RESPONSE =
  "I found Maya's latest thread, drafted the reply, and tightened the timing so it reads like a clear next step instead of a soft maybe.";

export const DRIVE_RESPONSE =
  "The launch brief is in Drive under Brand / Launch Assets. I checked the latest version and the notes line up with the rollout plan, so this looks like the right file to share.";

export const CALENDAR_RESPONSE =
  "Jordan is free next Tuesday at 6 PM, so I set up the review, added a short agenda, and kept the title easy to scan in a crowded calendar.";

export const SCENE_DURATIONS: Record<SceneKind, number[]> = {
  web: [900, 2000, 1200, 2800, 2200],
  workspace: [850, 1000, 2900, 850, 1000, 3000, 850, 1000, 3200, 1800],
};

export const FRAME_SURFACE_CLASS =
  "bg-[linear-gradient(180deg,rgba(247,248,251,0.94),rgba(239,242,247,0.98))] dark:bg-[linear-gradient(180deg,rgba(16,18,23,0.985),rgba(8,10,14,0.995))] backdrop-blur-xl";
export const VIEWPORT_SURFACE_CLASS =
  "bg-[linear-gradient(180deg,rgba(254,254,255,0.99),rgba(249,250,252,0.99))] dark:bg-[linear-gradient(180deg,rgba(11,13,17,0.998),rgba(6,8,11,0.998))]";
export const PANEL_SURFACE_CLASS =
  "bg-background/92 dark:bg-[linear-gradient(180deg,rgba(20,22,28,0.985),rgba(14,16,21,0.99))] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]";
export const SUBTLE_PANEL_SURFACE_CLASS =
  "bg-muted/42 dark:bg-[linear-gradient(180deg,rgba(24,27,33,0.98),rgba(17,19,24,0.99))] shadow-[inset_0_1px_0_rgba(255,255,255,0.42)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
export const CHIP_SURFACE_CLASS =
  "bg-muted/62 dark:bg-[linear-gradient(180deg,rgba(30,33,40,0.98),rgba(22,25,30,0.99))]";
export const FRAME_RING_CLASS =
  "ring-1 ring-black/[0.08] shadow-[0_24px_60px_rgba(15,23,42,0.08)] dark:ring-white/[0.14] dark:shadow-[0_30px_90px_rgba(0,0,0,0.58)]";
export const SURFACE_BORDER_CLASS = "border border-black/[0.07] dark:border-white/[0.11]";
export const SOFT_BORDER_CLASS = "border border-black/[0.06] dark:border-white/[0.08]";
export const DIVIDER_CLASS = "border-black/[0.08] dark:border-white/[0.07]";

export const SCENE_TOTALS = SCENE_ORDER.reduce(
  (totals, scene) => {
    totals[scene] = SCENE_DURATIONS[scene].reduce((sum, duration) => sum + duration, 0);
    return totals;
  },
  {} as Record<SceneKind, number>,
);

export const LOOP_DURATION = SCENE_ORDER.reduce((sum, scene) => sum + SCENE_TOTALS[scene], 0);
