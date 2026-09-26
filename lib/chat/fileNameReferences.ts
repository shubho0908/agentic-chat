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
