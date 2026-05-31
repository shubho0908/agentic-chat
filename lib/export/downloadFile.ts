const DEFAULT_EXPORT_NAME = "conversation";
const EXPORT_FILE_NAME_MAX_LENGTH = 50;
const OBJECT_URL_REVOKE_DELAY_MS = 100;

type ExportFileExtension = "json" | "md" | "pdf";

function sanitizeExportFileName(name: string | null | undefined): string {
  const sanitized = (name || DEFAULT_EXPORT_NAME)
    .replace(/[^a-z0-9]/gi, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, EXPORT_FILE_NAME_MAX_LENGTH)
    .replace(/_+$/g, "");

  return sanitized || DEFAULT_EXPORT_NAME;
}

export function getConversationExportFileName(
  title: string | null | undefined,
  extension: ExportFileExtension,
  exportedAt: Date = new Date()
): string {
  const date = exportedAt.toISOString().slice(0, 10);
  return `${sanitizeExportFileName(title)}_${date}.${extension}`;
}

export function downloadTextFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, OBJECT_URL_REVOKE_DELAY_MS);
}
