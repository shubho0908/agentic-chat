import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const DOCS_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'docs_create',
      description: 'Create a new Google Doc',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Document title',
          },
          content: {
            type: 'string',
            description: 'Initial document content (optional)',
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'docs_read',
      description: 'Read the content of a Google Doc',
      parameters: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            description: 'The Google Docs document ID',
          },
        },
        required: ['documentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'docs_append',
      description: 'Append text to the end of a Google Doc',
      parameters: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            description: 'The Google Docs document ID',
          },
          text: {
            type: 'string',
            description: 'Text to append',
          },
        },
        required: ['documentId', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'docs_replace',
      description: 'Replace all occurrences of text in a Google Doc',
      parameters: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            description: 'The Google Docs document ID',
          },
          findText: {
            type: 'string',
            description: 'Text to find',
          },
          replaceText: {
            type: 'string',
            description: 'Text to replace with',
          },
        },
        required: ['documentId', 'findText', 'replaceText'],
      },
    },
  },
];
