import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Document } from '@langchain/core/documents';
import { encoding_for_model, TiktokenModel, type Tiktoken } from 'tiktoken';
import { RAG_CONFIG } from '../config';

interface ChunkConfig {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
}

interface DocumentChunk {
  content: string;
  index: number;
  tokenCount: number;
  metadata: {
    source?: string;
    page?: number;
    charStart: number;
    charEnd: number;
    [key: string]: unknown;
  };
}

interface ChunkResult {
  success: boolean;
  chunks?: DocumentChunk[];
  error?: string;
  stats?: {
    totalChunks: number;
    avgTokenCount: number;
    totalTokens: number;
  };
}

let encoderCache: Tiktoken | null = null;

const CONTENT_TYPE_KEYWORDS: Record<keyof typeof RAG_CONFIG.chunking.sizeByType, string[]> = {
  pdf: ['pdf'],
  doc: ['word', 'doc'],
  excel: ['spreadsheet', 'excel', 'xls'],
  csv: ['csv'],
  markdown: ['markdown'],
  text: ['text'],
};

function getEncoder(): Tiktoken {
  if (!encoderCache) {
    encoderCache = encoding_for_model(RAG_CONFIG.embeddings.model as TiktokenModel);
  }
  return encoderCache;
}

function countTokens(text: string): number {
  try {
    const encoder = getEncoder();
    const tokens = encoder.encode(text);
    return tokens.length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

function freeEncoder(): void {
  if (encoderCache) {
    encoderCache.free();
    encoderCache = null;
  }
}

export async function chunkDocuments(
  documents: Document[],
  config: ChunkConfig = {}
): Promise<ChunkResult> {
  try {
    const {
      chunkSize = RAG_CONFIG.chunking.defaultSize,
      chunkOverlap = RAG_CONFIG.chunking.defaultOverlap,
      separators = RAG_CONFIG.chunking.separators,
    } = config;

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators,
      lengthFunction: (text: string) => countTokens(text),
    });

    const splitDocs = await textSplitter.splitDocuments(documents);

    let charPosition = 0;
    let totalTokens = 0;

    const chunks: DocumentChunk[] = splitDocs.map((doc, index) => {
      const tokenCount = countTokens(doc.pageContent);
      const contentLength = doc.pageContent.length;
      
      const chunk: DocumentChunk = {
        content: doc.pageContent,
        index,
        tokenCount,
        metadata: {
          ...doc.metadata,
          source: doc.metadata.source,
          page: doc.metadata.loc?.pageNumber || doc.metadata.page,
          charStart: charPosition,
          charEnd: charPosition + contentLength,
        },
      };

      charPosition += contentLength;
      totalTokens += tokenCount;

      return chunk;
    });

    const avgTokenCount = chunks.length > 0 ? totalTokens / chunks.length : 0;

    return {
      success: true,
      chunks,
      stats: {
        totalChunks: chunks.length,
        avgTokenCount: Math.round(avgTokenCount),
        totalTokens,
      },
    };
  } catch (error) {
    throw new Error(`Error chunking documents: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    freeEncoder();
  }
}

export function getOptimalChunkSize(fileSize: number, contentType: string): ChunkConfig {
  let baseChunkSize = RAG_CONFIG.chunking.defaultSize;
  let baseOverlap = RAG_CONFIG.chunking.defaultOverlap;

  const lowerContentType = contentType.toLowerCase();
  const sizeByType = RAG_CONFIG.chunking.sizeByType;

  const matchedType = (Object.entries(CONTENT_TYPE_KEYWORDS) as Array<[
    keyof typeof sizeByType,
    string[]
  ]>).find(([, keywords]) =>
    keywords.some(keyword => lowerContentType.includes(keyword))
  );

  if (matchedType) {
    const [typeKey] = matchedType;
    const config = sizeByType[typeKey];
    baseChunkSize = config.size;
    baseOverlap = config.overlap;
  }

  const fileSizeInMB = fileSize / (1024 * 1024);
  const largeConfig = RAG_CONFIG.chunking.adjustmentByFileSize.large;
  const mediumConfig = RAG_CONFIG.chunking.adjustmentByFileSize.medium;

  if (fileSizeInMB > largeConfig.thresholdMB) {
    baseChunkSize = Math.max(500, baseChunkSize - largeConfig.sizeReduction);
    baseOverlap = Math.max(50, baseOverlap - largeConfig.overlapReduction);
  } else if (fileSizeInMB > mediumConfig.thresholdMB) {
    baseChunkSize = Math.max(600, baseChunkSize - mediumConfig.sizeReduction);
    baseOverlap = Math.max(75, baseOverlap - mediumConfig.overlapReduction);
  }

  return {
    chunkSize: baseChunkSize,
    chunkOverlap: baseOverlap,
  };
}
