import { createGmailClient, listMessages, getMessage, searchMessages, sendMessage, markAsRead, markAsUnread, trashMessage, deleteMessage, listLabels, createLabel, modifyMessage, listDrafts, parseEmailContent } from './gmail-client';
import { gmailOperationSchema, GmailOperation } from '@/lib/schemas/google-suite.tools';
import type { GoogleSuiteProgress } from '@/types/tools';
import { GoogleSuiteStatus } from '@/types/tools';
import type { gmail_v1 } from 'googleapis';
import OpenAI from 'openai';

function formatMessageSummary(msg: gmail_v1.Schema$Message, idx: number, includeLabels: boolean = false): string {
  const content = parseEmailContent(msg);
  const labels = includeLabels ? `\n   **Labels:** ${content.labels.join(', ')}` : '';
  return `
${idx + 1}. **From:** ${content.from}
   **Subject:** ${content.subject}
   **Date:** ${content.date}
   **Snippet:** ${content.snippet}
   **Message ID:** ${msg.id}${labels}
`;
}

export async function executeGoogleSuiteTool(
  query: string,
  userId: string,
  apiKey: string,
  model: string,
  onProgress?: (progress: GoogleSuiteProgress) => void,
  abortSignal?: AbortSignal
): Promise<string> {
  try {
    if (abortSignal?.aborted) {
      throw new Error('Operation aborted by user');
    }

    onProgress?.({
      status: GoogleSuiteStatus.INITIALIZING,
      message: 'Initializing Google Suite connection...',
    });

    const gmailClient = await createGmailClient(userId);

    if (abortSignal?.aborted) {
      throw new Error('Operation aborted by user');
    }

    onProgress?.({
      status: GoogleSuiteStatus.ANALYZING,
      message: 'Analyzing your request...',
      details: { query },
    });

    const openai = new OpenAI({ apiKey });
    const operationSelectionPrompt = `You are a Gmail operations assistant. Analyze the user's request and determine the appropriate Gmail operation(s) to execute.

User Request: "${query}"

Available operations:
- list_messages: Get recent emails (optionally with filters like query or labelIds)
- read_message: Read a specific email by ID
- search: Search emails using Gmail search syntax
- send_email: Send a new email (IMPORTANT: if user specifies text for "both subject and content/body", use the SAME text for both fields)
- mark_as_read/mark_as_unread: Change read status
- trash_message/delete_message: Remove emails
- list_labels: Show all labels
- create_label: Create a new label
- add_label/remove_label: Manage message labels
- list_drafts: Get draft emails

Respond with a JSON object containing the operation details. Examples:

For "what are my recent 2 emails":
{"operation": "list_messages", "count": 2}

For "show unread emails from john@example.com":
{"operation": "search", "query": "is:unread from:john@example.com", "maxResults": 10}

For "send email to jane@example.com saying hello":
{"operation": "send_email", "to": "jane@example.com", "subject": "Hello", "body": "Hello!"}

For "send email saying 'Test message' for both subject and body to test@example.com":
{"operation": "send_email", "to": "test@example.com", "subject": "Test message", "body": "Test message"}

Respond ONLY with valid JSON matching the schema.`;

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: operationSelectionPrompt },
        { role: 'user', content: query },
      ],
      response_format: { type: 'json_object' },
    });

    const operationJson = completion.choices[0]?.message?.content;
    if (!operationJson) {
      throw new Error('Failed to determine Gmail operation');
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(operationJson);
    } catch {
      throw new Error('Failed to parse AI response as JSON');
    }

    const operation = gmailOperationSchema.parse(parsedJson);

    if (abortSignal?.aborted) {
      throw new Error('Operation aborted by user');
    }

    onProgress?.({
      status: GoogleSuiteStatus.EXECUTING,
      message: `Executing: ${operation.operation.replace(/_/g, ' ')}...`,
      details: { operation: operation.operation },
    });

    let result: string;

    switch (operation.operation) {
      case GmailOperation.LIST_MESSAGES: {
        const messages = await listMessages(gmailClient, {
          maxResults: operation.count,
          query: operation.query,
          labelIds: operation.labelIds,
        });

        if (messages.length === 0) {
          result = 'No messages found matching the criteria.';
        } else {
          const formatted = messages.map((msg, idx) => formatMessageSummary(msg, idx, true));
          result = `Found ${messages.length} message(s):\n${formatted.join('\n')}`;
        }
        break;
      }

      case GmailOperation.READ_MESSAGE: {
        const message = await getMessage(gmailClient, operation.messageId);
        if (!message) {
          result = `Message with ID ${operation.messageId} not found.`;
        } else {
          const content = parseEmailContent(message);
          result = `
**Email Details:**

**From:** ${content.from}
**To:** ${content.to}
**Subject:** ${content.subject}
**Date:** ${content.date}
**Labels:** ${content.labels.join(', ')}

**Body:**
${content.body}
`;
        }
        break;
      }

      case GmailOperation.SEARCH: {
        const messages = await searchMessages(
          gmailClient,
          operation.query,
          operation.maxResults
        );

        if (messages.length === 0) {
          result = `No messages found for query: "${operation.query}"`;
        } else {
          const formatted = messages.map((msg, idx) => formatMessageSummary(msg, idx));
          result = `Found ${messages.length} message(s) for query "${operation.query}":\n${formatted.join('\n')}`;
        }
        break;
      }

      case GmailOperation.SEND_EMAIL: {
        const sent = await sendMessage(gmailClient, {
          to: operation.to,
          subject: operation.subject,
          body: operation.body,
          cc: operation.cc,
          bcc: operation.bcc,
        });

        result = `Email sent successfully! Message ID: ${sent.id}`;
        break;
      }

      case GmailOperation.MARK_AS_READ: {
        await markAsRead(gmailClient, operation.messageId);
        result = `Message ${operation.messageId} marked as read.`;
        break;
      }

      case GmailOperation.MARK_AS_UNREAD: {
        await markAsUnread(gmailClient, operation.messageId);
        result = `Message ${operation.messageId} marked as unread.`;
        break;
      }

      case GmailOperation.TRASH_MESSAGE: {
        await trashMessage(gmailClient, operation.messageId);
        result = `Message ${operation.messageId} moved to trash.`;
        break;
      }

      case GmailOperation.DELETE_MESSAGE: {
        await deleteMessage(gmailClient, operation.messageId);
        result = `Message ${operation.messageId} permanently deleted.`;
        break;
      }

      case GmailOperation.LIST_LABELS: {
        const labels = await listLabels(gmailClient);
        const labelList = labels.map(l => `- ${l.name} (ID: ${l.id})`).join('\n');
        result = `Gmail Labels:\n${labelList}`;
        break;
      }

      case GmailOperation.CREATE_LABEL: {
        const label = await createLabel(gmailClient, operation.name);
        result = `Label "${operation.name}" created successfully! Label ID: ${label.id}`;
        break;
      }

      case GmailOperation.ADD_LABEL: {
        await modifyMessage(gmailClient, operation.messageId, {
          addLabelIds: operation.labelIds,
        });
        result = `Labels ${operation.labelIds.join(', ')} added to message ${operation.messageId}.`;
        break;
      }

      case GmailOperation.REMOVE_LABEL: {
        await modifyMessage(gmailClient, operation.messageId, {
          removeLabelIds: operation.labelIds,
        });
        result = `Labels ${operation.labelIds.join(', ')} removed from message ${operation.messageId}.`;
        break;
      }

      case GmailOperation.LIST_DRAFTS: {
        const drafts = await listDrafts(gmailClient, operation.count);

        if (drafts.length === 0) {
          result = 'No draft messages found.';
        } else {
          const parsed = drafts.map((draft, idx) => {
            if (!draft.message) return '';
            const content = parseEmailContent(draft.message);
            return `
${idx + 1}. **Subject:** ${content.subject || '(No subject)'}
   **Snippet:** ${content.snippet}
   **Draft ID:** ${draft.id}
`;
          });

          result = `Found ${drafts.length} draft(s):\n${parsed.join('\n')}`;
        }
        break;
      }

      default: {
        const exhaustiveCheck: never = operation;
        throw new Error(`Unknown operation: ${exhaustiveCheck}`);
      }
    }

    if (abortSignal?.aborted) {
      throw new Error('Operation aborted by user');
    }

    onProgress?.({
      status: GoogleSuiteStatus.COMPLETED,
      message: 'Operation completed successfully',
      details: { operation: operation.operation },
    });

    return result;
  } catch (error) {
    console.error('[Google Suite Tool] Error:', error);

    if (error instanceof Error) {
      if (error.message.includes('No valid Google account tokens')) {
        onProgress?.({
          status: GoogleSuiteStatus.AUTH_REQUIRED,
          message: 'Google Suite authorization required',
          details: { error: error.message },
        });
        return 'Google Suite access not authorized. Please click the "Authorize Google Suite" button to grant access to your Gmail.';
      }

      if (error.message.includes('aborted')) {
        return 'Operation was aborted.';
      }

      return `Error: ${error.message}`;
    }

    return 'An unexpected error occurred while accessing Gmail.';
  }
}
