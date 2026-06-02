"use client";

import { memo, useEffect, useMemo } from "react";
import { useSandboxIframe } from "./useSandboxIframe";

function buildReactHtml(jsx: string): string {
  const escaped = jsx.replace(/<\/script/gi, "<\\/script");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdn.tailwindcss.com"><\/script>
<script>tailwind.config={darkMode:'class'}<\/script>
<script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin><\/script>
<script src="https://unpkg.com/prop-types@15/prop-types.min.js" crossorigin><\/script>
<script src="https://unpkg.com/recharts@2/umd/Recharts.js" crossorigin><\/script>
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif}#root{min-height:100vh}</style>
</head>
<body>
<div id="root"></div>
<script type="module">
import { transform } from "https://esm.sh/sucrase@3.35.1";

function renderMessage(message, color) {
  const rootEl = document.getElementById('root');
  const pre = document.createElement('pre');
  pre.style.color = color;
  pre.style.padding = '1rem';
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.fontSize = '13px';
  pre.textContent = message;
  rootEl.replaceChildren(pre);
}

try {
  const code = ${JSON.stringify(escaped)};
  const transformed = transform(code, {
    transforms: ['jsx', 'typescript', 'imports'],
    jsxRuntime: 'classic',
    jsxPragma: 'React.createElement',
    jsxFragmentPragma: 'React.Fragment',
  }).code;

  const exports = {};
  const module = { exports };
  const require = function(name) {
    if (name === 'react') return window.React;
    if (name === 'react-dom' || name === 'react-dom/client') return window.ReactDOM;
    if (name === 'recharts') return window.Recharts || {};
    return {};
  };

  const fn = new Function('React', 'ReactDOM', 'require', 'exports', 'module', transformed);
  fn(window.React, window.ReactDOM, require, exports, module);

  const Component = exports.default || exports.App || module.exports.default || module.exports;
  if (typeof Component === 'function') {
    const root = window.ReactDOM.createRoot(document.getElementById('root'));
    root.render(window.React.createElement(Component));
  } else {
    renderMessage('No default export found. Export a React component as default.', 'red');
  }
} catch(e) {
  renderMessage(e && e.message ? e.message : String(e), 'red');
}
<\/script>
</body>
</html>`;
}

export const ReactArtifact = memo(function ReactArtifact({ content }: { content: string }) {
  const html = useMemo(() => content ? buildReactHtml(content) : "", [content]);
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
        title="React Artifact"
      />
    </div>
  );
});
