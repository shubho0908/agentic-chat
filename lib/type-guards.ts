/**
 * Type guard for text content part.
 */
export function isTextContentPart(part: unknown): part is { type: 'text'; text: string } {
  return (
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    part.type === 'text' &&
    'text' in part &&
    typeof part.text === 'string'
  );
}

export function isImageContentPart(
  part: unknown
): part is { type: 'image_url'; image_url: { url: string } } {
  return (
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    part.type === 'image_url' &&
    'image_url' in part &&
    typeof part.image_url === 'object' &&
    part.image_url !== null &&
    'url' in part.image_url &&
    typeof part.image_url.url === 'string'
  );
}