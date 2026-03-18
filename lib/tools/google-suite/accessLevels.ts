import {
  GOOGLE_CONNECTOR_SCOPES,
  GOOGLE_SCOPES,
} from "@/lib/tools/google-suite/scopes";

export type GoogleWorkspaceServiceId =
  | "gmail"
  | "drive"
  | "calendar"
  | "docs"
  | "sheets"
  | "slides";

interface GoogleWorkspaceServiceLevel {
  id: string;
  label: string;
  description: string;
  rank: number;
  scopes: string[];
  isGranted: (grantedScopes: Set<string>) => boolean;
}

interface GoogleWorkspaceServiceConfig {
  id: GoogleWorkspaceServiceId;
  name: string;
  summary: string;
  levels: GoogleWorkspaceServiceLevel[];
}

function hasAnyScope(grantedScopes: Set<string>, scopes: string[]): boolean {
  return scopes.some((scope) => grantedScopes.has(scope));
}

function hasAllScopes(grantedScopes: Set<string>, scopes: string[]): boolean {
  return scopes.every((scope) => grantedScopes.has(scope));
}

const OFF_LEVEL: GoogleWorkspaceServiceLevel = {
  id: "off",
  label: "Off",
  description: "No access for this app.",
  rank: 0,
  scopes: [],
  isGranted: () => true,
};

export const GOOGLE_WORKSPACE_SERVICE_CONFIGS: GoogleWorkspaceServiceConfig[] = [
  {
    id: "gmail",
    name: "Gmail",
    summary: "Inbox search, message drafting, replies, and mailbox actions.",
    levels: [
      OFF_LEVEL,
      {
        id: "read",
        label: "Read",
        description: "Search the inbox, read threads, and download attachments.",
        rank: 1,
        scopes: [GOOGLE_SCOPES.GMAIL_READONLY],
        isGranted: (grantedScopes) =>
          hasAnyScope(grantedScopes, [
            GOOGLE_SCOPES.GMAIL_READONLY,
            GOOGLE_SCOPES.GMAIL_MODIFY,
          ]),
      },
      {
        id: "compose",
        label: "Compose",
        description: "Read context and send new emails or replies.",
        rank: 2,
        scopes: [GOOGLE_SCOPES.GMAIL_READONLY, GOOGLE_SCOPES.GMAIL_SEND],
        isGranted: (grantedScopes) =>
          grantedScopes.has(GOOGLE_SCOPES.GMAIL_SEND) &&
          hasAnyScope(grantedScopes, [
            GOOGLE_SCOPES.GMAIL_READONLY,
            GOOGLE_SCOPES.GMAIL_MODIFY,
          ]),
      },
      {
        id: "full",
        label: "Full",
        description: "Compose, label, archive, mark read, and manage mailbox state.",
        rank: 3,
        scopes: [
          GOOGLE_SCOPES.GMAIL_READONLY,
          GOOGLE_SCOPES.GMAIL_SEND,
          GOOGLE_SCOPES.GMAIL_MODIFY,
          GOOGLE_SCOPES.GMAIL_LABELS,
        ],
        isGranted: (grantedScopes) =>
          hasAllScopes(grantedScopes, [
            GOOGLE_SCOPES.GMAIL_SEND,
            GOOGLE_SCOPES.GMAIL_MODIFY,
            GOOGLE_SCOPES.GMAIL_LABELS,
          ]),
      },
    ],
  },
  {
    id: "drive",
    name: "Drive",
    summary: "File search, reading, uploads, folder creation, and sharing.",
    levels: [
      OFF_LEVEL,
      {
        id: "view",
        label: "View",
        description: "Search files, open documents, and inspect folders.",
        rank: 1,
        scopes: [GOOGLE_SCOPES.DRIVE_READONLY],
        isGranted: (grantedScopes) =>
          hasAnyScope(grantedScopes, [
            GOOGLE_SCOPES.DRIVE_READONLY,
            GOOGLE_SCOPES.DRIVE,
          ]),
      },
      {
        id: "manage",
        label: "Manage",
        description: "Create, move, copy, upload, and share files or folders.",
        rank: 2,
        scopes: [GOOGLE_SCOPES.DRIVE],
        isGranted: (grantedScopes) => grantedScopes.has(GOOGLE_SCOPES.DRIVE),
      },
    ],
  },
  {
    id: "calendar",
    name: "Calendar",
    summary: "Event lookup, scheduling, editing, and cancellation.",
    levels: [
      OFF_LEVEL,
      {
        id: "view",
        label: "View",
        description: "Read events, availability, and upcoming meetings.",
        rank: 1,
        scopes: [GOOGLE_SCOPES.CALENDAR_READONLY],
        isGranted: (grantedScopes) =>
          hasAnyScope(grantedScopes, [
            GOOGLE_SCOPES.CALENDAR_READONLY,
            GOOGLE_SCOPES.CALENDAR,
          ]),
      },
      {
        id: "manage",
        label: "Manage",
        description: "Create, reschedule, update, and delete calendar events.",
        rank: 2,
        scopes: [GOOGLE_SCOPES.CALENDAR],
        isGranted: (grantedScopes) => grantedScopes.has(GOOGLE_SCOPES.CALENDAR),
      },
    ],
  },
  {
    id: "docs",
    name: "Docs",
    summary: "Read documents, draft new docs, and edit existing content.",
    levels: [
      OFF_LEVEL,
      {
        id: "view",
        label: "View",
        description: "Read Google Docs content and inspect linked documents.",
        rank: 1,
        scopes: [GOOGLE_SCOPES.DOCS_READONLY],
        isGranted: (grantedScopes) =>
          hasAnyScope(grantedScopes, [
            GOOGLE_SCOPES.DOCS_READONLY,
            GOOGLE_SCOPES.DOCS,
          ]),
      },
      {
        id: "edit",
        label: "Edit",
        description: "Create new Docs, append content, and replace sections.",
        rank: 2,
        scopes: [GOOGLE_SCOPES.DOCS],
        isGranted: (grantedScopes) => grantedScopes.has(GOOGLE_SCOPES.DOCS),
      },
    ],
  },
  {
    id: "sheets",
    name: "Sheets",
    summary: "Spreadsheet reads, structured writes, append flows, and cleanup.",
    levels: [
      OFF_LEVEL,
      {
        id: "view",
        label: "View",
        description: "Read spreadsheets, inspect tabs, and analyze table data.",
        rank: 1,
        scopes: [GOOGLE_SCOPES.SHEETS_READONLY],
        isGranted: (grantedScopes) =>
          hasAnyScope(grantedScopes, [
            GOOGLE_SCOPES.SHEETS_READONLY,
            GOOGLE_SCOPES.SHEETS,
          ]),
      },
      {
        id: "edit",
        label: "Edit",
        description: "Create sheets, write cells, append rows, and clear ranges.",
        rank: 2,
        scopes: [GOOGLE_SCOPES.SHEETS],
        isGranted: (grantedScopes) => grantedScopes.has(GOOGLE_SCOPES.SHEETS),
      },
    ],
  },
  {
    id: "slides",
    name: "Slides",
    summary: "Presentation reading, deck creation, and slide generation.",
    levels: [
      OFF_LEVEL,
      {
        id: "view",
        label: "View",
        description: "Read presentations and inspect existing slide decks.",
        rank: 1,
        scopes: [GOOGLE_SCOPES.SLIDES_READONLY],
        isGranted: (grantedScopes) =>
          hasAnyScope(grantedScopes, [
            GOOGLE_SCOPES.SLIDES_READONLY,
            GOOGLE_SCOPES.SLIDES,
          ]),
      },
      {
        id: "edit",
        label: "Edit",
        description: "Create presentations and add or update slides.",
        rank: 2,
        scopes: [GOOGLE_SCOPES.SLIDES],
        isGranted: (grantedScopes) => grantedScopes.has(GOOGLE_SCOPES.SLIDES),
      },
    ],
  },
];

export type GoogleWorkspaceServiceSelections = Record<GoogleWorkspaceServiceId, string>;

export const DEFAULT_GOOGLE_WORKSPACE_SELECTIONS: GoogleWorkspaceServiceSelections =
  GOOGLE_WORKSPACE_SERVICE_CONFIGS.reduce((acc, service) => {
    acc[service.id] = "off";
    return acc;
  }, {} as GoogleWorkspaceServiceSelections);

function uniqueScopes(scopes: string[]): string[] {
  return Array.from(new Set(scopes));
}

function getGoogleWorkspaceServiceConfig(serviceId: GoogleWorkspaceServiceId) {
  return GOOGLE_WORKSPACE_SERVICE_CONFIGS.find((service) => service.id === serviceId);
}

export function getGoogleWorkspaceLevel(
  serviceId: GoogleWorkspaceServiceId,
  levelId: string
): GoogleWorkspaceServiceLevel {
  const service = getGoogleWorkspaceServiceConfig(serviceId);

  if (!service) {
    throw new Error(`Unknown Google Workspace service: ${serviceId}`);
  }

  const level = service.levels.find((candidate) => candidate.id === levelId);

  if (!level) {
    throw new Error(`Unknown Google Workspace level "${levelId}" for ${serviceId}`);
  }

  return level;
}

export function resolveGoogleWorkspaceSelections(
  grantedScopes: Iterable<string>
): GoogleWorkspaceServiceSelections {
  const grantedSet = new Set(grantedScopes);

  return GOOGLE_WORKSPACE_SERVICE_CONFIGS.reduce((acc, service) => {
    const matchedLevel =
      [...service.levels]
        .sort((left, right) => right.rank - left.rank)
        .find((level) => level.id !== "off" && level.isGranted(grantedSet)) ?? OFF_LEVEL;

    acc[service.id] = matchedLevel.id;
    return acc;
  }, {} as GoogleWorkspaceServiceSelections);
}

export function getGoogleWorkspaceScopesFromSelections(
  selections: Partial<GoogleWorkspaceServiceSelections>
): string[] {
  const selectedScopes = GOOGLE_WORKSPACE_SERVICE_CONFIGS.flatMap((service) => {
    const selectedLevelId = selections[service.id] ?? "off";
    return getGoogleWorkspaceLevel(service.id, selectedLevelId).scopes;
  });

  return uniqueScopes([...GOOGLE_CONNECTOR_SCOPES, ...selectedScopes]);
}

export function compareGoogleWorkspaceSelections(
  currentSelections: GoogleWorkspaceServiceSelections,
  nextSelections: GoogleWorkspaceServiceSelections
) {
  let hasChanges = false;
  let hasAdditions = false;
  let hasRemovals = false;

  for (const service of GOOGLE_WORKSPACE_SERVICE_CONFIGS) {
    const currentLevel = getGoogleWorkspaceLevel(service.id, currentSelections[service.id]);
    const nextLevel = getGoogleWorkspaceLevel(service.id, nextSelections[service.id]);

    if (currentLevel.rank !== nextLevel.rank) {
      hasChanges = true;
    }

    if (nextLevel.rank > currentLevel.rank) {
      hasAdditions = true;
    }

    if (nextLevel.rank < currentLevel.rank) {
      hasRemovals = true;
    }
  }

  return {
    hasChanges,
    hasAdditions,
    hasRemovals,
  };
}

export function countEnabledGoogleWorkspaceServices(
  selections: Partial<GoogleWorkspaceServiceSelections>
): number {
  return GOOGLE_WORKSPACE_SERVICE_CONFIGS.filter(
    (service) => (selections[service.id] ?? "off") !== "off"
  ).length;
}
