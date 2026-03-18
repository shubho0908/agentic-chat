import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { API_ERROR_MESSAGES } from '@/constants/errors';
import type { ExportConversation } from '@/types/export';

export async function downloadPDF(
  conversation: ExportConversation,
  pdfElement: React.ReactElement
): Promise<void> {
  const fileName = `${sanitizeFileName(conversation.title || 'conversation')}_${new Date().toISOString().split('T')[0]}.pdf`;

  try {
    const blob = await pdf(pdfElement as React.ReactElement<Record<string, unknown>>).toBlob();
    
    if (!blob || blob.size === 0) {
      throw new Error('Failed to generate PDF: Empty or invalid blob');
    }
    
    saveAs(blob, fileName);
  } catch (error) {
    console.error('PDF generation failed:', error);
    throw new Error(
      error instanceof Error 
        ? `${API_ERROR_MESSAGES.PDF_GENERATION_FAILED}: ${error.message}` 
        : API_ERROR_MESSAGES.PDF_GENERATION_FAILED
    );
  }
}

function sanitizeFileName(name: string): string {
  const sanitized = name
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 50)
    .replace(/_+$/g, '');
  
  return sanitized || 'conversation';
}
