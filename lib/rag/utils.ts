import { RAG_CONFIG } from './config';

export function getSupportedFileTypes(): string[] {
  return RAG_CONFIG.supportedFileTypes;
}

export function isSupportedForRAG(fileType: string): boolean {
  const normalizedMime = (fileType || '').split(';')[0].trim().toLowerCase();
  
  if (!normalizedMime) {
    return false;
  }
  
  const supportedTypes = RAG_CONFIG.supportedFileTypes.map(type => type.toLowerCase());
  
  if (supportedTypes.includes(normalizedMime)) {
    return true;
  }
  
  if (supportedTypes.includes('text/*') && normalizedMime.startsWith('text/')) {
    return true;
  }
  
  return false;
}
