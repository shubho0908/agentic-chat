import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { GMAIL_TOOLS } from '@/lib/tools/google-suite/gmail/definitions';
import { DRIVE_TOOLS } from '@/lib/tools/google-suite/drive/definitions';
import { DOCS_TOOLS } from '@/lib/tools/google-suite/docs/definitions';
import { CALENDAR_TOOLS } from '@/lib/tools/google-suite/calendar/definitions';
import { SHEETS_TOOLS } from '@/lib/tools/google-suite/sheets/definitions';
import { SLIDES_TOOLS } from '@/lib/tools/google-suite/slides/definitions';

export const GOOGLE_WORKSPACE_TOOLS: ChatCompletionTool[] = [
  ...GMAIL_TOOLS,
  ...DRIVE_TOOLS,
  ...DOCS_TOOLS,
  ...CALENDAR_TOOLS,
  ...SHEETS_TOOLS,
  ...SLIDES_TOOLS,
];
