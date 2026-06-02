"use client";

import { memo, useMemo } from "react";
import DOMPurify from "dompurify";

function buildSvgSrcdoc(svg: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body { margin: 0; min-height: 100%; background: transparent; }
  body { display: grid; place-items: center; padding: 16px; box-sizing: border-box; }
  svg { max-width: 100%; height: auto; }
</style>
</head>
<body>${svg}</body>
</html>`;
}

export const SvgArtifact = memo(function SvgArtifact({ content }: { content: string }) {
  const srcdoc = useMemo(() => {
    if (typeof window === "undefined") return "";
    const sanitized = DOMPurify.sanitize(content, { USE_PROFILES: { svg: true, svgFilters: true } });
    return buildSvgSrcdoc(sanitized);
  }, [content]);

  return (
    <iframe
      srcDoc={srcdoc}
      sandbox=""
      referrerPolicy="no-referrer"
      className="h-full w-full border-0"
      title="SVG Artifact"
    />
  );
});
