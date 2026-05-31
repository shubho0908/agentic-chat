import { API_ERROR_MESSAGES } from '@/constants/errors';
import { logger } from "@/lib/logger";
import { getConversationExportFileName } from '@/lib/export/downloadFile';
import type { ExportConversation } from '@/types/export';
import type { ReactElement } from "react";

export async function downloadPDF(
  conversation: ExportConversation,
  pdfElement: ReactElement
): Promise<void> {
  const fileName = getConversationExportFileName(conversation.title, 'pdf');

  try {
    const [{ pdf }, { saveAs }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("file-saver"),
    ]);

    const blob = await pdf(pdfElement as ReactElement<Record<string, unknown>>).toBlob();
    
    if (!blob || blob.size === 0) {
      throw new Error('Failed to generate PDF: Empty or invalid blob');
    }
    
    saveAs(blob, fileName);
  } catch (error) {
    logger.error('PDF generation failed:', error);
    throw new Error(
      error instanceof Error 
        ? `${API_ERROR_MESSAGES.PDF_GENERATION_FAILED}: ${error.message}` 
        : API_ERROR_MESSAGES.PDF_GENERATION_FAILED
    );
  }
}
