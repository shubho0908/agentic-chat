import OpenAI from 'openai';
import { GOOGLE_WORKSPACE_TOOLS } from '@/lib/tools/google-suite/definitions';
import { GOOGLE_WORKSPACE_SYSTEM_PROMPT } from '@/lib/tools/google-suite/prompts';
import { createGoogleSuiteClient, GOOGLE_AUTH_REVOKED_ERROR } from '@/lib/tools/google-suite/client';
import { getToolDisplayName } from '@/utils/google/tool-names';
import type { ToolHandlerContext } from '@/lib/tools/google-suite/types';
import type {
  HandlerArgs,
  GmailSearchArgs,
  GmailReadArgs,
  GmailSendArgs,
  GmailReplyArgs,
  GmailDeleteArgs,
  GmailModifyArgs,
  GmailGetAttachmentsArgs,
  DriveSearchArgs,
  DriveListFolderArgs,
  DriveReadFileArgs,
  DriveCreateFileArgs,
  DriveCreateFolderArgs,
  DriveDeleteArgs,
  DriveMoveArgs,
  DriveCopyArgs,
  DriveShareArgs,
  DocsCreateArgs,
  DocsReadArgs,
  DocsAppendArgs,
  DocsReplaceArgs,
  CalendarListEventsArgs,
  CalendarCreateEventArgs,
  CalendarUpdateEventArgs,
  CalendarDeleteEventArgs,
  SheetsCreateArgs,
  SheetsReadArgs,
  SheetsWriteArgs,
  SheetsAppendArgs,
  SheetsClearArgs,
  SlidesCreateArgs,
  SlidesReadArgs,
  SlidesAddSlideArgs,
} from '@/lib/tools/google-suite/types/handler-types';
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

async function executeToolCall(
  context: ToolHandlerContext,
  functionName: string,
  args: HandlerArgs
): Promise<string> {
  switch (functionName) {
    case 'gmail_search':
      return await handleGmailSearch(context, args as GmailSearchArgs);
    case 'gmail_read':
      return await handleGmailRead(context, args as GmailReadArgs);
    case 'gmail_send':
      return await handleGmailSend(context, args as GmailSendArgs);
    case 'gmail_reply':
      return await handleGmailReply(context, args as GmailReplyArgs);
    case 'gmail_delete':
      return await handleGmailDelete(context, args as GmailDeleteArgs);
    case 'gmail_modify':
      return await handleGmailModify(context, args as GmailModifyArgs);
    case 'gmail_get_attachments':
      return await handleGmailGetAttachments(context, args as GmailGetAttachmentsArgs);
    case 'drive_search':
      return await handleDriveSearch(context, args as DriveSearchArgs);
    case 'drive_list_folder':
      return await handleDriveListFolder(context, args as DriveListFolderArgs);
    case 'drive_read_file':
      return await handleDriveReadFile(context, args as DriveReadFileArgs);
    case 'drive_create_file':
      return await handleDriveCreateFile(context, args as DriveCreateFileArgs);
    case 'drive_create_folder':
      return await handleDriveCreateFolder(context, args as DriveCreateFolderArgs);
    case 'drive_delete':
      return await handleDriveDelete(context, args as DriveDeleteArgs);
    case 'drive_move':
      return await handleDriveMove(context, args as DriveMoveArgs);
    case 'drive_copy':
      return await handleDriveCopy(context, args as DriveCopyArgs);
    case 'drive_share':
      return await handleDriveShare(context, args as DriveShareArgs);
    case 'docs_create':
      return await handleDocsCreate(context, args as DocsCreateArgs);
    case 'docs_read':
      return await handleDocsRead(context, args as DocsReadArgs);
    case 'docs_append':
      return await handleDocsAppend(context, args as DocsAppendArgs);
    case 'docs_replace':
      return await handleDocsReplace(context, args as DocsReplaceArgs);
    case 'calendar_list_events':
      return await handleCalendarListEvents(context, args as CalendarListEventsArgs);
    case 'calendar_create_event':
      return await handleCalendarCreateEvent(context, args as CalendarCreateEventArgs);
    case 'calendar_update_event':
      return await handleCalendarUpdateEvent(context, args as CalendarUpdateEventArgs);
    case 'calendar_delete_event':
      return await handleCalendarDeleteEvent(context, args as CalendarDeleteEventArgs);
    case 'sheets_create':
      return await handleSheetsCreate(context, args as SheetsCreateArgs);
    case 'sheets_read':
      return await handleSheetsRead(context, args as SheetsReadArgs);
    case 'sheets_write':
      return await handleSheetsWrite(context, args as SheetsWriteArgs);
    case 'sheets_append':
      return await handleSheetsAppend(context, args as SheetsAppendArgs);
    case 'sheets_clear':
      return await handleSheetsClear(context, args as SheetsClearArgs);
    case 'slides_create':
      return await handleSlidesCreate(context, args as SlidesCreateArgs);
    case 'slides_read':
      return await handleSlidesRead(context, args as SlidesReadArgs);
    case 'slides_add_slide':
      return await handleSlidesAddSlide(context, args as SlidesAddSlideArgs);
    default:
      throw new Error(`Unknown tool: ${functionName}`);
  }
}

export async function executeGoogleWorkspace(
  options: GoogleWorkspaceExecutorOptions
): Promise<string> {
  const { query, userId, apiKey, model, onProgress, abortSignal } = options;

  try {
    if (abortSignal?.aborted) throw new Error('Operation aborted by user');

    onProgress?.({
      status: 'initializing',
      message: 'Initializing Google Workspace connection...',
    });

    const { oauth2Client } = await createGoogleSuiteClient(userId);
    const context: ToolHandlerContext = { userId, oauth2Client };
    const openai = new OpenAI({ apiKey });

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: GOOGLE_WORKSPACE_SYSTEM_PROMPT },
      { role: 'user', content: query },
    ];

    const MAX_ITERATIONS = 20;
    let consecutiveErrors = 0;
    let finalResponse = '';
    let taskCount = 0;

    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      if (abortSignal?.aborted) throw new Error('Operation aborted by user');
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg?.role === 'tool') {
          let foundToolCalls = false;
          for (let j = i - 1; j >= 0; j--) {
            const prevMsg = messages[j];
            if (prevMsg?.role === 'assistant' && 'tool_calls' in prevMsg && prevMsg.tool_calls) {
              foundToolCalls = true;
              break;
            }
            if (prevMsg?.role !== 'tool') {
              break;
            }
          }
          if (!foundToolCalls) {
            console.error('[Google Workspace Executor] Invalid message structure at iteration', iteration, ':', {
              index: i,
              messageRoles: messages.map((m, idx) => ({ idx, role: m?.role, hasToolCalls: m?.role === 'assistant' && 'tool_calls' in m })),
            });
            throw new Error(`Invalid message structure: tool message at index ${i} without preceding tool_calls`);
          }
        }
      }

      const completion = await openai.chat.completions.create({
        model,
        messages,
        tools: GOOGLE_WORKSPACE_TOOLS,
        tool_choice: 'auto',
      });

      const message = completion.choices[0]?.message;
      if (!message) throw new Error('No response from AI');

      if (!message.tool_calls?.length) {
        if (iteration === 1 && taskCount === 0) {
          messages.push({
            role: 'assistant',
            content: message.content,
          });
          messages.push({
            role: 'user',
            content: `You MUST execute the requested actions using the available tools. Break down the user's request into specific tool calls and execute them now. Do not just respond with text - use the tools provided.`,
          });
          continue;
        }
        
        finalResponse = message.content || 'Task completed successfully.';
        onProgress?.({
          status: 'completed',
          message: `Task completed (${taskCount} actions executed)`,
        });
        break;
      }

      messages.push({
        role: 'assistant',
        content: message.content,
        tool_calls: message.tool_calls,
      });

      const toolResults = await Promise.all(
        message.tool_calls.map(async (toolCall) => {
          if (toolCall.type !== 'function') {
            console.error('[Google Workspace Executor] Invalid tool call type:', toolCall.type);
            return { tool_call_id: toolCall.id, content: 'Invalid tool call type' };
          }

          const functionName = toolCall.function.name;
          let args: HandlerArgs;
          
          try {
            args = JSON.parse(toolCall.function.arguments) as HandlerArgs;
          } catch {
            console.error('[Google Workspace Executor] Failed to parse arguments:', toolCall.function.arguments);
            return {
              tool_call_id: toolCall.id,
              content: 'Error: Invalid JSON arguments',
            };
          }

          taskCount++;
          onProgress?.({
            status: 'executing',
            message: `${getToolDisplayName(functionName)}...`,
            details: { tool: functionName, iteration, step: taskCount },
          });

          try {
            const result = await executeToolCall(context, functionName, args);
            consecutiveErrors = 0;
            return { tool_call_id: toolCall.id, content: result };
          } catch (error) {
            if (error instanceof Error && error.message === GOOGLE_AUTH_REVOKED_ERROR) {
              console.error(`[Google Workspace Executor] ✗ Authorization revoked for ${functionName}`);
              onProgress?.({
                status: 'auth_required',
                message: 'Google Workspace authorization has been revoked or expired',
              });
              return {
                tool_call_id: toolCall.id,
                content: 'Error: Your Google Workspace authorization has been revoked or expired. Please click the "Authorize Google Suite" button in the Tools menu to re-authenticate and grant the necessary permissions.',
              };
            }

            consecutiveErrors++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[Google Workspace Executor] ✗ ${functionName} failed:`, errorMessage);
            console.error('[Google Workspace Executor] Error details:', error);
            return {
              tool_call_id: toolCall.id,
              content: `Error: ${errorMessage}`,
            };
          }
        })
      );

      if (consecutiveErrors >= 3) {
        console.error('[Google Workspace Executor] Too many consecutive errors, aborting');
        return 'Multiple consecutive errors occurred. Please check your request and try again.';
      }

      toolResults.forEach((result) => {
        messages.push({
          role: 'tool',
          tool_call_id: result.tool_call_id,
          content: result.content,
        });
      });

      if (iteration >= 1) {
        messages.push({
          role: 'user',
          content: `✓ Step ${taskCount} complete. VALIDATION: Analyze the result above and:\n1. Extract any IDs, links, or data needed for remaining steps\n2. Decide: Execute next step OR finish if task is complete\n\nReminder: Continue until ALL parts of the original request are satisfied.`,
        });
      }

      if (messages.length > 40) {
        const systemMsg = messages[0];
        const userMsg = messages[1];
        let sliceStart = messages.length - 35;
        
        while (sliceStart > 2) {
          const msgAtStart = messages[sliceStart];
          const prevMsg = messages[sliceStart - 1];
          
          if (msgAtStart?.role === 'tool') {
            sliceStart--;
            continue;
          }
          
          if (prevMsg?.role === 'assistant' && 'tool_calls' in prevMsg && prevMsg.tool_calls) {
            sliceStart--;
            continue;
          }
          break;
        }
        
        const recentMessages = messages.slice(sliceStart);
        messages.length = 0;
        messages.push(systemMsg!, userMsg!, ...recentMessages);
      }
    }

    return finalResponse || 'Task execution reached maximum iterations. Some steps may be incomplete.';
  } catch (error) {
    console.error('[Google Workspace] Error:', error);

    if (error instanceof Error && error.message === GOOGLE_AUTH_REVOKED_ERROR) {
      onProgress?.({
        status: 'auth_required',
        message: 'Google Workspace authorization has been revoked or expired',
      });
      return 'Your Google Workspace authorization has been revoked or expired. Please click the "Authorize Google Suite" button in the Tools menu to re-authenticate and grant the necessary permissions.';
    }

    if (error instanceof Error) {
      if (error.message.includes('No valid Google account tokens') || 
          error.message.includes('not authorized')) {
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
