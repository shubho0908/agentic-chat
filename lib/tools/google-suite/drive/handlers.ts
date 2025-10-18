import { google } from 'googleapis';
import type { ToolHandlerContext } from '../types';
import { formatFileSize, formatMimeType, formatDate } from '../utils';

export async function handleDriveSearch(
  context: ToolHandlerContext,
  args: { query: string; maxResults?: number }
): Promise<string> {
  const drive = google.drive({ version: 'v3', auth: context.oauth2Client });
  
  const response = await drive.files.list({
    q: args.query,
    pageSize: args.maxResults || 10,
    fields: 'files(id, name, mimeType, createdTime, modifiedTime, size, webViewLink)',
  });

  if (!response.data.files || response.data.files.length === 0) {
    return `No files found for query: "${args.query}"`;
  }

  const formatted = response.data.files.map((file, idx) => 
    `${idx + 1}. **${file.name}**
   File ID: ${file.id}
   Type: ${file.mimeType}
   Link: ${file.webViewLink}`
  );

  return `Found ${response.data.files.length} file(s):\n\n${formatted.join('\n\n')}`;
}

export async function handleDriveListFolder(
  context: ToolHandlerContext,
  args: { folderId?: string; folderName?: string; maxResults?: number }
): Promise<string> {
  const drive = google.drive({ version: 'v3', auth: context.oauth2Client });
  
  let targetFolderId = args.folderId;
  
  if (!targetFolderId && args.folderName) {
    // Escape single quotes in folder name to prevent query syntax errors
    const escapedFolderName = args.folderName.replace(/'/g, "\\'");
    const searchResponse = await drive.files.list({
      q: `name='${escapedFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      pageSize: 5,
      fields: 'files(id, name, webViewLink)',
    });
    
    if (!searchResponse.data.files || searchResponse.data.files.length === 0) {
      return `No folder found with name "${args.folderName}". Please check the folder name or provide the folder ID directly.`;
    }
    
    if (searchResponse.data.files.length > 1) {
      const options = searchResponse.data.files.map((folder, idx) => 
        `${idx + 1}. ${folder.name} (ID: ${folder.id})\n   Link: ${folder.webViewLink}`
      ).join('\n\n');
      return `Multiple folders found with name "${args.folderName}":\n\n${options}\n\nPlease specify the exact folder ID.`;
    }
    
    targetFolderId = searchResponse.data.files[0].id!;
  }
  
  if (!targetFolderId) {
    return 'Please provide either a folderId or folderName to list contents.';
  }
  
  const response = await drive.files.list({
    q: `'${targetFolderId}' in parents and trashed=false`,
    pageSize: args.maxResults || 50,
    orderBy: 'folder,name',
    fields: 'files(id, name, mimeType, createdTime, modifiedTime, size, webViewLink, owners)',
  });

  if (!response.data.files || response.data.files.length === 0) {
    return `Folder is empty or you don't have access to view its contents.`;
  }

  const folders = response.data.files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const files = response.data.files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

  let output = `**Folder Contents** (${response.data.files.length} items)\n\n`;

  if (folders.length > 0) {
    output += `**Folders (${folders.length}):**\n\n`;
    folders.forEach((folder, idx) => {
      output += `${idx + 1}. **${folder.name}**\n`;
      output += `   ${formatMimeType(folder.mimeType)}\n`;
      output += `   Modified: ${formatDate(folder.modifiedTime)}\n`;
      output += `   Owner: ${folder.owners?.[0]?.displayName || 'Unknown'}\n`;
      output += `   Link: ${folder.webViewLink}\n`;
      output += `   ID: ${folder.id}\n\n`;
    });
  }

  if (files.length > 0) {
    output += `**Files (${files.length}):**\n\n`;
    files.forEach((file, idx) => {
      output += `${idx + 1}. **${file.name}**\n`;
      output += `   ${formatMimeType(file.mimeType)}\n`;
      output += `   Size: ${formatFileSize(file.size)}\n`;
      output += `   Modified: ${formatDate(file.modifiedTime)}\n`;
      output += `   Owner: ${file.owners?.[0]?.displayName || 'Unknown'}\n`;
      output += `   Link: ${file.webViewLink}\n`;
      output += `   ID: ${file.id}\n\n`;
    });
  }

  return output;
}

export async function handleDriveReadFile(
  context: ToolHandlerContext,
  args: { fileId: string; mimeType?: string }
): Promise<string> {
  const drive = google.drive({ version: 'v3', auth: context.oauth2Client });
  
  // Get file metadata to detect if it's a Google Workspace document
  const meta = await drive.files.get({ 
    fileId: args.fileId, 
    fields: 'mimeType', 
    supportsAllDrives: true 
  });
  
  const fileMimeType = meta.data.mimeType || '';
  const isGoogleDoc = fileMimeType.startsWith('application/vnd.google-apps.');
  
  if (isGoogleDoc) {
    // Use export for Google Workspace documents (Docs, Sheets, Slides, etc.)
    const response = await drive.files.export({
      fileId: args.fileId,
      mimeType: args.mimeType || 'text/plain',
    }, { responseType: 'text' });
    return response.data as string;
  } else {
    // Use get with alt=media for regular uploaded files (PDFs, images, etc.)
    const response = await drive.files.get({
      fileId: args.fileId,
      alt: 'media',
      supportsAllDrives: true,
    }, { responseType: 'text' });
    return response.data as string;
  }
}

export async function handleDriveCreateFile(
  context: ToolHandlerContext,
  args: { name: string; content: string; mimeType?: string; folderId?: string }
): Promise<string> {
  const drive = google.drive({ version: 'v3', auth: context.oauth2Client });
  
  const fileMetadata: { name: string; mimeType: string; parents?: string[] } = {
    name: args.name,
    mimeType: args.mimeType || 'text/plain',
  };

  if (args.folderId) {
    fileMetadata.parents = [args.folderId];
  }

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: {
      mimeType: args.mimeType || 'text/plain',
      body: args.content,
    },
    fields: 'id, name, webViewLink',
  });

  return `File created successfully!
**Name:** ${response.data.name}
**File ID:** ${response.data.id}
**Link:** ${response.data.webViewLink}`;
}

export async function handleDriveCreateFolder(
  context: ToolHandlerContext,
  args: { name: string; parentFolderId?: string }
): Promise<string> {
  const drive = google.drive({ version: 'v3', auth: context.oauth2Client });
  
  const fileMetadata: { name: string; mimeType: string; parents?: string[] } = {
    name: args.name,
    mimeType: 'application/vnd.google-apps.folder',
  };

  if (args.parentFolderId) {
    fileMetadata.parents = [args.parentFolderId];
  }

  const response = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id, name, webViewLink',
  });

  return `Folder created successfully!
**Name:** ${response.data.name}
**Folder ID:** ${response.data.id}
**Link:** ${response.data.webViewLink}`;
}

export async function handleDriveDelete(
  context: ToolHandlerContext,
  args: { fileIds: string[] }
): Promise<string> {
  const drive = google.drive({ version: 'v3', auth: context.oauth2Client });
  
  await Promise.all(
    args.fileIds.map(fileId => 
      drive.files.update({
        fileId,
        requestBody: { trashed: true },
      })
    )
  );

  return `Successfully moved ${args.fileIds.length} item(s) to trash.`;
}

export async function handleDriveMove(
  context: ToolHandlerContext,
  args: { fileId: string; targetFolderId: string }
): Promise<string> {
  const drive = google.drive({ version: 'v3', auth: context.oauth2Client });
  
  const file = await drive.files.get({
    fileId: args.fileId,
    fields: 'parents, name',
  });

  const previousParents = file.data.parents?.join(',') || '';

  const response = await drive.files.update({
    fileId: args.fileId,
    addParents: args.targetFolderId,
    removeParents: previousParents,
    fields: 'id, name, webViewLink',
  });

  return `Successfully moved "${response.data.name}"
**Link:** ${response.data.webViewLink}`;
}

export async function handleDriveCopy(
  context: ToolHandlerContext,
  args: { fileId: string; newName?: string; targetFolderId?: string }
): Promise<string> {
  const drive = google.drive({ version: 'v3', auth: context.oauth2Client });
  
  const requestBody: { name?: string; parents?: string[] } = {};
  
  if (args.newName) {
    requestBody.name = args.newName;
  }
  
  if (args.targetFolderId) {
    requestBody.parents = [args.targetFolderId];
  }

  const response = await drive.files.copy({
    fileId: args.fileId,
    requestBody,
    fields: 'id, name, webViewLink',
  });

  return `File copied successfully!
**Name:** ${response.data.name}
**File ID:** ${response.data.id}
**Link:** ${response.data.webViewLink}`;
}

export async function handleDriveShare(
  context: ToolHandlerContext,
  args: { fileId: string; email?: string; role?: string; sendNotification?: boolean }
): Promise<string> {
  const drive = google.drive({ version: 'v3', auth: context.oauth2Client });
  
  if (args.email) {
    await drive.permissions.create({
      fileId: args.fileId,
      sendNotificationEmail: args.sendNotification ?? true,
      requestBody: {
        type: 'user',
        role: args.role || 'reader',
        emailAddress: args.email,
      },
    });

    return `Successfully shared with ${args.email} as ${args.role || 'reader'}.`;
  } else {
    await drive.permissions.create({
      fileId: args.fileId,
      requestBody: {
        type: 'anyone',
        role: args.role || 'reader',
      },
    });

    const file = await drive.files.get({
      fileId: args.fileId,
      fields: 'webViewLink',
    });

    return `Successfully made public (${args.role || 'reader'} access).
**Link:** ${file.data.webViewLink}`;
  }
}
