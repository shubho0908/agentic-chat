import { SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_DOCUMENT_EXTENSIONS } from "@/constants/upload";

interface FileFilterResult {
  validImages: File[];
  unsupportedImages: File[];
  validDocuments: File[];
  unsupportedFiles: File[];
}

interface ClipboardImageResult {
  files: File[];
  hasUnsupportedFormats: boolean;
}

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function isSupportedImageExtension(filename: string): boolean {
  const ext = getFileExtension(filename);
  return (SUPPORTED_IMAGE_EXTENSIONS as readonly string[]).includes(ext);
}

function isSupportedDocumentExtension(filename: string): boolean {
  const ext = getFileExtension(filename);
  return (SUPPORTED_DOCUMENT_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Filter and categorize files into valid images, unsupported images, valid documents, and unsupported files.
 */
export function filterFiles(files: File[]): FileFilterResult {
  const validImages: File[] = [];
  const unsupportedImages: File[] = [];
  const validDocuments: File[] = [];
  const unsupportedFiles: File[] = [];
  
  for (const file of files) {
    if (isImageFile(file)) {
      if (isSupportedImageExtension(file.name)) {
        validImages.push(file);
      } else {
        unsupportedImages.push(file);
      }
    } else if (isSupportedDocumentExtension(file.name)) {
      validDocuments.push(file);
    } else {
      unsupportedFiles.push(file);
    }
  }
  
  return { validImages, unsupportedImages, validDocuments, unsupportedFiles };
}

/**
 * Get comma-separated list of filenames.
 */
export function getFileNames(files: File[]): string {
  return files.map(f => f.name).join(', ');
}

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
  'image/tiff': '.tiff',
  'image/x-icon': '.ico',
};

export function extractImagesFromClipboard(items: DataTransferItemList): ClipboardImageResult {
  const files: File[] = [];
  let hasUnsupportedFormats = false;
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith('image/')) {
      const extension = MIME_TO_EXTENSION[item.type];
      if (!extension) {
        hasUnsupportedFormats = true;
        continue;
      }

      const file = item.getAsFile();
      if (file) {
        const timestamp = new Date().getTime();
        const newFile = new File([file], `pasted-image-${timestamp}${extension}`, {
          type: file.type,
        });
        files.push(newFile);
      }
    }
  }
  
  return { files, hasUnsupportedFormats };
}
