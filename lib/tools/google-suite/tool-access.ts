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

export function isGoogleWorkspaceToolAllowed(
  toolName: string,
  grantedScopes: Iterable<string>
): boolean {
  return getMissingGoogleScopes(TOOL_SCOPE_REQUIREMENTS[toolName] ?? [], grantedScopes).length === 0;
}

export function getAvailableGoogleWorkspaceTools(
  grantedScopes: Iterable<string>
): ChatCompletionTool[] {
  return GOOGLE_WORKSPACE_TOOLS.filter((tool) =>
    tool.type === 'function' && isGoogleWorkspaceToolAllowed(tool.function.name, grantedScopes)
  );
}
