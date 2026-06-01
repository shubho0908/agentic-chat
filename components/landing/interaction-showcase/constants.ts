import type { SceneKind } from "@/components/landing/interaction-showcase/types";
import type { ToolActivity } from "@/lib/schemas/chat";
import { ToolStatus } from "@/lib/schemas/chat";
import { ToolName } from "@/lib/tools/constants";

export const SCENE_ORDER: SceneKind[] = ["web", "orchestration", "deep-research"];
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

export const ORCHESTRATION_RESPONSE =
  "Done. Comparison table posted to #product on Slack: Cursor leads on code UX, v0 on design-to-code speed, Devin on autonomous task completion.";

export const DEEP_RESEARCH_RESPONSE = `## Chain-of-Thought Prompting: Effect on LLM Reasoning Accuracy

### Executive Summary

Chain-of-thought (CoT) prompting — instructing a model to reason step-by-step before producing a final answer — is one of the most reliably effective techniques for improving multi-step reasoning in large language models. Across 14 benchmarks surveyed, CoT improves accuracy by 12–31% depending on model scale, task type, and prompting variant. However, gains are not universal: below a critical scale threshold, CoT can actively degrade performance, and on factual recall tasks the benefit is near zero.

---

### 1. Benchmark Results by Domain

**Mathematical reasoning (GSM8K, MATH, SVAMP)**
CoT shows the largest gains here. On GSM8K, GPT-4 with CoT reaches 92.0% vs 76.4% without — a 15.6pp lift. LLaMA-2 70B improves from 54.1% to 73.2% (+19.1pp). On the harder MATH benchmark, Gemini Ultra moves from 53.2% to 71.8% with CoT (+18.6pp). SVAMP shows 12–17pp gains across frontier models.

**Code reasoning (HumanEval, MBPP, SWE-bench)**
CoT helps on multi-step code tasks but less so on single-function synthesis. HumanEval pass@1 improves 8–14pp for models ≥13B. On SWE-bench, CoT combined with tool use shows 18pp improvement over base prompting for Claude 3.5 Sonnet.

**Logical and commonsense reasoning (BIG-Bench Hard, ARC-Challenge)**
BIG-Bench Hard is specifically designed to resist standard prompting — CoT is essentially required to perform above chance on many tasks. GPT-4 with CoT scores 83.1% vs 49.2% without (+33.9pp). ARC-Challenge shows more modest gains of 6–11pp.

**Factual recall (TriviaQA, Natural Questions)**
CoT provides minimal benefit and occasionally hurts. On TriviaQA, GPT-4 scores 85.2% with and 86.1% without CoT — a slight regression. CoT introduces opportunities to hallucinate intermediate steps that corrupt the final answer.

---

### 2. Scale Threshold Effects

The relationship between model scale and CoT benefit is non-linear with a clear inflection point.

**Below 7B parameters:** CoT consistently hurts. Models generate plausible-sounding but incorrect reasoning chains, and the final answer follows the flawed chain. On GSM8K, LLaMA-2 7B drops from 14.6% to 11.2% with CoT. This "negative CoT" effect is documented across GPT-3, PaLM, and LLaMA families.

**7B–13B:** Mixed results. CoT helps on structured tasks (arithmetic, formal logic) but hurts on open-ended reasoning. Net effect near zero on average.

**13B–70B:** Consistent positive gains — the sweet spot. LLaMA-2 13B gains 8.4pp on GSM8K; 34B gains 14.2pp; 70B gains 19.1pp.

**Above 70B dense (or equivalent MoE):** Gains continue but at diminishing rates. GPT-4 and Claude 3.5 Sonnet show 7–9pp improvements — smaller in relative terms due to ceiling effects. This scale threshold finding is consistent across arXiv:2405.14333, HELM (Stanford CRFM), and Scale AI SEAL.

---

### 3. CoT Variants and Relative Performance

**Zero-shot CoT ("Let's think step by step"):** Adds 8–15pp on average with no examples required. Best for deployment scenarios where few-shot examples are impractical.

**Few-shot CoT (manual exemplars):** Adds 12–22pp. Requires careful exemplar selection — poor exemplars can hurt more than zero-shot. Best results when exemplars are domain-matched.

**Auto-CoT (Zhang et al., 2022):** Automatically generates exemplars via clustering. Matches manual few-shot CoT within 1–2pp while eliminating manual curation cost.

**Program-of-Thought (PoT):** Generates executable code as the reasoning chain, then runs it. Outperforms standard CoT by 12pp on math benchmarks. GPT-4 with PoT reaches 96.8% on GSM8K vs 92.0% with CoT.

**Tree-of-Thought (ToT):** Explores multiple reasoning paths in parallel and selects the best. Adds 15–20pp over standard CoT on search-requiring tasks. High inference cost (8–32× standard CoT).

---

### 4. Self-Consistency: The Reliability Multiplier

Self-consistency (Wang et al., 2022) samples multiple independent CoT paths and takes a majority vote. It is the most reliable way to boost CoT accuracy further.

**Accuracy gains:** +6–11pp on top of single-chain CoT. On GSM8K, self-consistency with 40 samples pushes GPT-4 from 92.0% to 96.4%.

**Cost tradeoff:** Requires N inference calls (typically 10–40). Gains plateau around N=20–30 samples. Beyond 40 samples, improvement is typically <0.5pp.

**When to use:** Self-consistency is worth the cost when accuracy is critical, the task has a verifiable correct answer (math, code), and the model is in the 13B–70B range where single-chain CoT is strong but not yet saturated.

---

### 5. Failure Modes

**Hallucinated reasoning chains:** Confident but incorrect intermediate steps lead to wrong conclusions. More common in factual and knowledge-intensive tasks.

**Verbosity without depth:** Smaller models produce long chains that restate the question without making progress.

**Prompt sensitivity:** CoT gains are sensitive to exact phrasing. "Let's think step by step" outperforms "Think carefully" by 3–7pp. Exemplar ordering in few-shot CoT can swing results by ±5pp.

**Task mismatch:** CoT is designed for decomposable tasks. For holistic judgment tasks (sentiment, style), CoT can introduce overthinking and reduce accuracy.

---

### 6. Practical Recommendations

Enable CoT on math/code tasks for models ≥13B. Use zero-shot CoT as a low-cost default; upgrade to few-shot CoT when exemplars are available. Add self-consistency (N=20) when accuracy is critical and latency allows. Skip CoT entirely for factual recall, models <7B, and latency-sensitive paths. Use PoT when the task involves deterministic computation. Reserve Tree-of-Thought for high-value tasks where search over reasoning paths is justified by the inference budget.

---

### Sources

1. Wei et al. (2022) — Chain-of-Thought Prompting. arXiv:2201.11903
2. Kojima et al. (2022) — Zero-Shot Reasoners. arXiv:2205.11916
3. Wang et al. (2022) — Self-Consistency. arXiv:2203.11171
4. HELM Benchmark — Stanford CRFM (crfm.stanford.edu/helm)
5. Scale AI SEAL Leaderboard (scale.com/leaderboard)
6. LMSys Chatbot Arena (chat.lmsys.org)
7. BIG-Bench Hard — Suzgun et al. arXiv:2210.09261`;


const t = (id: string) => ({ toolCallId: id, timestamp: 0, args: {} });

export const WEB_SCENE_ACTIVITIES: ToolActivity[] = [
  { ...t("ws-1"), toolName: ToolName.WEB_SEARCH, status: ToolStatus.Calling, args: { query: "AI search product launches this week" } },
];
export const WEB_SCENE_ACTIVITIES_DONE: ToolActivity[] = [
  {
    ...t("ws-1"),
    toolName: ToolName.WEB_SEARCH,
    status: ToolStatus.Completed,
    args: { query: "AI search product launches this week" },
    result: "URL: https://reuters.com/ai-search\nURL: https://blog.perplexity.ai/launches\nURL: https://theinformation.com/ai-search",
  },
];

export const ORCH_STEP1_CALLING: ToolActivity[] = [
  { ...t("or-1"), toolName: ToolName.WEB_SEARCH, status: ToolStatus.Calling, args: { query: "top AI developer tools launched this week" } },
];
export const ORCH_STEP1_DONE: ToolActivity[] = [
  { ...t("or-1"), toolName: ToolName.WEB_SEARCH, status: ToolStatus.Completed, args: { query: "top AI developer tools launched this week" }, result: "URL: https://cursor.sh\nURL: https://v0.dev\nURL: https://devin.ai" },
];
export const ORCH_STEP2_CALLING: ToolActivity[] = [
  { ...t("or-1"), toolName: ToolName.WEB_SEARCH, status: ToolStatus.Completed, args: { query: "top AI developer tools launched this week" }, result: "URL: https://cursor.sh\nURL: https://v0.dev\nURL: https://devin.ai" },
  { ...t("or-2"), toolName: ToolName.WEB_SCRAPE, status: ToolStatus.Calling, args: { url: "https://cursor.sh" } },
  { ...t("or-3"), toolName: ToolName.WEB_SCRAPE, status: ToolStatus.Calling, args: { url: "https://v0.dev" } },
  { ...t("or-4"), toolName: ToolName.WEB_SCRAPE, status: ToolStatus.Calling, args: { url: "https://devin.ai" } },
];
export const ORCH_STEP2_DONE: ToolActivity[] = [
  { ...t("or-1"), toolName: ToolName.WEB_SEARCH, status: ToolStatus.Completed, args: { query: "top AI developer tools launched this week" }, result: "URL: https://cursor.sh\nURL: https://v0.dev\nURL: https://devin.ai" },
  { ...t("or-2"), toolName: ToolName.WEB_SCRAPE, status: ToolStatus.Completed, args: { url: "https://cursor.sh" }, result: "Cursor: AI-first code editor with inline edits." },
  { ...t("or-3"), toolName: ToolName.WEB_SCRAPE, status: ToolStatus.Completed, args: { url: "https://v0.dev" }, result: "v0: Generate UI from text prompts." },
  { ...t("or-4"), toolName: ToolName.WEB_SCRAPE, status: ToolStatus.Completed, args: { url: "https://devin.ai" }, result: "Devin: Autonomous software engineer." },
];

export const ORCH_STEP3_CALLING: ToolActivity[] = [
  { ...t("or-5"), toolName: "SLACK_SEND_MESSAGE", status: ToolStatus.Calling, args: { channel: "#product", text: "AI dev tools comparison table" } },
];
export const ORCH_STEP3_DONE: ToolActivity[] = [
  { ...t("or-5"), toolName: "SLACK_SEND_MESSAGE", status: ToolStatus.Completed, args: { channel: "#product", text: "AI dev tools comparison table" }, result: "Message sent successfully" },
];

export const DR_SCENE_ACTIVITIES_1_CALLING: ToolActivity[] = [
  { ...t("dr-1"), toolName: ToolName.DEEP_RESEARCH, status: ToolStatus.Calling, args: { query: "chain-of-thought prompting accuracy GSM8K MATH HumanEval benchmarks" } },
];
export const DR_SCENE_ACTIVITIES_1_DONE: ToolActivity[] = [
  { ...t("dr-1"), toolName: ToolName.DEEP_RESEARCH, status: ToolStatus.Completed, args: { query: "chain-of-thought prompting accuracy GSM8K MATH HumanEval benchmarks" }, result: "URL: https://arxiv.org/abs/2201.11903\nURL: https://arxiv.org/abs/2405.14333\nURL: https://crfm.stanford.edu/helm\nURL: https://paperswithcode.com/sota/arithmetic-reasoning-on-gsm8k\nURL: https://openai.com/research/gpt-4" },
];
export const DR_SCENE_ACTIVITIES_2_CALLING: ToolActivity[] = [
  { ...t("dr-1"), toolName: ToolName.DEEP_RESEARCH, status: ToolStatus.Completed, args: { query: "chain-of-thought prompting accuracy GSM8K MATH HumanEval benchmarks" }, result: "URL: https://arxiv.org/abs/2201.11903\nURL: https://arxiv.org/abs/2405.14333\nURL: https://crfm.stanford.edu/helm\nURL: https://paperswithcode.com/sota/arithmetic-reasoning-on-gsm8k\nURL: https://openai.com/research/gpt-4" },
  { ...t("dr-2"), toolName: ToolName.DEEP_RESEARCH, status: ToolStatus.Calling, args: { query: "chain-of-thought model scale threshold 7B 70B reasoning performance" } },
];
export const DR_SCENE_ACTIVITIES_2_DONE: ToolActivity[] = [
  { ...t("dr-1"), toolName: ToolName.DEEP_RESEARCH, status: ToolStatus.Completed, args: { query: "chain-of-thought prompting accuracy GSM8K MATH HumanEval benchmarks" }, result: "URL: https://arxiv.org/abs/2201.11903\nURL: https://arxiv.org/abs/2405.14333\nURL: https://crfm.stanford.edu/helm\nURL: https://paperswithcode.com/sota/arithmetic-reasoning-on-gsm8k\nURL: https://openai.com/research/gpt-4" },
  { ...t("dr-2"), toolName: ToolName.DEEP_RESEARCH, status: ToolStatus.Completed, args: { query: "chain-of-thought model scale threshold 7B 70B reasoning performance" }, result: "URL: https://arxiv.org/abs/2212.10560\nURL: https://scale.com/leaderboard\nURL: https://chat.lmsys.org\nURL: https://arxiv.org/abs/2303.08774" },
];
export const DR_SCENE_ACTIVITIES_3_CALLING: ToolActivity[] = [
  { ...t("dr-1"), toolName: ToolName.DEEP_RESEARCH, status: ToolStatus.Completed, args: { query: "chain-of-thought prompting accuracy GSM8K MATH HumanEval benchmarks" }, result: "URL: https://arxiv.org/abs/2201.11903\nURL: https://arxiv.org/abs/2405.14333\nURL: https://crfm.stanford.edu/helm\nURL: https://paperswithcode.com/sota/arithmetic-reasoning-on-gsm8k\nURL: https://openai.com/research/gpt-4" },
  { ...t("dr-2"), toolName: ToolName.DEEP_RESEARCH, status: ToolStatus.Completed, args: { query: "chain-of-thought model scale threshold 7B 70B reasoning performance" }, result: "URL: https://arxiv.org/abs/2212.10560\nURL: https://scale.com/leaderboard\nURL: https://chat.lmsys.org\nURL: https://arxiv.org/abs/2303.08774" },
  { ...t("dr-3"), toolName: ToolName.DEEP_RESEARCH, status: ToolStatus.Calling, args: { query: "self-consistency chain-of-thought majority voting inference cost tradeoff" } },
];
export const DR_SCENE_ACTIVITIES_3_DONE: ToolActivity[] = [
  { ...t("dr-1"), toolName: ToolName.DEEP_RESEARCH, status: ToolStatus.Completed, args: { query: "chain-of-thought prompting accuracy GSM8K MATH HumanEval benchmarks" }, result: "URL: https://arxiv.org/abs/2201.11903\nURL: https://arxiv.org/abs/2405.14333\nURL: https://crfm.stanford.edu/helm\nURL: https://paperswithcode.com/sota/arithmetic-reasoning-on-gsm8k\nURL: https://openai.com/research/gpt-4" },
  { ...t("dr-2"), toolName: ToolName.DEEP_RESEARCH, status: ToolStatus.Completed, args: { query: "chain-of-thought model scale threshold 7B 70B reasoning performance" }, result: "URL: https://arxiv.org/abs/2212.10560\nURL: https://scale.com/leaderboard\nURL: https://chat.lmsys.org\nURL: https://arxiv.org/abs/2303.08774" },
  { ...t("dr-3"), toolName: ToolName.DEEP_RESEARCH, status: ToolStatus.Completed, args: { query: "self-consistency chain-of-thought majority voting inference cost tradeoff" }, result: "URL: https://arxiv.org/abs/2203.11171\nURL: https://arxiv.org/abs/2305.10601\nURL: https://bair.berkeley.edu/blog/2023/04/03/koala" },
];

export const SCENE_DURATIONS: Record<SceneKind, number[]> = {
  web: [900, 2000, 1200, 2800, 2200],
  orchestration: [600, 900, 1400, 800, 1800, 800, 1400, 2600],
  "deep-research": [600, 800, 2200, 600, 2200, 600, 2200, 4200],
};

export const FRAME_SURFACE_CLASS =
  "bg-[linear-gradient(180deg,rgba(247,248,251,0.94),rgba(239,242,247,0.98))] dark:bg-[linear-gradient(180deg,rgba(16,18,23,0.985),rgba(8,10,14,0.995))] backdrop-blur-xl";
export const VIEWPORT_SURFACE_CLASS =
  "bg-[linear-gradient(180deg,rgba(254,254,255,0.99),rgba(249,250,252,0.99))] dark:bg-[linear-gradient(180deg,rgba(11,13,17,0.998),rgba(6,8,11,0.998))]";
export const PANEL_SURFACE_CLASS =
  "bg-background/92 dark:bg-[linear-gradient(180deg,rgba(20,22,28,0.985),rgba(14,16,21,0.99))] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]";
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
