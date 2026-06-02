"use client";

import { memo, useMemo } from "react";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

function hastToJsx(nodes: readonly HastNode[], key = ""): React.ReactNode[] {
  return nodes.map((node, i) => {
    const k = key + i;
    if (node.type === "text") return node.value;
    if (node.type === "element") {
      const className = (node.properties?.className as string[] | undefined)?.join(" ");
      return (
        <span key={k} className={className || undefined}>
          {node.children ? hastToJsx(node.children, k + "-") : null}
        </span>
      );
    }
    return null;
  });
}

interface HastText { type: "text"; value: string }
interface HastElement { type: "element"; tagName: string; properties?: Record<string, unknown>; children?: HastNode[] }
type HastNode = HastText | HastElement;

export const CodeArtifact = memo(function CodeArtifact({ content, language }: { content: string; language: string }) {
  const highlighted = useMemo(() => {
    try {
      const lang = mapLanguage(language);
      const tree = lowlight.registered(lang)
        ? lowlight.highlight(lang, content)
        : lowlight.highlightAuto(content);
      return hastToJsx(tree.children as HastNode[]);
    } catch {
      return content;
    }
  }, [content, language]);

  return (
    <pre className="h-full overflow-auto bg-zinc-50 p-4 dark:bg-zinc-900">
      <code className="hljs block text-[13px] leading-6 font-mono whitespace-pre-wrap">
        {highlighted}
      </code>
    </pre>
  );
});

function mapLanguage(lang: string): string {
  const aliases: Record<string, string> = {
    react: "typescript",
    tsx: "typescript",
    jsx: "javascript",
    sh: "bash",
    zsh: "bash",
    yml: "yaml",
    md: "markdown",
    text: "plaintext",
  };
  return aliases[lang] ?? lang;
}
