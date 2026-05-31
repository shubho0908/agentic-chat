export const COMPOSIO_TOOLKITS = [
  "gmail",
  "googlecalendar",
  "googledrive",
  "googledocs",
  "googlesheets",
  "slack",
  "notion",
  "github",
  "linear",
  "todoist",
] as const;

export type ComposioToolkit = (typeof COMPOSIO_TOOLKITS)[number];

export const TOOLKIT_DISPLAY_NAMES: Record<ComposioToolkit, string> = {
  gmail: "Gmail",
  googlecalendar: "Google Calendar",
  googledrive: "Google Drive",
  googledocs: "Google Docs",
  googlesheets: "Google Sheets",
  slack: "Slack",
  notion: "Notion",
  github: "GitHub",
  linear: "Linear",
  todoist: "Todoist",
};

const DANGEROUS_ACTIONS = new Set([
  "GMAIL_SEND_EMAIL",
  "GMAIL_REPLY_TO_THREAD",
  "GMAIL_DELETE_EMAIL",
  "GOOGLECALENDAR_CREATE_EVENT",
  "GOOGLECALENDAR_UPDATE_EVENT",
  "GOOGLECALENDAR_DELETE_EVENT",
  "GOOGLEDRIVE_DELETE_FILE",
  "GOOGLEDRIVE_SHARE_FILE",
  "GOOGLEDOCS_CREATE_DOCUMENT",
  "GOOGLESHEETS_WRITE_TO_SHEET",
  "SLACK_SEND_MESSAGE",
  "NOTION_CREATE_PAGE",
  "NOTION_UPDATE_PAGE",
  "GITHUB_CREATE_PULL_REQUEST",
  "GITHUB_CREATE_ISSUE",
  "LINEAR_CREATE_ISSUE",
]);

const SIDE_EFFECT_ACTION_VERBS = new Set([
  "ADD",
  "APPEND",
  "ARCHIVE",
  "CANCEL",
  "COMPLETE",
  "CREATE",
  "DELETE",
  "DISABLE",
  "ENABLE",
  "INVITE",
  "MOVE",
  "PUBLISH",
  "REMOVE",
  "REPLY",
  "RESTORE",
  "SEND",
  "SHARE",
  "TRASH",
  "UPDATE",
  "WRITE",
]);

export function isDangerousAction(actionSlug: string): boolean {
  const normalized = actionSlug.toUpperCase();
  if (DANGEROUS_ACTIONS.has(normalized)) {
    return true;
  }

  const segments = normalized.split(/[^A-Z0-9]+/).filter(Boolean);
  return segments.some((segment) => SIDE_EFFECT_ACTION_VERBS.has(segment));
}
