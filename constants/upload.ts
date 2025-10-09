export const MAX_IMAGE_ATTACHMENTS = 5;
export const MAX_DOCUMENT_ATTACHMENTS = 1;
export const MAX_FILE_ATTACHMENTS = MAX_IMAGE_ATTACHMENTS + MAX_DOCUMENT_ATTACHMENTS;

export const SUPPORTED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  '.tiff',
  '.tif',
  '.ico',
] as const;

export const SUPPORTED_DOCUMENT_EXTENSIONS = [
  '.pdf',
  '.txt',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.csv',
] as const;

export const SUPPORTED_IMAGE_EXTENSIONS_DISPLAY = SUPPORTED_IMAGE_EXTENSIONS.join(', ');
export const SUPPORTED_DOCUMENT_EXTENSIONS_DISPLAY = SUPPORTED_DOCUMENT_EXTENSIONS.join(', ');
