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
            minLength: 1,
          },
        },
        required: ['title'],
        additionalProperties: false,
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
            minLength: 1,
          },
          range: {
            type: 'string',
            description: 'A1 notation range (e.g., "Sheet1!A1:C10")',
            minLength: 1,
          },
        },
        required: ['spreadsheetId', 'range'],
        additionalProperties: false,
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
            minLength: 1,
          },
          range: {
            type: 'string',
            description: 'A1 notation range (e.g., "Sheet1!A1")',
            minLength: 1,
          },
          values: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
              minItems: 1,
            },
            description: '2D array of values to write',
            minItems: 1,
          },
        },
        required: ['spreadsheetId', 'range', 'values'],
        additionalProperties: false,
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
            minLength: 1,
          },
          range: {
            type: 'string',
            description: 'A1 notation range (e.g., "Sheet1!A:C")',
            minLength: 1,
          },
          values: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
              minItems: 1,
            },
            description: '2D array of values to append',
            minItems: 1,
          },
        },
        required: ['spreadsheetId', 'range', 'values'],
        additionalProperties: false,
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
            minLength: 1,
          },
          range: {
            type: 'string',
            description: 'A1 notation range to clear (e.g., "Sheet1!A1:C10")',
            minLength: 1,
          },
        },
        required: ['spreadsheetId', 'range'],
        additionalProperties: false,
      },
    },
  },
];
