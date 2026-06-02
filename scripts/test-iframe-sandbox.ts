import { chromium, firefox, webkit, type Browser } from "playwright";

const REACT_CONTENT = `
import React from 'react';
export default function App() {
  return React.createElement('div', { className: 'p-4 bg-blue-500 text-white rounded-lg' }, 'Hello from React Artifact');
}
`;

const HTML_CONTENT = `<div class="p-4 bg-green-500 text-white rounded-lg">Hello from HTML Artifact</div>`;

const TAILWIND_SCRIPT = `<script src="https://cdn.tailwindcss.com"><\/script>
<script>tailwind.config={darkMode:'class'}<\/script>`;

function buildHtmlSrcdoc(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${TAILWIND_SCRIPT}
</head>
<body>${content}</body>
</html>`;
}

function buildReactSrcdoc(jsx: string): string {
  const escaped = jsx.replace(/<\/script/gi, "<\\/script");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${TAILWIND_SCRIPT}
<script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin><\/script>
<script src="https://unpkg.com/prop-types@15/prop-types.min.js" crossorigin><\/script>
<script src="https://unpkg.com/recharts@2/umd/Recharts.js" crossorigin><\/script>
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
  pre.textContent = message;
  rootEl.replaceChildren(pre);
}
try {
  const code = ${JSON.stringify(escaped)};
  const transformed = transform(code, { transforms: ['jsx','typescript','imports'], jsxRuntime: 'classic', jsxPragma: 'React.createElement', jsxFragmentPragma: 'React.Fragment' }).code;
  const exports = {};
  const module = { exports };
  const require = function(name) {
    if (name === 'react') return window.React;
    if (name === 'react-dom' || name === 'react-dom/client') return window.ReactDOM;
    if (name === 'recharts') return window.Recharts || {};
    return {};
  };
  const fn = new Function('React','ReactDOM','require','exports','module', transformed);
  fn(window.React, window.ReactDOM, require, exports, module);
  const Component = exports.default || exports.App || module.exports.default || module.exports;
  if (typeof Component === 'function') {
    const root = window.ReactDOM.createRoot(document.getElementById('root'));
    root.render(window.React.createElement(Component));
    document.title = 'RENDER_OK';
  } else {
    renderMessage('No default export', 'red');
    document.title = 'RENDER_NO_DEFAULT';
  }
} catch(e) {
  renderMessage(e?.message || String(e), 'red');
  document.title = 'RENDER_ERROR';
}
<\/script>
</body>
</html>`;
}

async function testIframe(label: string, browser: Browser, sandbox: string, srcdoc: string, selector: string): Promise<string> {
  const page = await browser.newPage();
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  const requestFailed: string[] = [];

  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("requestfailed", (req) =>
    requestFailed.push(`${req.url().slice(0, 80)} -> ${req.failure()?.errorText}`),
  );

  const escaped = srcdoc.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const html = `<!DOCTYPE html><html><body>
<iframe id="frame" sandbox="${sandbox}" srcdoc="${escaped}" style="width:600px;height:300px;border:1px solid #000"></iframe>
</body></html>`;

  await page.setContent(html);
  await page.waitForTimeout(6000);

  const lines: string[] = [`--- ${label} | sandbox="${sandbox}" ---`];
  const frame = page.frames().find((f) => f !== page.mainFrame());
  if (!frame) {
    lines.push("  iframe not found");
    await page.close();
    return lines.join("\n");
  }

  try {
    const title = await frame.title();
    const result = await frame.evaluate((sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return { found: false, text: "", bg: "", color: "" };
      const cs = window.getComputedStyle(el as Element);
      return {
        found: true,
        text: (el.textContent ?? "").slice(0, 100),
        bg: cs.backgroundColor,
        color: cs.color,
      };
    }, selector);
    lines.push(`  title: ${title}`);
    lines.push(`  selector "${selector}": ${JSON.stringify(result)}`);
    const tailwindApplied =
      result.found &&
      result.bg !== "rgba(0, 0, 0, 0)" &&
      result.bg !== "rgb(0, 0, 0)" &&
      result.bg !== "" &&
      result.bg !== "transparent";
    lines.push(`  tailwind applied: ${tailwindApplied}`);
  } catch (err) {
    lines.push(`  inspect failed: ${(err as Error).message}`);
  }

  if (errors.length) lines.push(`  pageerrors: ${errors.join(" | ")}`);
  if (consoleErrors.length) lines.push(`  console errors: ${consoleErrors.join(" | ")}`);
  if (requestFailed.length) lines.push(`  request failed: ${requestFailed.join(" | ")}`);

  await page.close();
  return lines.join("\n");
}

async function runWithBrowser(name: string, launcher: { launch: () => Promise<Browser> }) {
  console.log(`\n############ ${name} ############`);
  const browser = await launcher.launch();
  const reactDoc = buildReactSrcdoc(REACT_CONTENT);
  const htmlDoc = buildHtmlSrcdoc(HTML_CONTENT);

  console.log(await testIframe("REACT", browser, "allow-scripts allow-same-origin", reactDoc, "#root > div"));
  console.log(await testIframe("REACT", browser, "allow-scripts", reactDoc, "#root > div"));
  console.log(await testIframe("HTML", browser, "allow-scripts allow-same-origin", htmlDoc, "body > div"));
  console.log(await testIframe("HTML", browser, "allow-scripts", htmlDoc, "body > div"));
  await browser.close();
}

async function main() {
  await runWithBrowser("CHROMIUM", chromium);
  try {
    await runWithBrowser("FIREFOX", firefox);
  } catch (err) {
    console.log("FIREFOX skipped: " + (err as Error).message.split("\n")[0]);
  }
  try {
    await runWithBrowser("WEBKIT", webkit);
  } catch (err) {
    console.log("WEBKIT skipped: " + (err as Error).message.split("\n")[0]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
