import OpenAI from 'openai';
import { GOOGLE_WORKSPACE_SYSTEM_PROMPT } from '@/lib/tools/google-suite/prompts';
import { createGoogleSuiteClient, isAuthRevokedError } from '@/lib/tools/google-suite/client';
import { getToolDisplayName } from '@/utils/google/tool-names';
import { TOOL_ERROR_MESSAGES } from '@/constants/errors';
import type { ToolHandlerContext } from '@/lib/tools/google-suite/types';
import type { GoogleWorkspaceProgressCallback } from '@/types/google-suite';
import type { GoogleSuiteTask } from '@/types/tools';
import { wrapOpenAIWithLangSmith, withTrace } from '@/lib/langsmith-config';
import { getStageModel } from '@/lib/model-policy';
import { withRetry } from '@/lib/retry';
import {
  DESTRUCTIVE_GOOGLE_WORKSPACE_TOOLS,
  hasExplicitGoogleWorkspaceApproval,
  buildGoogleWorkspaceApprovalBarrierMessage,
  type GoogleWorkspacePlannedAction,
} from '@/lib/tools/google-suite/safety';
import { getAvailableGoogleWorkspaceTools, isGoogleWorkspaceToolAllowed } from '@/lib/tools/google-suite/tool-access';
import { validateGoogleToolArgs } from '@/lib/tools/google-suite/tool-schemas';
import { countTextTokens } from '@/lib/utils/token-counter';
import { OPENAI_MODELS } from '@/constants/openai-models';
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

interface GoogleWorkspaceExecutorOptions {
  query: string;
  userId: string;
  apiKey: string;
  model: string;
  conversationHistory?: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  onProgress?: GoogleWorkspaceProgressCallback;
  abortSignal?: AbortSignal;
}

function getGoogleWorkspaceInputBudget(model: string): number {
  const contextWindow = OPENAI_MODELS.find((candidate) => candidate.id === model)?.contextWindow ?? 128000;
  return Math.min(120000, Math.max(12000, Math.floor(contextWindow * 0.25)));
}

function estimateWorkspaceMessageTokens(
  message: OpenAI.Chat.Completions.ChatCompletionMessageParam,
  model: string
): number {
  const textParts: string[] = [];

  if (typeof message.content === 'string') {
    textParts.push(message.content);
  } else if (Array.isArray(message.content)) {
    textParts.push(
      message.content
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map((part) => part.text)
        .join('\n')
    );
  }

  if ('tool_calls' in message && message.tool_calls) {
    textParts.push(JSON.stringify(message.tool_calls));
  }

  if ('tool_call_id' in message && typeof message.tool_call_id === 'string') {
    textParts.push(message.tool_call_id);
  }

  return countTextTokens(textParts.join('\n'), model) + 4;
}

function trimWorkspaceMessagesToBudget(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  model: string
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  if (messages.length <= 2) {
    return messages;
  }

  const preserved = messages.slice(0, 2);
  const recent = [...messages.slice(2)];
  const budget = getGoogleWorkspaceInputBudget(model);

  const estimateTotal = () =>
    [...preserved, ...recent].reduce((total, message) => total + estimateWorkspaceMessageTokens(message, model), 0);

  while (recent.length > 1 && estimateTotal() > budget) {
    recent.shift();

    while (recent[0]?.role === 'tool') {
      recent.shift();
    }
  }

  return [...preserved, ...recent];
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
      throw new Error(TOOL_ERROR_MESSAGES.GOOGLE_SUITE.UNKNOWN_TOOL(functionName));
  }
}

export async function executeGoogleWorkspace(
  options: GoogleWorkspaceExecutorOptions
): Promise<string> {
  const { query, userId, apiKey, model, conversationHistory, onProgress, abortSignal } = options;

  return withTrace(
    'google-workspace-execution',
    async () => {
      try {
    if (abortSignal?.aborted) throw new Error(TOOL_ERROR_MESSAGES.GOOGLE_SUITE.OPERATION_ABORTED_BY_USER);

    onProgress?.({
      status: 'initializing',
      message: 'Initializing Google Workspace connection...',
    });

    const { oauth2Client, grantedScopes } = await createGoogleSuiteClient(userId);
    const context: ToolHandlerContext = { userId, oauth2Client };
    const openai = wrapOpenAIWithLangSmith(new OpenAI({ apiKey }));
    const availableTools = getAvailableGoogleWorkspaceTools(grantedScopes);

    if (availableTools.length === 0) {
      return TOOL_ERROR_MESSAGES.GOOGLE_SUITE.NOT_AUTHORIZED_MENU;
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: GOOGLE_WORKSPACE_SYSTEM_PROMPT },
      { role: 'user', content: `Original user request: ${query}` },
    ];

    if (conversationHistory && conversationHistory.length > 0) {
      messages.push(...conversationHistory);
    }

    messages.push({ role: 'user', content: query });

    onProgress?.({
      status: 'analyzing',
      message: 'Analyzing request and planning actions...',
      details: { query },
    });

    const MAX_ITERATIONS = 20;
    let consecutiveErrors = 0;
    let finalResponse = '';
    let taskCount = 0;
    const allTasks: GoogleSuiteTask[] = [];

    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      if (abortSignal?.aborted) throw new Error(TOOL_ERROR_MESSAGES.GOOGLE_SUITE.OPERATION_ABORTED_BY_USER);
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
            throw new Error(TOOL_ERROR_MESSAGES.GOOGLE_SUITE.INVALID_MESSAGE_STRUCTURE(i));
          }
        }
      }

      const completion = await withRetry(
        () =>
          openai.chat.completions.create(
            {
              model: getStageModel(model, 'workspace_agent'),
              messages,
              tools: availableTools,
              tool_choice: 'auto',
            },
            { signal: abortSignal }
          ),
        { signal: abortSignal }
      );

      const message = completion.choices[0]?.message;
      if (!message) throw new Error(TOOL_ERROR_MESSAGES.GOOGLE_SUITE.NO_RESPONSE);

      if (!message.tool_calls?.length) {
        finalResponse = message.content || 'Task completed successfully.';
        
        const completedTasks = allTasks.filter(t => t.status === 'completed');
        onProgress?.({
          status: 'completed',
          message: `Task completed (${taskCount} actions executed)`,
          details: {
            step: taskCount,
            totalSteps: taskCount,
            allTasks,
            completedTasks,
          },
        });
        break;
      }

      if (iteration === 1 && message.tool_calls?.length > 0) {
        const toolsToUse = message.tool_calls
          .filter(tc => tc.type === 'function')
          .map(tc => tc.function.name);
        onProgress?.({
          status: 'planning',
          message: `Planning complete: Will execute ${toolsToUse.length} action(s)`,
          details: {
            iteration,
            planning: {
              toolsToUse,
              estimatedSteps: toolsToUse.length,
            },
          },
        });
      }

      if (message.content) {
        onProgress?.({
          status: 'thinking',
          message: 'Analyzing results and planning next steps...',
          details: {
            iteration,
            thinking: message.content.substring(0, 200),
          },
        });
      }

      messages.push({
        role: 'assistant',
        content: message.content,
        tool_calls: message.tool_calls,
      });

      const toolResults: Array<{ tool_call_id: string; content: string }> = [];
      const plannedActions = new Map<string, GoogleWorkspacePlannedAction>();

      for (const toolCall of message.tool_calls) {
        if (toolCall.type !== 'function') {
          continue;
        }

        try {
          const parsedArgs = JSON.parse(toolCall.function.arguments) as HandlerArgs;
          const validatedArgs = validateGoogleToolArgs(toolCall.function.name, parsedArgs);
          plannedActions.set(toolCall.id, {
            toolName: toolCall.function.name,
            args: validatedArgs,
          });
        } catch (error) {
          console.warn(
            '[Google Workspace Executor] Failed to pre-validate planned action:',
            toolCall.function.name,
            error
          );
        }
      }

      const destructiveActions = Array.from(plannedActions.values()).filter((action) =>
        DESTRUCTIVE_GOOGLE_WORKSPACE_TOOLS.has(action.toolName)
      );

      if (
        destructiveActions.length > 0 &&
        !(await hasExplicitGoogleWorkspaceApproval(query, destructiveActions, { userId }))
      ) {
        return await buildGoogleWorkspaceApprovalBarrierMessage(destructiveActions, { userId });
      }

      for (const toolCall of message.tool_calls) {
          if (toolCall.type !== 'function') {
            console.error('[Google Workspace Executor] Invalid tool call type:', toolCall.type);
            toolResults.push({ tool_call_id: toolCall.id, content: 'Invalid tool call type' });
            continue;
          }

          const functionName = toolCall.function.name;
          let args: HandlerArgs;
          
          try {
            const plannedAction = plannedActions.get(toolCall.id);
            if (!plannedAction) {
              throw new Error('Tool arguments failed validation');
            }
            args = plannedAction.args as HandlerArgs;
          } catch {
            console.error('[Google Workspace Executor] Failed to parse arguments:', toolCall.function.arguments);
            toolResults.push({
              tool_call_id: toolCall.id,
              content: TOOL_ERROR_MESSAGES.GOOGLE_SUITE.INVALID_JSON_ARGS,
            });
            continue;
          }

          taskCount++;
          const taskId = `task_${iteration}_${taskCount}`;
          const taskDescription = getToolDisplayName(functionName);
          
          const currentTask: GoogleSuiteTask = {
            id: taskId,
            tool: functionName,
            description: taskDescription,
            status: 'in_progress',
            iteration,
          };
          
          allTasks.push(currentTask);

          if (!isGoogleWorkspaceToolAllowed(functionName, grantedScopes)) {
            currentTask.status = 'failed';
            currentTask.error = TOOL_ERROR_MESSAGES.GOOGLE_SUITE.NOT_AUTHORIZED_MENU;
            toolResults.push({
              tool_call_id: toolCall.id,
              content: TOOL_ERROR_MESSAGES.GOOGLE_SUITE.NOT_AUTHORIZED_MENU,
            });
            continue;
          }
          
          onProgress?.({
            status: 'task_start',
            message: `Starting: ${taskDescription}`,
            details: { 
              tool: functionName, 
              iteration, 
              step: taskCount,
              currentTask,
              allTasks: [...allTasks],
            },
          });

          onProgress?.({
            status: 'executing',
            message: `${taskDescription}...`,
            details: { 
              tool: functionName, 
              iteration, 
              step: taskCount,
              currentTask,
              allTasks: [...allTasks],
            },
          });

          try {
            const result = await withRetry(
              () => executeToolCall(context, functionName, args),
              { signal: abortSignal, retries: 2 }
            );
            consecutiveErrors = 0;
            
            currentTask.status = 'completed';
            currentTask.result = result.substring(0, 200);
            
            onProgress?.({
              status: 'task_complete',
              message: `✓ Completed: ${taskDescription}`,
              details: { 
                tool: functionName, 
                iteration, 
                step: taskCount,
                currentTask,
                allTasks: [...allTasks],
                completedTasks: allTasks.filter(t => t.status === 'completed'),
              },
            });
            
            toolResults.push({ tool_call_id: toolCall.id, content: result });
            continue;
          } catch (error) {
            currentTask.status = 'failed';
            currentTask.error = error instanceof Error ? error.message : 'Unknown error';
            
            if (isAuthRevokedError(error)) {
              console.error(`[Google Workspace Executor] ✗ Authorization revoked for ${functionName}`);
              onProgress?.({
                status: 'auth_required',
                message: 'Google Workspace authorization has been revoked or expired',
              });
              toolResults.push({
                tool_call_id: toolCall.id,
                content: TOOL_ERROR_MESSAGES.GOOGLE_SUITE.AUTH_REVOKED,
              });
              continue;
            }

            consecutiveErrors++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[Google Workspace Executor] ✗ ${functionName} failed:`, errorMessage);
            console.error('[Google Workspace Executor] Error details:', error);
            toolResults.push({
              tool_call_id: toolCall.id,
              content: `Error: ${errorMessage}`,
            });
            continue;
          }
      }

      if (consecutiveErrors >= 3) {
        console.error('[Google Workspace Executor] Too many consecutive errors, aborting');
        return TOOL_ERROR_MESSAGES.GOOGLE_SUITE.MULTIPLE_ERRORS;
      }

      toolResults.forEach((result) => {
        messages.push({
          role: 'tool',
          tool_call_id: result.tool_call_id,
          content: result.content,
        });
      });

      if (iteration >= 1) {
        const completedInIteration = allTasks.filter(t => t.iteration === iteration && t.status === 'completed').length;
        
        onProgress?.({
          status: 'validating',
          message: `Validating results from iteration ${iteration}...`,
          details: {
            iteration,
            completedInIteration,
            totalCompleted: allTasks.filter(t => t.status === 'completed').length,
          },
        });
        
        messages.push({
          role: 'user',
          content: `✓ Step ${taskCount} complete. VALIDATION: Analyze the result above and:\n1. Extract any IDs, links, or data needed for remaining steps\n2. Decide: Execute next step OR finish if task is complete\n\nReminder: Continue until ALL parts of the original request are satisfied.`,
        });
      }

      const trimmedMessages = trimWorkspaceMessagesToBudget(messages, model);
      if (trimmedMessages.length !== messages.length) {
        messages.length = 0;
        messages.push(...trimmedMessages);
      }
    }

      return finalResponse || TOOL_ERROR_MESSAGES.GOOGLE_SUITE.MAX_ITERATIONS_REACHED;
    } catch (error) {
      console.error('[Google Workspace] Error:', error);

      if (isAuthRevokedError(error)) {
        onProgress?.({
          status: 'auth_required',
          message: 'Google Workspace authorization has been revoked or expired',
        });
        return TOOL_ERROR_MESSAGES.GOOGLE_SUITE.AUTH_REVOKED;
      }

      if (error instanceof Error) {
        if (error.message.includes('not authorized') ||
            error.message.includes('Please sign in with Google')) {
          onProgress?.({
            status: 'auth_required',
            message: 'Google Workspace authorization required',
          });
          return TOOL_ERROR_MESSAGES.GOOGLE_SUITE.NOT_AUTHORIZED_MENU;
        }

        if (error.message.includes('aborted')) {
          return TOOL_ERROR_MESSAGES.GOOGLE_SUITE.ABORTED;
        }

        return `Error: ${error.message}`;
      }

      return TOOL_ERROR_MESSAGES.GOOGLE_SUITE.UNEXPECTED_ERROR;
    }
  },
  {
    userId,
    query,
    model,
    hasConversationHistory: !!conversationHistory?.length,
  }
);
}
