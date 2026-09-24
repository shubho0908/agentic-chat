import type { ComposioToolkit } from "@/lib/tools/composio/config";

const TOOLKIT_INTENT_TERMS: Record<ComposioToolkit, string[]> = {
  gmail: ["gmail", "email", "mail", "inbox"],
  googlecalendar: [
    "calendar",
    "calender",
    "meeting",
    "schedule",
    "appointment",
    "event",
  ],
  googledrive: ["drive", "folder", "file"],
  googledocs: ["docs", "google doc", "document"],
  googlesheets: ["sheets", "spreadsheet", "excel"],
  slack: ["slack", "channel", "dm", "message"],
  notion: ["notion", "page", "database", "note", "wiki"],
  github: [
    "github",
    "repo",
    "repository",
    "pull request",
    "branch",
    "commit",
    "code",
    "pr",
  ],
  linear: ["linear", "issue", "ticket", "cycle", "task", "project"],
};

const FRESH_WEB_TERMS = [
  "latest",
  "today",
  "news",
  "current",
  "recent",
  "web",
  "internet",
  "online",
  "price",
  "weather",
];
const WEB_ACTION_TERMS = [
  "scrape",
  "crawl",
  "fetch the page",
  "fetch this page",
  "fetch that page",
  "open the link",
  "open this link",
  "open that link",
  "open the url",
  "follow the link",
  "follow this link",
  "follow that link",
  "follow the links",
  "visit the site",
  "visit this site",
  "visit that site",
  "visit the website",
  "visit this website",
  "visit that website",
  "visit the page",
  "visit this page",
  "visit the url",
  "browse the site",
  "browse this site",
  "browse the website",
  "browse this website",
  "browse the web",
  "go to the site",
  "go to this site",
  "go to the website",
  "go to this website",
  "go to the url",
  "load the page",
  "load this page",
  "load the url",
  "read the page",
  "read this page",
  "read that page",
  "read the article",
  "read this article",
  "read the website",
  "read this website",
  "extract from the site",
  "extract from this site",
  "extract from the page",
  "extract from this page",
  "scrape the site",
  "scrape this site",
  "scrape the website",
  "scrape this website",
  "scrape the page",
  "scrape this page",
  "scrape the url",
  "crawl the site",
  "crawl this site",
  "crawl the website",
  "crawl this website",
];
const RESEARCH_PHRASES = [
  "deep research",
  "research thoroughly",
  "research about",
  "research on",
  "research into",
  "do research",
  "conduct research",
  "in-depth research",
  "comprehensive research",
  "deep dive into",
  "deep dive on",
  "investigate thoroughly",
  "thorough investigation",
  "comprehensive analysis of",
  "comprehensive comparison",
  "detailed comparison of",
  "pros and cons of",
];

function includesTerm(text: string, term: string): boolean {
  return term.includes(" ")
    ? text.includes(term)
    : new RegExp(`\\b${term}\\b`, "i").test(text);
}

function isResearchIntent(text: string): boolean {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean).length;
  if (words < 4) return false;
  if (RESEARCH_PHRASES.some((phrase) => lower.includes(phrase))) return true;
  return (
    words >= 5 &&
    /^(please\s+|can you\s+|could you\s+)?(research|investigate)\b/i.test(
      lower.trim(),
    )
  );
}

export function shouldBypassSemanticCacheForToolIntent(
  text: string,
  _connectedServices?: string[],
): boolean {
  void _connectedServices;
  const lower = text.toLowerCase();
  return (
    Object.values(TOOLKIT_INTENT_TERMS).some((terms) =>
      terms.some((term) => includesTerm(lower, term)),
    ) ||
    FRESH_WEB_TERMS.some((term) => includesTerm(lower, term)) ||
    WEB_ACTION_TERMS.some((term) => includesTerm(lower, term)) ||
    isResearchIntent(text) ||
    /\bpdf\b/i.test(text) ||
    /https?:\/\//i.test(text)
  );
}
