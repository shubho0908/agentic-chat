import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  COMPOSIO_TOOLKITS,
  TOOLKIT_TOOL_PREFIXES,
  type ComposioToolkit,
} from "@/lib/tools/composio/config";

const SOURCE_ROOTS = ["lib", "app", "components", "hooks"] as const;
const SLUG_PATTERN = /\b([A-Z][A-Z0-9]*_[A-Z0-9_]+)\b/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

function extractSlugsFromCodebase(): Map<ComposioToolkit, Set<string>> {
  const slugsByToolkit = new Map<ComposioToolkit, Set<string>>();
  for (const toolkit of COMPOSIO_TOOLKITS) {
    slugsByToolkit.set(toolkit, new Set());
  }

  const files = SOURCE_ROOTS.flatMap((root) => walk(root));
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const matches = content.matchAll(SLUG_PATTERN);
    for (const match of matches) {
      const slug = match[1];
      for (const toolkit of COMPOSIO_TOOLKITS) {
        if (slug.startsWith(TOOLKIT_TOOL_PREFIXES[toolkit])) {
          slugsByToolkit.get(toolkit)!.add(slug);
          break;
        }
      }
    }
  }
  return slugsByToolkit;
}

async function fetchToolkitSlugs(
  toolkit: ComposioToolkit,
  apiKey: string,
): Promise<Set<string>> {
  const response = await fetch(
    `https://backend.composio.dev/api/v3/tools?toolkit_slug=${toolkit}&limit=500`,
    { headers: { "x-api-key": apiKey } },
  );
  if (!response.ok) {
    throw new Error(
      `Composio API returned ${response.status} for toolkit ${toolkit}`,
    );
  }
  const data = (await response.json()) as { items?: Array<{ slug?: string }> };
  return new Set(
    (data.items ?? [])
      .map((item) => item.slug)
      .filter((slug): slug is string => typeof slug === "string"),
  );
}

test("every Composio slug referenced in the codebase exists in the live Composio API", async (t) => {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    t.skip("COMPOSIO_API_KEY is not set; skipping live API validation");
    return;
  }

  const codebaseSlugs = extractSlugsFromCodebase();
  const errors: string[] = [];

  for (const toolkit of COMPOSIO_TOOLKITS) {
    const referenced = codebaseSlugs.get(toolkit) ?? new Set();
    if (referenced.size === 0) continue;

    const liveSlugs = await fetchToolkitSlugs(toolkit, apiKey);
    const invalid = [...referenced].filter((slug) => !liveSlugs.has(slug));
    if (invalid.length > 0) {
      errors.push(
        `[${toolkit}] ${invalid.length} invalid slug(s):\n  - ${invalid.join("\n  - ")}`,
      );
    }
  }

  assert.equal(
    errors.length,
    0,
    `Found Composio slug(s) in the codebase that no longer exist in the live API. ` +
      `Update lib/tools/composio/config.ts (and any prompts/tests that mention them).\n\n${errors.join("\n\n")}`,
  );
});
