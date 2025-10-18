import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const DRIVE_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'drive_search',
      description: 'Search for files and folders in Google Drive',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (e.g., "name contains \'report\'", "mimeType=\'application/pdf\'")',
            minLength: 1,
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results (1-50)',
            default: 10,
            minimum: 1,
            maximum: 50,
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'drive_list_folder',
      description: 'List all files and subfolders inside a specific Google Drive folder. Use this when user asks for folder contents.',
      parameters: {
        type: 'object',
        properties: {
          folderId: {
            type: 'string',
            description: 'The folder ID. Can be extracted from folder URL (e.g., from https://drive.google.com/drive/folders/FOLDER_ID). If not provided, folderName must be specified.',
            minLength: 1,
          },
          folderName: {
            type: 'string',
            description: 'Name of the folder to search for (used if folderId is not provided)',
            minLength: 1,
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of items to return (1-100)',
            default: 50,
            minimum: 1,
            maximum: 100,
          },
        },
        oneOf: [
          { required: ['folderId'] },
          { required: ['folderName'] }
        ],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'drive_read_file',
      description: 'Read the content of a file from Google Drive',
      parameters: {
        type: 'object',
        properties: {
          fileId: {
            type: 'string',
            description: 'The Google Drive file ID',
            minLength: 1,
          },
          mimeType: {
            type: 'string',
            description: 'Export MIME type (e.g., "text/plain" for docs)',
          },
        },
        required: ['fileId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'drive_create_file',
      description: 'Create a new file in Google Drive',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'File name',
            minLength: 1,
          },
          content: {
            type: 'string',
            description: 'File content',
          },
          mimeType: {
            type: 'string',
            description: 'MIME type (default: text/plain)',
            default: 'text/plain',
          },
          folderId: {
            type: 'string',
            description: 'Parent folder ID (optional)',
            minLength: 1,
          },
        },
        required: ['name', 'content'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'drive_create_folder',
      description: 'Create a new folder in Google Drive',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Folder name',
            minLength: 1,
          },
          parentFolderId: {
            type: 'string',
            description: 'Parent folder ID (optional, creates in root if not specified)',
            minLength: 1,
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'drive_delete',
      description: 'Move file(s) or folder(s) to trash',
      parameters: {
        type: 'object',
        properties: {
          fileIds: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            description: 'Array of file/folder IDs to delete',
            minItems: 1,
          },
        },
        required: ['fileIds'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'drive_move',
      description: 'Move a file or folder to a different folder',
      parameters: {
        type: 'object',
        properties: {
          fileId: {
            type: 'string',
            description: 'The file/folder ID to move',
            minLength: 1,
          },
          targetFolderId: {
            type: 'string',
            description: 'The destination folder ID',
            minLength: 1,
          },
        },
        required: ['fileId', 'targetFolderId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'drive_copy',
      description: 'Create a copy of a file',
      parameters: {
        type: 'object',
        properties: {
          fileId: {
            type: 'string',
            description: 'The file ID to copy',
            minLength: 1,
          },
          newName: {
            type: 'string',
            description: 'Name for the copied file (optional)',
            minLength: 1,
          },
          targetFolderId: {
            type: 'string',
            description: 'Destination folder ID (optional)',
            minLength: 1,
          },
        },
        required: ['fileId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'drive_share',
      description: 'Share a file or folder with specific users or make it public',
      parameters: {
        type: 'object',
        properties: {
          fileId: {
            type: 'string',
            description: 'The file/folder ID to share',
            minLength: 1,
          },
          email: {
            type: 'string',
            description: 'Email address to share with (omit for public link)',
            format: 'email',
          },
          role: {
            type: 'string',
            description: 'Access role: "reader", "writer", "commenter" (default: reader)',
            enum: ['reader', 'writer', 'commenter'],
            default: 'reader',
          },
          sendNotification: {
            type: 'boolean',
            description: 'Send email notification (default: true)',
            default: true,
          },
        },
        required: ['fileId'],
        additionalProperties: false,
      },
    },
  },
];
