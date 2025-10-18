import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import type { Document } from '@langchain/core/documents';
import { RAG_CONFIG } from '../config';
import { read, utils } from 'xlsx';
import WordExtractor from 'word-extractor';

interface DocumentLoadResult {
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
    const lowerFileName = fileName.toLowerCase();

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
      lowerFileName.endsWith('.doc') && !lowerFileName.endsWith('.docx')
    ) {
      const arrayBuffer = await fileBlob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      const extractor = new WordExtractor();
      const extracted = await extractor.extract(buffer);
      const content = extracted.getBody();

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
          fileType: 'doc',
        },
      };
    } else if (
      lowerFileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerFileType.includes('docx') ||
      lowerFileName.endsWith('.docx')
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
      lowerFileType === 'application/msword'
    ) {
      const arrayBuffer = await fileBlob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      const extractor = new WordExtractor();
      const extracted = await extractor.extract(buffer);
      const content = extracted.getBody();

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
          fileType: 'doc',
        },
      };
    } else if (
      lowerFileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      lowerFileType === 'application/vnd.ms-excel' ||
      lowerFileType.includes('xlsx') ||
      lowerFileType.includes('xls')
    ) {
      const arrayBuffer = await fileBlob.arrayBuffer();
      const workbook = read(arrayBuffer, { type: 'array' });
      
      const allSheets: string[] = [];
      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const csvContent = utils.sheet_to_csv(worksheet);
        allSheets.push(`Sheet: ${sheetName}\n${csvContent}`);
      });
      
      const content = allSheets.join('\n\n');
      
      documents = [
        {
          pageContent: content,
          metadata: {
            source: fileName,
            sheets: workbook.SheetNames,
          },
        } as Document,
      ];

      return {
        success: true,
        documents,
        metadata: {
          fileType: 'excel',
        },
      };
    } else if (lowerFileType === 'text/csv' || fileName.toLowerCase().endsWith('.csv')) {
      loader = new CSVLoader(fileBlob);
      documents = await loader.load();

      return {
        success: true,
        documents,
        metadata: {
          fileType: 'csv',
        },
      };
    } else if (
      lowerFileType.startsWith('text/') || 
      lowerFileType === 'text/plain' ||
      lowerFileName.endsWith('.txt')
    ) {
      const content = await fileBlob.text();
      
      documents = [
        {
          pageContent: content,
          metadata: {
            source: fileName,
          },
        } as Document,
      ];

      const fileType = 'text';

      return {
        success: true,
        documents,
        metadata: {
          fileType,
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
