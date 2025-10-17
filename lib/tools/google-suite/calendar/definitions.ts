import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const CALENDAR_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'calendar_list_events',
      description: 'List upcoming calendar events',
      parameters: {
        type: 'object',
        properties: {
          calendarId: {
            type: 'string',
            description: 'Calendar ID (default: primary)',
            default: 'primary',
          },
          timeMin: {
            type: 'string',
            description: 'Start time (ISO 8601 format, e.g., "2025-01-20T00:00:00Z")',
          },
          timeMax: {
            type: 'string',
            description: 'End time (ISO 8601 format)',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of events (1-50)',
            default: 10,
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calendar_create_event',
      description: 'Create a new calendar event',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Event title',
          },
          startTime: {
            type: 'string',
            description: 'Start time (ISO 8601 format)',
          },
          endTime: {
            type: 'string',
            description: 'End time (ISO 8601 format)',
          },
          description: {
            type: 'string',
            description: 'Event description (optional)',
          },
          location: {
            type: 'string',
            description: 'Event location (optional)',
          },
          attendees: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of attendee email addresses (optional)',
          },
        },
        required: ['summary', 'startTime', 'endTime'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calendar_update_event',
      description: 'Update an existing calendar event',
      parameters: {
        type: 'object',
        properties: {
          eventId: {
            type: 'string',
            description: 'The event ID to update',
          },
          summary: {
            type: 'string',
            description: 'Updated event title (optional)',
          },
          startTime: {
            type: 'string',
            description: 'Updated start time (ISO 8601 format, optional)',
          },
          endTime: {
            type: 'string',
            description: 'Updated end time (ISO 8601 format, optional)',
          },
          description: {
            type: 'string',
            description: 'Updated event description (optional)',
          },
          location: {
            type: 'string',
            description: 'Updated event location (optional)',
          },
        },
        required: ['eventId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calendar_delete_event',
      description: 'Delete a calendar event',
      parameters: {
        type: 'object',
        properties: {
          eventId: {
            type: 'string',
            description: 'The event ID to delete',
          },
          calendarId: {
            type: 'string',
            description: 'Calendar ID (default: primary)',
            default: 'primary',
          },
        },
        required: ['eventId'],
      },
    },
  },
];
