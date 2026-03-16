import { getToolDisplayName } from '@/utils/google/tool-names';

export const DESTRUCTIVE_GOOGLE_WORKSPACE_TOOLS = new Set([
  'gmail_send',
  'gmail_reply',
  'gmail_delete',
  'gmail_modify',
  'drive_create_file',
  'drive_create_folder',
  'drive_delete',
  'drive_move',
  'drive_copy',
  'drive_share',
  'docs_create',
  'docs_append',
  'docs_replace',
  'calendar_create_event',
  'calendar_update_event',
  'calendar_delete_event',
  'sheets_create',
  'sheets_write',
  'sheets_append',
  'sheets_clear',
  'slides_create',
  'slides_add_slide',
]);

export function hasExplicitGoogleWorkspaceApproval(query: string): boolean {
  return /\b(confirm|confirmed|approve|approved|go ahead|i authorize|proceed|yes[, ]+(send|delete|share|create|update|move|copy|modify|reply|clear))\b/i.test(query);
}

export function buildGoogleWorkspaceApprovalBarrierMessage(toolNames: string[]): string {
  const uniqueTools = Array.from(new Set(toolNames));
  return `Approval required before I make changes in Google Workspace.\n\nPlanned actions:\n${uniqueTools.map((tool) => `- ${getToolDisplayName(tool)}`).join('\n')}\n\nReply with a clear confirmation such as "approve these Google Workspace actions" and I will continue.`;
}
