import OpenAI from 'openai';
import { GOOGLE_WORKSPACE_TOOLS } from '@/lib/tools/google-suite/definitions';
import { GOOGLE_WORKSPACE_SYSTEM_PROMPT } from '@/lib/tools/google-suite/prompts';
import { createGoogleSuiteClient } from '@/lib/tools/google-suite/client';
import type { ToolHandlerContext } from '@/lib/tools/google-suite/types';
import {
  handleGmailSearch,
  handleGmailRead,
  handleGmailSend,
  handleGmailReply,
  handleGmailDelete,
  handleGmailModify,
  handleGmailGetAttachments,
} from '@/lib/tools/google-suite/gmail/handlers';
import {
  handleDriveSearch,
  handleDriveListFolder,
  handleDriveReadFile,
  handleDriveCreateFile,
  handleDriveCreateFolder,
  handleDriveDelete,
  handleDriveMove,
  handleDriveCopy,
  handleDriveShare,
} from '@/lib/tools/google-suite/drive/handlers';
import {
  handleDocsCreate,
  handleDocsRead,
  handleDocsAppend,
  handleDocsReplace,
} from '@/lib/tools/google-suite/docs/handlers';
import {
  handleCalendarListEvents,
  handleCalendarCreateEvent,
  handleCalendarUpdateEvent,
  handleCalendarDeleteEvent,
} from '@/lib/tools/google-suite/calendar/handlers';
import {
  handleSheetsCreate,
  handleSheetsRead,
  handleSheetsWrite,
  handleSheetsAppend,
  handleSheetsClear,
} from '@/lib/tools/google-suite/sheets/handlers';
import {
  handleSlidesCreate,
  handleSlidesRead,
  handleSlidesAddSlide,
} from '@/lib/tools/google-suite/slides/handlers';

export interface GoogleWorkspaceExecutorOptions {
  query: string;
  userId: string;
  apiKey: string;
  model: string;
  onProgress?: (progress: {
    status: string;
    message: string;
    details?: Record<string, unknown>;
  }) => void;
  abortSignal?: AbortSignal;
}

export async function executeGoogleWorkspace(
  options: GoogleWorkspaceExecutorOptions
): Promise<string> {
  const { query, userId, apiKey, model, onProgress, abortSignal } = options;

  try {
    if (abortSignal?.aborted) {
      throw new Error('Operation aborted by user');
    }

    onProgress?.({
      status: 'initializing',
      message: 'Initializing Google Workspace connection...',
    });

    const { oauth2Client } = await createGoogleSuiteClient(userId);
    const context: ToolHandlerContext = { userId, oauth2Client };

    if (abortSignal?.aborted) {
      throw new Error('Operation aborted by user');
    }

    onProgress?.({
      status: 'analyzing',
      message: 'Analyzing your request...',
    });

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: GOOGLE_WORKSPACE_SYSTEM_PROMPT,
        },
        { role: 'user', content: query },
      ],
      tools: GOOGLE_WORKSPACE_TOOLS,
      tool_choice: 'auto',
    });

    const message = completion.choices[0]?.message;
    if (!message?.tool_calls || message.tool_calls.length === 0) {
      return message?.content || 'Unable to determine appropriate action for your request.';
    }

    if (abortSignal?.aborted) {
      throw new Error('Operation aborted by user');
    }

    const toolCall = message.tool_calls[0];
    if (toolCall.type !== 'function') {
      return 'Invalid tool call type';
    }
    const functionName = toolCall.function.name;
    const args = JSON.parse(toolCall.function.arguments);

    onProgress?.({
      status: 'executing',
      message: `Executing: ${functionName.replace(/_/g, ' ')}...`,
      details: { tool: functionName },
    });

    let result: string;

    switch (functionName) {
      case 'gmail_search':
        result = await handleGmailSearch(context, args);
        break;
      case 'gmail_read':
        result = await handleGmailRead(context, args);
        break;
      case 'gmail_send':
        result = await handleGmailSend(context, args);
        break;
      case 'gmail_reply':
        result = await handleGmailReply(context, args);
        break;
      case 'gmail_delete':
        result = await handleGmailDelete(context, args);
        break;
      case 'gmail_modify':
        result = await handleGmailModify(context, args);
        break;
      case 'gmail_get_attachments':
        result = await handleGmailGetAttachments(context, args);
        break;
      case 'drive_search':
        result = await handleDriveSearch(context, args);
        break;
      case 'drive_list_folder':
        result = await handleDriveListFolder(context, args);
        break;
      case 'drive_read_file':
        result = await handleDriveReadFile(context, args);
        break;
      case 'drive_create_file':
        result = await handleDriveCreateFile(context, args);
        break;
      case 'drive_create_folder':
        result = await handleDriveCreateFolder(context, args);
        break;
      case 'drive_delete':
        result = await handleDriveDelete(context, args);
        break;
      case 'drive_move':
        result = await handleDriveMove(context, args);
        break;
      case 'drive_copy':
        result = await handleDriveCopy(context, args);
        break;
      case 'drive_share':
        result = await handleDriveShare(context, args);
        break;
      case 'docs_create':
        result = await handleDocsCreate(context, args);
        break;
      case 'docs_read':
        result = await handleDocsRead(context, args);
        break;
      case 'docs_append':
        result = await handleDocsAppend(context, args);
        break;
      case 'docs_replace':
        result = await handleDocsReplace(context, args);
        break;
      case 'calendar_list_events':
        result = await handleCalendarListEvents(context, args);
        break;
      case 'calendar_create_event':
        result = await handleCalendarCreateEvent(context, args);
        break;
      case 'calendar_update_event':
        result = await handleCalendarUpdateEvent(context, args);
        break;
      case 'calendar_delete_event':
        result = await handleCalendarDeleteEvent(context, args);
        break;
      case 'sheets_create':
        result = await handleSheetsCreate(context, args);
        break;
      case 'sheets_read':
        result = await handleSheetsRead(context, args);
        break;
      case 'sheets_write':
        result = await handleSheetsWrite(context, args);
        break;
      case 'sheets_append':
        result = await handleSheetsAppend(context, args);
        break;
      case 'sheets_clear':
        result = await handleSheetsClear(context, args);
        break;
      case 'slides_create':
        result = await handleSlidesCreate(context, args);
        break;
      case 'slides_read':
        result = await handleSlidesRead(context, args);
        break;
      case 'slides_add_slide':
        result = await handleSlidesAddSlide(context, args);
        break;
      default:
        throw new Error(`Unknown tool: ${functionName}`);
    }

    if (abortSignal?.aborted) {
      throw new Error('Operation aborted by user');
    }

    onProgress?.({
      status: 'completed',
      message: 'Operation completed successfully',
      details: { tool: functionName },
    });

    return result;
  } catch (error) {
    console.error('[Google Workspace] Error:', error);

    if (error instanceof Error) {
      if (error.message.includes('No valid Google account tokens')) {
        onProgress?.({
          status: 'auth_required',
          message: 'Google Workspace authorization required',
        });
        return 'Google Workspace access not authorized. Please click the "Authorize Google Suite" button to grant access.';
      }

      if (error.message.includes('aborted')) {
        return 'Operation was aborted.';
      }

      return `Error: ${error.message}`;
    }

    return 'An unexpected error occurred while accessing Google Workspace.';
  }
}
