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
};

export const TOOLKIT_TOOL_PREFIXES: Record<ComposioToolkit, string> = {
  gmail: "GMAIL_",
  googlecalendar: "GOOGLECALENDAR_",
  googledrive: "GOOGLEDRIVE_",
  googledocs: "GOOGLEDOCS_",
  googlesheets: "GOOGLESHEETS_",
  slack: "SLACK_",
  notion: "NOTION_",
  github: "GITHUB_",
  linear: "LINEAR_",
};

const ESSENTIAL_COMPOSIO_TOOLS: Partial<Record<ComposioToolkit, string[]>> = {
  gmail: [
    "GMAIL_GET_PROFILE",
    "GMAIL_LIST_THREADS",
    "GMAIL_FETCH_MESSAGE_BY_THREAD_ID",
    "GMAIL_LIST_LABELS",
  ],
  googlecalendar: [
    "GOOGLECALENDAR_GET_CURRENT_DATE_TIME",
    "GOOGLECALENDAR_LIST_CALENDARS",
    "GOOGLECALENDAR_EVENTS_LIST",
    "GOOGLECALENDAR_FIND_FREE_SLOTS",
  ],
  googledrive: [
    "GOOGLEDRIVE_FIND_FOLDER",
    "GOOGLEDRIVE_GET_FILE_METADATA",
    "GOOGLEDRIVE_DOWNLOAD_FILE",
    "GOOGLEDRIVE_LIST_FILES",
  ],
  googledocs: [
    "GOOGLEDOCS_SEARCH_DOCUMENTS",
    "GOOGLEDOCS_GET_DOCUMENT_BY_ID",
  ],
  googlesheets: [
    "GOOGLESHEETS_GET_TABLE_SCHEMA",
    "GOOGLESHEETS_LIST_TABLES",
    "GOOGLESHEETS_QUERY_TABLE",
    "GOOGLESHEETS_LOOKUP_SPREADSHEET_ROW",
    "GOOGLESHEETS_FIND_WORKSHEET_BY_TITLE",
  ],
  slack: [
    "SLACK_LIST_CONVERSATIONS",
    "SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION",
    "SLACK_FIND_USER_BY_EMAIL_ADDRESS",
    "SLACK_FETCH_TEAM_INFO",
  ],
  notion: [
    "NOTION_FETCH_DATA",
    "NOTION_FETCH_DATABASE",
    "NOTION_QUERY_DATABASE",
    "NOTION_SEARCH_NOTION_PAGE",
    "NOTION_FETCH_ROW",
    "NOTION_FETCH_BLOCK_CONTENTS",
    "NOTION_INSERT_ROW_DATABASE",
    "NOTION_UPDATE_ROW_DATABASE",
    "NOTION_UPDATE_PAGE",
    "NOTION_CREATE_NOTION_PAGE",
    "NOTION_ADD_MULTIPLE_PAGE_CONTENT",
    "NOTION_ARCHIVE_NOTION_PAGE",
  ],
  github: [
    "GITHUB_GET_THE_AUTHENTICATED_USER",
    "GITHUB_LIST_FOLLOWERS_OF_THE_AUTHENTICATED_USER",
  ],
  linear: [
    "LINEAR_GET_CURRENT_USER",
    "LINEAR_LIST_LINEAR_PROJECTS",
    "LINEAR_LIST_LINEAR_ISSUES",
    "LINEAR_LIST_LINEAR_TEAMS",
    "LINEAR_LIST_LINEAR_USERS",
    "LINEAR_LIST_LINEAR_STATES",
  ],
};

export function notConnectedMessage(toolkit: ComposioToolkit): string {
  return `${TOOLKIT_DISPLAY_NAMES[toolkit]} is not connected — please enable it in the Tools menu (⚙️).`;
}

export function getComposioToolkitForToolName(toolName: string): ComposioToolkit | null {
  const upperName = toolName.toUpperCase();
  for (const toolkit of COMPOSIO_TOOLKITS) {
    if (upperName.startsWith(TOOLKIT_TOOL_PREFIXES[toolkit])) {
      return toolkit;
    }
  }
  return null;
}

export function getEssentialComposioToolSlugs(toolkits: Iterable<ComposioToolkit>): string[] {
  return [...new Set([...toolkits].flatMap((toolkit) => ESSENTIAL_COMPOSIO_TOOLS[toolkit] ?? []))];
}

const DANGEROUS_ACTIONS = new Set([
  "GMAIL_SEND_EMAIL",
  "GMAIL_REPLY_TO_THREAD",
  "GMAIL_DELETE_MESSAGE",
  "GOOGLECALENDAR_CREATE_EVENT",
  "GOOGLECALENDAR_UPDATE_EVENT",
  "GOOGLECALENDAR_DELETE_EVENT",
  "GOOGLEDRIVE_ADD_FILE_SHARING_PREFERENCE",
  "GOOGLEDRIVE_DELETE_PERMISSION",
  "GOOGLEDRIVE_EMPTY_TRASH",
  "GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN",
  "GOOGLESHEETS_BATCH_UPDATE",
  "GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND",
  "SLACK_SEND_MESSAGE",
  "NOTION_CREATE_NOTION_PAGE",
  "NOTION_UPDATE_PAGE",
  "NOTION_INSERT_ROW_DATABASE",
  "NOTION_UPDATE_ROW_DATABASE",
  "NOTION_ARCHIVE_NOTION_PAGE",
  "GITHUB_CREATE_A_PULL_REQUEST",
  "GITHUB_CREATE_AN_ISSUE",
  "LINEAR_CREATE_LINEAR_ISSUE",
  "LINEAR_UPDATE_ISSUE",
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
