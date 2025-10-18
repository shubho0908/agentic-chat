import { google } from 'googleapis';
import type { ToolHandlerContext } from '../types';

export async function handleDocsCreate(
  context: ToolHandlerContext,
  args: { title: string; content?: string }
): Promise<string> {
  const docs = google.docs({ version: 'v1', auth: context.oauth2Client });
  
  const response = await docs.documents.create({
    requestBody: {
      title: args.title,
    },
  });

  const documentId = response.data.documentId!;

  if (args.content) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [{
          insertText: {
            location: { index: 1 },
            text: args.content,
          },
        }],
      },
    });
  }

  return `Document created successfully!
**Title:** ${args.title}
**Document ID:** ${documentId}
**Link:** https://docs.google.com/document/d/${documentId}`;
}

export async function handleDocsRead(
  context: ToolHandlerContext,
  args: { documentId: string }
): Promise<string> {
  const docs = google.docs({ version: 'v1', auth: context.oauth2Client });
  
  const response = await docs.documents.get({
    documentId: args.documentId,
  });

  const content = (response.data.body?.content ?? [])
    .map(element => (element.paragraph?.elements ?? [])
      .map(e => e.textRun?.content ?? '')
      .join(''))
    .join('');

  return `**Document:** ${response.data.title}\n\n${content}`;
}

export async function handleDocsAppend(
  context: ToolHandlerContext,
  args: { documentId: string; text: string }
): Promise<string> {
  const docs = google.docs({ version: 'v1', auth: context.oauth2Client });
  
  const doc = await docs.documents.get({ documentId: args.documentId });
  const endIndex = doc.data.body?.content?.[doc.data.body.content.length - 1]?.endIndex || 1;

  await docs.documents.batchUpdate({
    documentId: args.documentId,
    requestBody: {
      requests: [{
        insertText: {
          location: { index: endIndex - 1 },
          text: args.text,
        },
      }],
    },
  });

  return `Text appended to document successfully!`;
}

export async function handleDocsReplace(
  context: ToolHandlerContext,
  args: { documentId: string; findText: string; replaceText: string }
): Promise<string> {
  const docs = google.docs({ version: 'v1', auth: context.oauth2Client });
  
  const response = await docs.documents.batchUpdate({
    documentId: args.documentId,
    requestBody: {
      requests: [{
        replaceAllText: {
          containsText: {
            text: args.findText,
            matchCase: false,
          },
          replaceText: args.replaceText,
        },
      }],
    },
  });

  const occurrences = response.data.replies?.[0]?.replaceAllText?.occurrencesChanged || 0;

  return `Replaced ${occurrences} occurrence(s) of "${args.findText}" with "${args.replaceText}".`;
}
