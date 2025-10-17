import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const GMAIL_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'gmail_search',
      description: 'Search for emails in Gmail using Gmail query syntax',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Gmail search query (e.g., "from:user@example.com", "is:unread", "subject:meeting")',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results to return (1-50)',
            default: 10,
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gmail_read',
      description: 'Read the full content of a specific email by message ID',
      parameters: {
        type: 'object',
        properties: {
          messageId: {
            type: 'string',
            description: 'The Gmail message ID to read',
          },
        },
        required: ['messageId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gmail_send',
      description: 'Send an email via Gmail',
      parameters: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Recipient email address',
          },
          subject: {
            type: 'string',
            description: 'Email subject',
          },
          body: {
            type: 'string',
            description: 'Email body (plain text)',
          },
          cc: {
            type: 'string',
            description: 'CC email address (optional)',
          },
          bcc: {
            type: 'string',
            description: 'BCC email address (optional)',
          },
        },
        required: ['to', 'subject', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gmail_reply',
      description: 'Reply to an existing email',
      parameters: {
        type: 'object',
        properties: {
          messageId: {
            type: 'string',
            description: 'The message ID to reply to',
          },
          body: {
            type: 'string',
            description: 'Reply message body',
          },
          replyAll: {
            type: 'boolean',
            description: 'Reply to all recipients (default: false)',
            default: false,
          },
        },
        required: ['messageId', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gmail_delete',
      description: 'Move email(s) to trash',
      parameters: {
        type: 'object',
        properties: {
          messageIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of message IDs to delete',
          },
        },
        required: ['messageIds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gmail_modify',
      description: 'Modify email labels (mark as read/unread, star, archive, etc.)',
      parameters: {
        type: 'object',
        properties: {
          messageIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of message IDs to modify',
          },
          addLabels: {
            type: 'array',
            items: { type: 'string' },
            description: 'Labels to add (e.g., ["STARRED", "IMPORTANT"])',
          },
          removeLabels: {
            type: 'array',
            items: { type: 'string' },
            description: 'Labels to remove (e.g., ["UNREAD", "INBOX"])',
          },
        },
        required: ['messageIds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gmail_get_attachments',
      description: 'Get attachment information from an email',
      parameters: {
        type: 'object',
        properties: {
          messageId: {
            type: 'string',
            description: 'The Gmail message ID',
          },
        },
        required: ['messageId'],
      },
    },
  },
];
