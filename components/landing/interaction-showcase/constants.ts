import type { ResearchStep, SceneKind } from "@/components/landing/interaction-showcase/types";

export const SCENE_ORDER: SceneKind[] = ["web", "research", "workspace"];
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

export const RESEARCH_STEPS: ResearchStep[] = [
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

export const WEB_RESPONSE =
  "Three launch patterns stood out this week. OpenAI pushed search closer to the default assistant flow, Anthropic kept leaning on evidence and task completion, and Perplexity stayed focused on speed. The common thread is simple: people want search that can pull screenshots, product pages, and source context into one answer without making them hop across tabs.";

export const RESEARCH_REPORT = `Executive summary
Enterprise AI search is moving away from "chat with files" positioning and toward systems that can plan, verify, synthesize, and show their work. The strongest products are not selling raw model access. They are helping teams move from a messy question to a defendable answer with less manual stitching.

Core market shift
Leaders are absorbing more of the workflow stack. Retrieval, ranking, evaluation, and final answer shaping are being presented as one product experience instead of separate tools that an operations team has to stitch together manually.

Competitive pattern
The category is converging on a common promise: fewer tabs, fewer handoffs, and fewer moments where a human has to reconcile conflicting evidence. Product language is becoming more operational and less experimental. Instead of highlighting raw model capability, vendors are highlighting research flows, evaluation layers, and outputs that are closer to an analyst-ready brief.

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

export const GMAIL_RESPONSE =
  "I found Maya's latest thread, drafted the reply, and tightened the timing so it reads like a clear next step instead of a soft maybe.";

export const DRIVE_RESPONSE =
  "The launch brief is in Drive under Brand / Launch Assets. I checked the latest version and the notes line up with the rollout plan, so this looks like the right file to share.";

export const CALENDAR_RESPONSE =
  "Jordan is free next Tuesday at 6 PM, so I set up the review, added a short agenda, and kept the title easy to scan in a crowded calendar.";

export const SCENE_DURATIONS: Record<SceneKind, number[]> = {
  web: [900, 2000, 1200, 2800, 2200],
  research: [1000, 900, 1000, 1400, 1000, 950, 900, 4800, 2600],
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
