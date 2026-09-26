export type AttachmentKind = "image" | "document" | "snippet";

export function attachmentKind(attachment: {
  kind?: string | null;
  fileType: string;
}): AttachmentKind {
  if (
    attachment.kind === "image" ||
    attachment.kind === "document" ||
    attachment.kind === "snippet"
  )
    return attachment.kind;
  return attachment.fileType
    .split(";")[0]
    .trim()
    .toLowerCase()
    .startsWith("image/")
    ? "image"
    : "document";
}

export function referencesDocument(text: string): boolean {
  return /\b(?:docs?|documents?|pdfs?)\b/i.test(text);
}

function referencesGenericAttachment(text: string): boolean {
  return /\b(?:files?|attachments?)\b/i.test(text);
}

export function referencesSnippet(text: string): boolean {
  return /\b(?:snippets?|pasted\s+(?:text|content))\b/i.test(text);
}

export function nextSnippetFileName(index: number): string {
  if (!Number.isSafeInteger(index) || index < 1)
    throw new RangeError("Snippet index must be positive");
  return `pasted-text-${index}.txt`;
}

export function requestedAttachmentKind(
  text: string,
  hasImages: boolean,
  hasDocument: boolean,
  hasSnippet: boolean,
  hasVisibleEarlierImage = false,
): "image" | "document" | "snippet" | "ambiguous" | "none" {
  const asksDocument = referencesDocument(text);
  const asksSnippet = referencesSnippet(text);
  const asksImage = /\b(?:images?|pictures?|photos?|screenshots?)\b/i.test(
    text,
  );
  if (asksDocument && asksSnippet) return "ambiguous";
  if (asksSnippet) return "snippet";
  if (asksDocument) return "document";
  if (asksImage) return hasImages || hasVisibleEarlierImage ? "image" : "none";
  if (referencesGenericAttachment(text) && hasDocument && hasSnippet)
    return "ambiguous";
  if (hasDocument && hasSnippet) return "ambiguous";
  if (hasImages && !hasDocument && !hasSnippet) return "image";
  if (hasDocument) return "document";
  if (hasSnippet) return "snippet";
  return "none";
}
