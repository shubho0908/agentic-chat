import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import type { Document } from '@langchain/core/documents';
import { RAG_CONFIG } from '../config';

export interface DocumentLoadResult {
  success: boolean;
  documents?: Document[];
  error?: string;
  metadata?: {
    pageCount?: number;
    fileType: string;
  };
}

export async function loadDocument(
  fileBlob: Blob,
  fileType: string,
  fileName: string
): Promise<DocumentLoadResult> {
  try {
    let loader;
    let documents: Document[] = [];

    const lowerFileType = fileType.toLowerCase();

    if (lowerFileType === 'application/pdf' || lowerFileType.includes('pdf')) {
      loader = new PDFLoader(fileBlob, {
        splitPages: true,
      });
      documents = await loader.load();

      return {
        success: true,
        documents,
        metadata: {
          pageCount: documents.length,
          fileType: 'pdf',
        },
      };
    } else if (
      lowerFileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerFileType.includes('docx')
    ) {
      loader = new DocxLoader(fileBlob);
      documents = await loader.load();

      return {
        success: true,
        documents,
        metadata: {
          fileType: 'docx',
        },
      };
    } else if (
      lowerFileType === 'application/msword' ||
      lowerFileType.includes('.doc')
    ) {
      loader = new DocxLoader(fileBlob);
      documents = await loader.load();

      return {
        success: true,
        documents,
        metadata: {
          fileType: 'doc',
        },
      };
    } else if (lowerFileType.startsWith('text/') || lowerFileType === 'text/plain') {
      const content = await fileBlob.text();
      
      documents = [
        {
          pageContent: content,
          metadata: {
            source: fileName,
          },
        } as Document,
      ];

      return {
        success: true,
        documents,
        metadata: {
          fileType: 'text',
        },
      };
    } else {
      return {
        success: false,
        error: `Unsupported file type: ${fileType}`,
      };
    }
  } catch (error) {
    throw new Error(`Error loading document: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function getSupportedFileTypes(): string[] {
  return RAG_CONFIG.supportedFileTypes;
}

export function isSupportedForRAG(fileType: string): boolean {
  return RAG_CONFIG.supportedFileTypes.some(type => 
    fileType.toLowerCase().includes(type.toLowerCase())
  ) || fileType.startsWith('text/');
}
