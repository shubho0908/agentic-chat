import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import type { ExportConversation } from './types';

export async function downloadPDF(
  conversation: ExportConversation,
  pdfElement: React.ReactElement
): Promise<void> {
  const fileName = `${sanitizeFileName(conversation.title || 'conversation')}_${new Date().toISOString().split('T')[0]}.pdf`;

  // Type assertion needed for @react-pdf/renderer's strict typing
  const blob = await pdf(pdfElement as React.ReactElement<Record<string, unknown>>).toBlob();

  saveAs(blob, fileName);
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase()
    .slice(0, 50);
}
