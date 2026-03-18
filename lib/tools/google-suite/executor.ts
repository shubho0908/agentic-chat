import OpenAI from 'openai';
import { GOOGLE_WORKSPACE_SYSTEM_PROMPT } from '@/lib/tools/google-suite/prompts';
import { createGoogleSuiteClient, isAuthRevokedError } from '@/lib/tools/google-suite/client';
import { getToolDisplayName } from '@/utils/google/toolNames';
import { TOOL_ERROR_MESSAGES } from '@/constants/errors';
import type { ToolHandlerContext } from '@/lib/tools/google-suite/types';
import type { GoogleWorkspaceProgressCallback } from '@/types/googleSuite';
import type { GoogleSuiteTask } from '@/types/tools';
import { wrapOpenAIWithLangSmith, withTrace } from '@/lib/langsmithConfig';
import { getStageModel } from '@/lib/modelPolicy';
import { withRetry } from '@/lib/retry';
import {

  DESTRUCTIVE_GOOGLE_WORKSPACE_TOOLS,
  hasExplicitGoogleWorkspaceApproval,
  buildGoogleWorkspaceApprovalBarrierMessage,
  type GoogleWorkspacePlannedAction,
} from '@/lib/tools/google-suite/safety';
import { getAvailableGoogleWorkspaceTools, isGoogleWorkspaceToolAllowed } from '@/lib/tools/google-suite/toolAccess';
import { validateGoogleToolArgs } from '@/lib/tools/google-suite/toolSchemas';
import { countTextTokens } from '@/lib/utils/tokenCounter';
import { OPENAI_MODELS } from '@/constants/openai-models';
import { resolveGoogleWorkspaceScopesForRequest } from '@/lib/tools/google-suite/scopes';
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
} from '@/lib/tools/google-suite/types/handlerTypes';
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

import { logger } from "@/lib/logger";
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

  const preservedIndexes = new Set<number>([0]);
  for (let index = messages.length - 1; index >= 1; index -= 1) {
    if (messages[index]?.role === 'user') {
      preservedIndexes.add(index);
      break;
    }
  }

  const preservedEntries = messages
    .map((message, index) => ({ message, index }))
    .filter(({ index }) => preservedIndexes.has(index));
  const recentEntries = messages
    .map((message, index) => ({ message, index }))
    .filter(({ index }) => !preservedIndexes.has(index));
  const budget = getGoogleWorkspaceInputBudget(model);

  const estimateTotal = () =>
    [...preservedEntries, ...recentEntries].reduce(
      (total, { message }) => total + estimateWorkspaceMessageTokens(message, model),
      0
    );

  while (recentEntries.length > 1 && estimateTotal() > budget) {
    recentEntries.shift();

    while (recentEntries[0]?.message.role === 'tool') {
      recentEntries.shift();
    }
  }

  return [...preservedEntries, ...recentEntries]
    .sort((left, right) => left.index - right.index)
    .map(({ message }) => message);
}

function extractTextContent(
  message: OpenAI.Chat.Completions.ChatCompletionMessageParam
): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
  }

  return '';
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

function getSingleToolCallMessage(
  message: OpenAI.Chat.Completions.ChatCompletionMessage,
  availableToolNames: Set<string>
): {
  message: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam;
  skippedToolCalls: number;
} {
  const functionToolCalls = (message.tool_calls ?? []).filter(
    (toolCall): toolCall is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & { type: 'function' } =>
      toolCall.type === 'function'
  );

  if (functionToolCalls.length === 0) {
    return {
      message: {
        role: 'assistant',
        content: message.content,
        tool_calls: message.tool_calls,
      },
      skippedToolCalls: 0,
    };
  }

  const firstAllowedToolCall =
    functionToolCalls.find((toolCall) => availableToolNames.has(toolCall.function.name)) ??
    functionToolCalls[0];

  return {
    message: {
      role: 'assistant',
      content: message.content,
      tool_calls: [firstAllowedToolCall],
    },
    skippedToolCalls: Math.max(0, functionToolCalls.length - 1),
  };
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
      const workspaceModel = getStageModel(model, 'workspace_agent');
      const recentContext = (conversationHistory ?? [])
        .map((message) => extractTextContent(message))
        .filter((content) => content.trim().length > 0);
      const scopeResolution = resolveGoogleWorkspaceScopesForRequest(query, recentContext);
	    const availableTools = getAvailableGoogleWorkspaceTools(
        grantedScopes,
        scopeResolution.source === 'unknown' ? undefined : scopeResolution.requiredScopes
      );
      const availableToolNames = new Set(
        availableTools
          .filter((tool): tool is OpenAI.Chat.Completions.ChatCompletionTool & { type: 'function' } => tool.type === 'function')
          .map((tool) => tool.function.name)
      );

	    if (availableTools.length === 0) {
	      return TOOL_ERROR_MESSAGES.GOOGLE_SUITE.NOT_AUTHORIZED_MENU;
	    }

	    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
	      { role: 'system', content: GOOGLE_WORKSPACE_SYSTEM_PROMPT },
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
            logger.error('[Google Workspace Executor] Invalid message structure at iteration', iteration, ':', {
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
              model: workspaceModel,
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

        const singleToolCallMessage = getSingleToolCallMessage(message, availableToolNames);

	      messages.push(singleToolCallMessage.message);

	      const toolResults: Array<{ tool_call_id: string; content: string }> = [];
	      const plannedActions = new Map<string, GoogleWorkspacePlannedAction>();

	      for (const toolCall of singleToolCallMessage.message.tool_calls ?? []) {
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
          logger.warn(
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

        if (singleToolCallMessage.skippedToolCalls > 0) {
          onProgress?.({
            status: 'planning',
            message: `Executing one action at a time and deferring ${singleToolCallMessage.skippedToolCalls} additional planned step(s).`,
            details: {
              iteration,
              skippedToolCalls: singleToolCallMessage.skippedToolCalls,
            },
          });
        }

	      for (const toolCall of singleToolCallMessage.message.tool_calls ?? []) {
	          if (toolCall.type !== 'function') {
	            logger.error('[Google Workspace Executor] Invalid tool call type:', toolCall.type);
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
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Tool arguments failed validation';
            logger.error('[Google Workspace Executor] Failed to validate arguments:', {
              functionName,
              error: errorMessage,
            });
            toolResults.push({
              tool_call_id: toolCall.id,
              content:
                errorMessage === 'Tool arguments failed validation'
                  ? 'Tool arguments failed validation'
                  : TOOL_ERROR_MESSAGES.GOOGLE_SUITE.INVALID_JSON_ARGS,
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

	          if (!availableToolNames.has(functionName) || !isGoogleWorkspaceToolAllowed(functionName, grantedScopes)) {
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
              logger.error(`[Google Workspace Executor] ✗ Authorization revoked for ${functionName}`);
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
            logger.error(`[Google Workspace Executor] ✗ ${functionName} failed:`, errorMessage);
            logger.error('[Google Workspace Executor] Error details:', error);
            toolResults.push({
              tool_call_id: toolCall.id,
              content: `Error: ${errorMessage}`,
            });
            continue;
          }
      }

      if (consecutiveErrors >= 3) {
        logger.error('[Google Workspace Executor] Too many consecutive errors, aborting');
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
	      }

      const trimmedMessages = trimWorkspaceMessagesToBudget(messages, workspaceModel);
      if (trimmedMessages.length !== messages.length) {
        messages.length = 0;
        messages.push(...trimmedMessages);
      }
    }

      return finalResponse || TOOL_ERROR_MESSAGES.GOOGLE_SUITE.MAX_ITERATIONS_REACHED;
    } catch (error) {
      logger.error('[Google Workspace] Error:', error);

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
