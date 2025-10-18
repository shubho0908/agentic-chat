export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  // Gmail
  gmail_search: 'Searching mails',
  gmail_read: 'Reading mail',
  gmail_send: 'Sending email',
  gmail_reply: 'Replying to mail',
  gmail_delete: 'Deleting mails',
  gmail_modify: 'Updating mail labels',
  gmail_get_attachments: 'Getting attachments',
  
  // Drive
  drive_search: 'Searching Drive',
  drive_list_folder: 'Listing folder contents',
  drive_read_file: 'Reading file',
  drive_create_file: 'Creating file',
  drive_create_folder: 'Creating folder',
  drive_delete: 'Moving to trash',
  drive_move: 'Moving file',
  drive_copy: 'Copying file',
  drive_share: 'Sharing file',
  
  // Docs
  docs_create: 'Creating document',
  docs_read: 'Reading document',
  docs_append: 'Adding to document',
  docs_replace: 'Updating document',
  
  // Calendar
  calendar_list_events: 'Listing calendar events',
  calendar_create_event: 'Creating calendar event',
  calendar_update_event: 'Updating event',
  calendar_delete_event: 'Deleting event',
  
  // Sheets
  sheets_create: 'Creating spreadsheet',
  sheets_read: 'Reading spreadsheet',
  sheets_write: 'Writing to spreadsheet',
  sheets_append: 'Adding rows to spreadsheet',
  sheets_clear: 'Clearing spreadsheet cells',
  
  // Slides
  slides_create: 'Creating presentation',
  slides_read: 'Reading presentation',
  slides_add_slide: 'Adding slide',
};

export function getToolDisplayName(toolName: string): string {
  return TOOL_DISPLAY_NAMES[toolName] || toolName.replace(/_/g, ' ');
}
