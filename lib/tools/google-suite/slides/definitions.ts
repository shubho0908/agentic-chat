import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const SLIDES_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'slides_create',
      description: 'Create a new Google Slides presentation',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Presentation title',
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
      name: 'slides_read',
      description: 'Read the content of a Google Slides presentation',
      parameters: {
        type: 'object',
        properties: {
          presentationId: {
            type: 'string',
            description: 'The presentation ID',
            minLength: 1,
          },
        },
        required: ['presentationId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'slides_add_slide',
      description: 'Add a new slide to a presentation',
      parameters: {
        type: 'object',
        properties: {
          presentationId: {
            type: 'string',
            description: 'The presentation ID',
            minLength: 1,
          },
          title: {
            type: 'string',
            description: 'Slide title (optional)',
          },
          body: {
            type: 'string',
            description: 'Slide body text (optional)',
          },
        },
        required: ['presentationId'],
        additionalProperties: false,
      },
    },
  },
];
