import { RAG_CONFIG } from './config';

export function getSupportedFileTypes(): string[] {
  return RAG_CONFIG.supportedFileTypes;
}

export function isSupportedForRAG(fileType: string): boolean {
  return RAG_CONFIG.supportedFileTypes.some(type => 
    fileType.toLowerCase().includes(type.toLowerCase())
  ) || fileType.startsWith('text/');
}
