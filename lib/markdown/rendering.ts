const MARKDOWN_SYNTAX_PATTERN =
  /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s)|\*\*|__|~~|`|\[[^\]]*\]\([^)]*\)|\||(?:^|[\s(])\*[^*\n]+\*|(?:^|[\s(])_[^_\n]+_/;
const BLOCK_MATH_PATTERN = /(^|[^\\])\$\$[\s\S]+?\$\$/;
const MERMAID_LANGUAGE_PATTERN = /(?:^|\s)(?:language-)?(?:mermaid(?:js)?|mmd)(?:\s|$)/i;

export function shouldRenderMarkdownContent(content: string): boolean {
  return MARKDOWN_SYNTAX_PATTERN.test(content) || BLOCK_MATH_PATTERN.test(content);
}

export function isMermaidCodeBlock(className: string | undefined): boolean {
  return typeof className === "string" && MERMAID_LANGUAGE_PATTERN.test(className);
}
