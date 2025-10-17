import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const SHEETS_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'sheets_create',
      description: 'Create a new Google Sheet',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Spreadsheet title',
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sheets_read',
      description: 'Read data from a Google Sheet',
      parameters: {
        type: 'object',
        properties: {
          spreadsheetId: {
            type: 'string',
            description: 'The spreadsheet ID',
          },
          range: {
            type: 'string',
            description: 'A1 notation range (e.g., "Sheet1!A1:C10")',
          },
        },
        required: ['spreadsheetId', 'range'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sheets_write',
      description: 'Write data to a Google Sheet',
      parameters: {
        type: 'object',
        properties: {
          spreadsheetId: {
            type: 'string',
            description: 'The spreadsheet ID',
          },
          range: {
            type: 'string',
            description: 'A1 notation range (e.g., "Sheet1!A1")',
          },
          values: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'string' },
            },
            description: '2D array of values to write',
          },
        },
        required: ['spreadsheetId', 'range', 'values'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sheets_append',
      description: 'Append rows to the end of a Google Sheet',
      parameters: {
        type: 'object',
        properties: {
          spreadsheetId: {
            type: 'string',
            description: 'The spreadsheet ID',
          },
          range: {
            type: 'string',
            description: 'A1 notation range (e.g., "Sheet1!A:C")',
          },
          values: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'string' },
            },
            description: '2D array of values to append',
          },
        },
        required: ['spreadsheetId', 'range', 'values'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sheets_clear',
      description: 'Clear data from a range in a Google Sheet',
      parameters: {
        type: 'object',
        properties: {
          spreadsheetId: {
            type: 'string',
            description: 'The spreadsheet ID',
          },
          range: {
            type: 'string',
            description: 'A1 notation range to clear (e.g., "Sheet1!A1:C10")',
          },
        },
        required: ['spreadsheetId', 'range'],
      },
    },
  },
];
