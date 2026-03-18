import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { GOOGLE_WORKSPACE_TOOLS } from '@/lib/tools/google-suite/definitions';
import { GOOGLE_SCOPES, getMissingGoogleScopes } from '@/lib/tools/google-suite/scopes';

const TOOL_SCOPE_REQUIREMENTS: Record<string, string[]> = {
  gmail_search: [GOOGLE_SCOPES.GMAIL_READONLY],
  gmail_read: [GOOGLE_SCOPES.GMAIL_READONLY],
  gmail_get_attachments: [GOOGLE_SCOPES.GMAIL_READONLY],
  gmail_send: [GOOGLE_SCOPES.GMAIL_READONLY, GOOGLE_SCOPES.GMAIL_SEND],
  gmail_reply: [GOOGLE_SCOPES.GMAIL_READONLY, GOOGLE_SCOPES.GMAIL_SEND],
  gmail_delete: [GOOGLE_SCOPES.GMAIL_MODIFY, GOOGLE_SCOPES.GMAIL_LABELS],
  gmail_modify: [GOOGLE_SCOPES.GMAIL_MODIFY, GOOGLE_SCOPES.GMAIL_LABELS],
  drive_search: [GOOGLE_SCOPES.DRIVE_READONLY],
  drive_list_folder: [GOOGLE_SCOPES.DRIVE_READONLY],
  drive_read_file: [GOOGLE_SCOPES.DRIVE_READONLY],
  drive_create_file: [GOOGLE_SCOPES.DRIVE],
  drive_create_folder: [GOOGLE_SCOPES.DRIVE],
  drive_delete: [GOOGLE_SCOPES.DRIVE],
  drive_move: [GOOGLE_SCOPES.DRIVE],
  drive_copy: [GOOGLE_SCOPES.DRIVE],
  drive_share: [GOOGLE_SCOPES.DRIVE],
  docs_create: [GOOGLE_SCOPES.DOCS],
  docs_read: [GOOGLE_SCOPES.DOCS_READONLY],
  docs_append: [GOOGLE_SCOPES.DOCS],
  docs_replace: [GOOGLE_SCOPES.DOCS],
  calendar_list_events: [GOOGLE_SCOPES.CALENDAR_READONLY],
  calendar_create_event: [GOOGLE_SCOPES.CALENDAR],
  calendar_update_event: [GOOGLE_SCOPES.CALENDAR],
  calendar_delete_event: [GOOGLE_SCOPES.CALENDAR],
  sheets_create: [GOOGLE_SCOPES.SHEETS],
  sheets_read: [GOOGLE_SCOPES.SHEETS_READONLY],
  sheets_write: [GOOGLE_SCOPES.SHEETS],
  sheets_append: [GOOGLE_SCOPES.SHEETS],
  sheets_clear: [GOOGLE_SCOPES.SHEETS],
  slides_create: [GOOGLE_SCOPES.SLIDES],
  slides_read: [GOOGLE_SCOPES.SLIDES_READONLY],
  slides_add_slide: [GOOGLE_SCOPES.SLIDES],
};

const TOOL_SERVICE_PREFIXES = {
  gmail: 'gmail_',
  drive: 'drive_',
  docs: 'docs_',
  calendar: 'calendar_',
  sheets: 'sheets_',
  slides: 'slides_',
} as const;

const SCOPE_SERVICE_MAP: Record<string, keyof typeof TOOL_SERVICE_PREFIXES> = {
  [GOOGLE_SCOPES.GMAIL_READONLY]: 'gmail',
  [GOOGLE_SCOPES.GMAIL_SEND]: 'gmail',
  [GOOGLE_SCOPES.GMAIL_MODIFY]: 'gmail',
  [GOOGLE_SCOPES.GMAIL_LABELS]: 'gmail',
  [GOOGLE_SCOPES.DRIVE_READONLY]: 'drive',
  [GOOGLE_SCOPES.DRIVE]: 'drive',
  [GOOGLE_SCOPES.CALENDAR_READONLY]: 'calendar',
  [GOOGLE_SCOPES.CALENDAR]: 'calendar',
  [GOOGLE_SCOPES.DOCS_READONLY]: 'docs',
  [GOOGLE_SCOPES.DOCS]: 'docs',
  [GOOGLE_SCOPES.SHEETS_READONLY]: 'sheets',
  [GOOGLE_SCOPES.SHEETS]: 'sheets',
  [GOOGLE_SCOPES.SLIDES_READONLY]: 'slides',
  [GOOGLE_SCOPES.SLIDES]: 'slides',
};

const TOOL_SERVICE_DEPENDENCIES: Partial<Record<keyof typeof TOOL_SERVICE_PREFIXES, Array<keyof typeof TOOL_SERVICE_PREFIXES>>> = {
  docs: ['drive'],
  sheets: ['drive'],
  slides: ['drive'],
};

function getToolService(toolName: string): keyof typeof TOOL_SERVICE_PREFIXES | null {
  for (const [service, prefix] of Object.entries(TOOL_SERVICE_PREFIXES) as Array<
    [keyof typeof TOOL_SERVICE_PREFIXES, string]
  >) {
    if (toolName.startsWith(prefix)) {
      return service;
    }
  }

  return null;
}

function getGoogleWorkspaceServicesForScopes(scopes: Iterable<string>): Set<keyof typeof TOOL_SERVICE_PREFIXES> {
  const services = new Set<keyof typeof TOOL_SERVICE_PREFIXES>();

  for (const scope of scopes) {
    const service = SCOPE_SERVICE_MAP[scope];
    if (service) {
      services.add(service);
    }
  }

  return services;
}

function expandRequestedServices(
  services: Set<keyof typeof TOOL_SERVICE_PREFIXES>
): Set<keyof typeof TOOL_SERVICE_PREFIXES> {
  const expanded = new Set(services);

  for (const service of services) {
    for (const dependency of TOOL_SERVICE_DEPENDENCIES[service] ?? []) {
      expanded.add(dependency);
    }
  }

  return expanded;
}

export function isGoogleWorkspaceToolAllowed(
  toolName: string,
  grantedScopes: Iterable<string>
): boolean {
  const requiredScopes = TOOL_SCOPE_REQUIREMENTS[toolName];
  if (!requiredScopes) {
    return false;
  }

  return getMissingGoogleScopes(requiredScopes, grantedScopes).length === 0;
}

export function getAvailableGoogleWorkspaceTools(
  grantedScopes: Iterable<string>,
  requestedScopes?: Iterable<string>
): ChatCompletionTool[] {
  const requestedServices = requestedScopes
    ? expandRequestedServices(getGoogleWorkspaceServicesForScopes(requestedScopes))
    : null;

  return GOOGLE_WORKSPACE_TOOLS.filter((tool) =>
    tool.type === 'function' &&
    isGoogleWorkspaceToolAllowed(tool.function.name, grantedScopes) &&
    (
      !requestedServices ||
      requestedServices.size === 0 ||
      (getToolService(tool.function.name) !== null &&
        requestedServices.has(getToolService(tool.function.name)!))
    )
  );
}
