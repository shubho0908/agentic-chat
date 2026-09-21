import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import nextConfig from "../next.config";

test("sandbox.html ships a strict CSP with no network egress", async () => {
  const entries = await nextConfig.headers!();
  const sandboxEntry = entries.find(
    (entry) => entry.source === "/sandbox.html",
  );
  assert.ok(sandboxEntry, "sandbox.html header entry missing");
  const csp = sandboxEntry.headers.find(
    (header) => header.key === "Content-Security-Policy",
  )?.value;
  assert.ok(csp, "CSP header missing");
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /form-action 'none'/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /img-src 'self' data:/);
  assert.doesNotMatch(csp, /img-src[^;]*https:/);
  const scriptSrc = /script-src ([^;]+)/.exec(csp)?.[1] ?? "";
  for (const host of ["https://cdn.tailwindcss.com", "https://unpkg.com", "https://esm.sh"]) {
    assert.ok(scriptSrc.includes(host), `script-src missing ${host}`);
  }
  assert.ok(!/\*:/.test(scriptSrc) && !scriptSrc.includes("*"), "script-src must stay an allowlist");
});

test("sandbox host page renders via srcdoc iframe, never document.write", () => {
  const html = readFileSync("public/sandbox.html", "utf8");
  assert.ok(!html.includes("document.write"), "document.write still present");
  assert.ok(!html.includes("document.open"), "document.open still present");
  assert.match(html, /srcdoc/);
  assert.match(html, /allow-scripts/);
  assert.match(html, /e\.source !== window\.parent/);
});
