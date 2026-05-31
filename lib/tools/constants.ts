export const ToolName = {
  WEB_SEARCH: "web_search",
  WEB_SCRAPE: "web_scrape",
  ASK_USER: "ask_user",
  DEEP_RESEARCH: "deep_research",
} as const;

export const HumanInTheLoopRequestKind = {
  ASK_USER: ToolName.ASK_USER,
  APPROVAL: "approval",
} as const;

export type HumanInTheLoopRequestKindValue = (typeof HumanInTheLoopRequestKind)[keyof typeof HumanInTheLoopRequestKind];
