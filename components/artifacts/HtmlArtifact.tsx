"use client";

import { memo, useCallback, useMemo, useState } from "react";

function buildSrcdoc(content: string): string {
  if (content.trim().toLowerCase().startsWith("<!doctype") || content.trim().toLowerCase().startsWith("<html")) {
    return content;
  }
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdn.tailwindcss.com"><\/script>
<script>tailwind.config={darkMode:'class'}<\/script>
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif}</style>
</head>
<body>${content}</body>
</html>`;
}

export const HtmlArtifact = memo(function HtmlArtifact({ content }: { content: string }) {
  const srcdoc = useMemo(() => content ? buildSrcdoc(content) : "", [content]);
  const [loaded, setLoaded] = useState(false);
  const onLoad = useCallback(() => setLoaded(true), []);

  if (!srcdoc) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Waiting for content…
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {!loaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-primary" />
            <span className="text-xs text-muted-foreground">Loading preview…</span>
          </div>
        </div>
      )}
      <iframe
        srcDoc={srcdoc}
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
        className="h-full w-full border-0"
        title="HTML Artifact"
        onLoad={onLoad}
      />
    </div>
  );
});
