export const MAX_FILE_ATTACHMENTS = 5;
const MAX_IMAGE_FILE_SIZE_MB = 2;
const MAX_DOCUMENT_FILE_SIZE_MB = 4;
export const MAX_IMAGE_FILE_SIZE_BYTES = MAX_IMAGE_FILE_SIZE_MB * 1024 * 1024;
export const MAX_DOCUMENT_FILE_SIZE_BYTES = MAX_DOCUMENT_FILE_SIZE_MB * 1024 * 1024;
export const MAX_IMAGE_FILE_SIZE_LABEL = `${MAX_IMAGE_FILE_SIZE_MB}MB`;
export const MAX_DOCUMENT_FILE_SIZE_LABEL = `${MAX_DOCUMENT_FILE_SIZE_MB}MB`;

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
