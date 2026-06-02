"use client";

import { memo, useEffect, useMemo } from "react";
import { useSandboxIframe } from "./useSandboxIframe";

const TAILWIND_SCRIPT = `<script src="https://cdn.tailwindcss.com"><\/script>
<script>tailwind.config={darkMode:'class'}<\/script>`;

function hasTailwindScript(html: string): boolean {
  return /<script\b[^>]*\bsrc=["'][^"']*cdn\.tailwindcss\.com[^"']*["']/i.test(html);
}

function injectTailwindIntoFullDocument(html: string): string {
  if (hasTailwindScript(html)) return html;

  const headCloseRegex = /<\/head\s*>/i;
  if (headCloseRegex.test(html)) {
    return html.replace(headCloseRegex, `${TAILWIND_SCRIPT}\n</head>`);
  }

  const headOpenRegex = /<head\b[^>]*>/i;
  if (headOpenRegex.test(html)) {
    return html.replace(headOpenRegex, (match) => `${match}\n${TAILWIND_SCRIPT}`);
  }

  const bodyOpenRegex = /<body\b[^>]*>/i;
  if (bodyOpenRegex.test(html)) {
    return html.replace(bodyOpenRegex, (match) => `${TAILWIND_SCRIPT}\n${match}`);
  }

  return `${TAILWIND_SCRIPT}\n${html}`;
}

function buildHtmlDocument(content: string): string {
  const trimmed = content.trim().toLowerCase();
  if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
    return injectTailwindIntoFullDocument(content);
  }
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${TAILWIND_SCRIPT}
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif}</style>
</head>
<body>${content}</body>
</html>`;
}

export const HtmlArtifact = memo(function HtmlArtifact({ content }: { content: string }) {
  const html = useMemo(() => content ? buildHtmlDocument(content) : "", [content]);
  const { iframeRef, ready, send, sandboxUrl, sandboxAttr } = useSandboxIframe();

  useEffect(() => {
    if (ready && html) send(html);
  }, [ready, html, send]);

  if (!html) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Waiting for content…
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-primary" />
            <span className="text-xs text-muted-foreground">Loading preview…</span>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={sandboxUrl}
        sandbox={sandboxAttr}
        referrerPolicy="no-referrer"
        className="h-full w-full border-0"
        title="HTML Artifact"
      />
    </div>
  );
});
