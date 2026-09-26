/** Match an attachment name as a whole token, never as part of another name.
 * Dots, underscores, and dashes belong to filenames; punctuation around the
 * name does not. Case-folding follows the catalog's display-name convention. */
export function mentionsFileName(text: string, fileName: string): boolean {
  if (!fileName) return false;
  const haystack = text.toLocaleLowerCase();
  const needle = fileName.toLocaleLowerCase();
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    const before = index ? haystack[index - 1] : "";
    const after = haystack[index + needle.length] ?? "";
    if ((!before || !/[\p{L}\p{N}_.-]/u.test(before)) &&
        (!after || !/[\p{L}\p{N}_.-]/u.test(after))) return true;
    index = haystack.indexOf(needle, index + 1);
  }
  return false;
}

/** Unknown filenames are only actionable when introduced as files, not as
 * dotted subject matter (e.g. "this PDF about node.js"). No extension list:
 * uploads may have custom extensions. The caller must still verify ownership. */
export function mentionsExplicitFileName(text: string): boolean {
  return /\b(?:read|open|summarize|compare|review|analy[sz]e|inspect|check|attach|upload|and|with|plus)\s+(?:the\s+)?(?:file\s+)?(?:[`"']?)[^\s/"'`<>]+\.[a-z][a-z0-9]{0,15}(?=$|[\s,;:!?)]|["'`])/iu.test(text);
}
