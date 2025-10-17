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
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results (1-50)',
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
      name: 'drive_list_folder',
      description: 'List all files and subfolders inside a specific Google Drive folder. Use this when user asks for folder contents.',
      parameters: {
        type: 'object',
        properties: {
          folderId: {
            type: 'string',
            description: 'The folder ID. Can be extracted from folder URL (e.g., from https://drive.google.com/drive/folders/FOLDER_ID). If not provided, folderName must be specified.',
          },
          folderName: {
            type: 'string',
            description: 'Name of the folder to search for (used if folderId is not provided)',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of items to return (1-100)',
            default: 50,
          },
        },
        required: [],
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
          },
          mimeType: {
            type: 'string',
            description: 'Export MIME type (e.g., "text/plain" for docs)',
          },
        },
        required: ['fileId'],
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
          },
        },
        required: ['name', 'content'],
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
          },
          parentFolderId: {
            type: 'string',
            description: 'Parent folder ID (optional, creates in root if not specified)',
          },
        },
        required: ['name'],
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
            items: { type: 'string' },
            description: 'Array of file/folder IDs to delete',
          },
        },
        required: ['fileIds'],
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
          },
          targetFolderId: {
            type: 'string',
            description: 'The destination folder ID',
          },
        },
        required: ['fileId', 'targetFolderId'],
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
          },
          newName: {
            type: 'string',
            description: 'Name for the copied file (optional)',
          },
          targetFolderId: {
            type: 'string',
            description: 'Destination folder ID (optional)',
          },
        },
        required: ['fileId'],
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
          },
          email: {
            type: 'string',
            description: 'Email address to share with (omit for public link)',
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
      },
    },
  },
];
