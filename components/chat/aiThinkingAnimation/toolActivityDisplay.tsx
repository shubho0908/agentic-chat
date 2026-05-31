import { createElement } from "react";
import { Search, Globe, Presentation, CheckCircle2, Loader2, AlertCircle, Plug } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FC, SVGProps } from "react";
import type { ToolActivity, JsonValue } from "@/lib/schemas/chat";
import { ToolStatus } from "@/lib/schemas/chat";
import { ToolName } from "@/lib/tools/constants";
import {
  GmailIcon,
  GoogleCalendarIcon,
  GoogleDocsIcon,
  GoogleSheetsIcon,
  GoogleDriveIcon,
  SlackIcon,
  GitHubIcon,
  NotionIcon,
  LinearIcon,
} from "../connectorIcons";

interface ToolActivityDisplayProps {
  toolActivities: ToolActivity[];
}

type IconComponent = LucideIcon | FC<SVGProps<SVGSVGElement>>;

function getToolIcon(toolName: string): IconComponent {
  if (toolName === ToolName.WEB_SEARCH) return Search;
  if (toolName === ToolName.WEB_SCRAPE) return Globe;
  const upper = toolName.toUpperCase();
  if (upper.startsWith("GMAIL")) return GmailIcon;
  if (upper.startsWith("GOOGLECALENDAR")) return GoogleCalendarIcon;
  if (upper.startsWith("GOOGLEDRIVE")) return GoogleDriveIcon;
  if (upper.startsWith("GOOGLEDOCS")) return GoogleDocsIcon;
  if (upper.startsWith("GOOGLESHEETS")) return GoogleSheetsIcon;
  if (upper.startsWith("SLACK")) return SlackIcon;
  if (upper.startsWith("NOTION")) return NotionIcon;
  if (upper.startsWith("GITHUB")) return GitHubIcon;
  if (upper.startsWith("LINEAR")) return LinearIcon;
  if (upper.startsWith("GOOGLESLIDES")) return Presentation;
  return Plug;
}

function getActionLabel(toolName: string): string {
  if (toolName === ToolName.WEB_SEARCH) return "Web search";
  if (toolName === ToolName.WEB_SCRAPE) return "Read webpage";

  // Derive a human-readable label from the slug itself.
  // Strip the toolkit prefix (e.g., "GMAIL_FETCH_EMAILS" → "Fetch emails")
  // so labels stay correct even when Composio renames or adds slugs.
  const parts = toolName.split("_");
  if (parts.length > 1) {
    const action = parts.slice(1).join(" ").toLowerCase();
    return action.charAt(0).toUpperCase() + action.slice(1);
  }
  return toolName.replace(/_/g, " ");
}

function getServiceName(toolName: string): string | null {
  const upper = toolName.toUpperCase();
  if (upper.startsWith("GMAIL")) return "Gmail";
  if (upper.startsWith("GOOGLECALENDAR")) return "Calendar";
  if (upper.startsWith("GOOGLEDRIVE")) return "Drive";
  if (upper.startsWith("GOOGLEDOCS")) return "Docs";
  if (upper.startsWith("GOOGLESHEETS")) return "Sheets";
  if (upper.startsWith("GOOGLESLIDES")) return "Slides";
  if (upper.startsWith("SLACK")) return "Slack";
  if (upper.startsWith("NOTION")) return "Notion";
  if (upper.startsWith("GITHUB")) return "GitHub";
  if (upper.startsWith("LINEAR")) return "Linear";
  return null;
}

function parseInputArgs(args: Record<string, unknown>): Record<string, unknown> {
  if (typeof args.input === "string") {
    try {
      const parsed = JSON.parse(args.input);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch { /* noop */ }
  }
  return args;
}

function getKeyArg(activity: ToolActivity): string | null {
  const { toolName, args } = activity;
  if (!args) return null;

  const resolved = parseInputArgs(args);

  if (toolName === ToolName.WEB_SEARCH) return resolved.query as string || null;
  if (toolName === ToolName.WEB_SCRAPE) {
    const url = (resolved.url || args.url) as string;
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  return (resolved.query || resolved.subject || resolved.title || resolved.name || resolved.q || resolved.to) as string || null;
}

function extractResultContent(result: JsonValue): string | null {
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const obj = result as Record<string, JsonValue>;
    if (obj.kwargs && typeof obj.kwargs === "object" && !Array.isArray(obj.kwargs)) {
      const kwargs = obj.kwargs as Record<string, JsonValue>;
      if (typeof kwargs.content === "string") return kwargs.content;
    }
    if (typeof obj.content === "string") return obj.content;
  }
  return null;
}

function parseWebSearchResults(result: JsonValue): { count: number; sources: { domain: string; url: string }[] } | null {
  const content = extractResultContent(result);
  if (!content) return null;
  const matches = content.match(/\[\d+\]\s+.+\nURL:\s+(.+)/g);
  if (!matches || matches.length === 0) return null;

  const sources: { domain: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const urlMatch = match.match(/URL:\s+(.+)/);
    if (urlMatch?.[1]) {
      try {
        const fullUrl = urlMatch[1].trim();
        const domain = new URL(fullUrl).hostname.replace("www.", "");
        if (!seen.has(domain)) {
          seen.add(domain);
          sources.push({ domain, url: fullUrl });
        }
      } catch { /* noop */ }
    }
  }
  return { count: matches.length, sources: sources.slice(0, 4) };
}

function getResultMetadata(activity: ToolActivity): string | null {
  const { toolName, result, status } = activity;
  if (status !== ToolStatus.Completed || !result) return null;

  if (toolName === ToolName.WEB_SEARCH) {
    const parsed = parseWebSearchResults(result);
    if (parsed) return `${parsed.count} results`;
    const content = extractResultContent(result);
    if (content && content.includes("No results")) return "No results";
    return null;
  }

  if (toolName === ToolName.WEB_SCRAPE) {
    const content = extractResultContent(result);
    if (content) {
      if (content.includes("Failed to extract")) return "Failed";
      const chars = content.length;
      if (chars > 0) return `${Math.round(chars / 100) / 10}k chars`;
    }
    return null;
  }

  if (typeof result === "string") {
    if (result.includes("successfully")) return "Done";
    if (result.includes("not found") || result.includes("No ")) return "Not found";
  }

  if (result && typeof result === "object" && !Array.isArray(result)) {
    const obj = result as Record<string, JsonValue>;
    if (obj.successfull === true || obj.successful === true) return "Done";
    if (obj.error) return "Error";
  }

  return null;
}

function getWebSearchSources(activity: ToolActivity): { domain: string; url: string }[] {
  if (activity.toolName !== ToolName.WEB_SEARCH || activity.status !== ToolStatus.Completed || !activity.result) return [];
  const parsed = parseWebSearchResults(activity.result);
  return parsed?.sources || [];
}

function StatusIndicator({ status }: { status: string }) {
  if (status === ToolStatus.Calling) {
    return <Loader2 className="size-3 animate-spin text-muted-foreground" />;
  }
  if (status === ToolStatus.Completed) {
    return <CheckCircle2 className="size-3 text-muted-foreground/70" />;
  }
  return <AlertCircle className="size-3 text-destructive/70" />;
}

function getKeyArgUrl(activity: ToolActivity): string | null {
  const { toolName, args } = activity;
  if (!args) return null;
  if (toolName === ToolName.WEB_SCRAPE) {
    const resolved = parseInputArgs(args);
    return (resolved.url || args.url) as string || null;
  }
  return null;
}

function ToolActivityRow({ activity }: { activity: ToolActivity }) {
  const action = getActionLabel(activity.toolName);
  const service = getServiceName(activity.toolName);
  const keyArg = getKeyArg(activity);
  const keyArgUrl = getKeyArgUrl(activity);
  const meta = getResultMetadata(activity);
  const sources = getWebSearchSources(activity);
  const isDone = activity.status === ToolStatus.Completed;
  const hasError = activity.status === ToolStatus.Error;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 min-w-0">
        {createElement(getToolIcon(activity.toolName), { className: "size-3.5 shrink-0 text-muted-foreground" })}
        <span className="text-[12px] font-medium text-foreground/80 truncate">
          {service ? `${service} · ${action}` : action}
        </span>
        {keyArg && (
          keyArgUrl ? (
            <a href={keyArgUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted-foreground hover:text-foreground truncate max-w-[180px] underline underline-offset-2 decoration-muted-foreground/40">
              {keyArg}
            </a>
          ) : (
            <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">
              {keyArg}
            </span>
          )
        )}
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {meta && (
            <span className="text-[10px] text-muted-foreground">{meta}</span>
          )}
          <StatusIndicator status={activity.status} />
        </span>
      </div>
      {isDone && sources.length > 0 && (
        <div className="flex items-center gap-1 ml-5.5 flex-wrap">
          {sources.map((source, i) => (
            <a key={`${source.domain}-${i}`} href={source.url} target="_blank" rel="noopener noreferrer" className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors">
              {source.domain}
            </a>
          ))}
        </div>
      )}
      {hasError && activity.error && (
        <span className="text-[10px] text-destructive/70 ml-5.5 truncate">{activity.error}</span>
      )}
    </div>
  );
}

export function ToolActivityDisplay({ toolActivities }: ToolActivityDisplayProps) {
  const visible = toolActivities.filter((a) => a.toolName !== ToolName.ASK_USER);
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {visible.map((activity) => (
        <ToolActivityRow key={activity.toolCallId} activity={activity} />
      ))}
    </div>
  );
}
