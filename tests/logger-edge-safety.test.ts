import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { unlinkSync, writeFileSync } from "node:fs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const SANDBOX_SCRIPT = `
import assert from 'node:assert/strict';
const path = await import('node:path');
const fileURLToPath = (await import('node:url')).fileURLToPath;
const here = path.dirname(fileURLToPath(import.meta.url));
const loggerMod = await import(path.join(here, 'lib', 'logger.ts'));
const obsMod = await import(path.join(here, 'lib', 'observability.ts'));

const realProcess = globalThis.process;
try {
  Object.defineProperty(globalThis, 'process', {
    value: undefined,
    configurable: true,
    writable: true,
  });
  assert.doesNotThrow(() => loggerMod.emergencyLog('hostile-env-test-message'));
  assert.doesNotThrow(() => loggerMod.emergencyLog(() => 'hostile-env-test-factory'));
  assert.doesNotThrow(() => obsMod.logInfo({ event: 'hostile_env_test', message: 'info' }));
  assert.doesNotThrow(() => obsMod.logWarn({ event: 'hostile_env_test', message: 'warn' }));
  assert.doesNotThrow(() => obsMod.logError({ event: 'hostile_env_test', message: 'error' }));
  assert.doesNotThrow(() => obsMod.isObservabilityLoggingEnabled());
  assert.doesNotThrow(() => obsMod.isObservabilityLoggingEnabled('production'));
  assert.doesNotThrow(() => obsMod.isObservabilityLoggingEnabled('development'));
  assert.doesNotThrow(() => loggerMod.logger.info('hostile', 'env'));
  assert.doesNotThrow(() => loggerMod.logger.warn('hostile', 'env'));
  assert.doesNotThrow(() => loggerMod.logger.error('hostile', 'env'));
  assert.doesNotThrow(() => obsMod.logMetric({ metric: 'hostile_test', value: 1 }));
} finally {
  Object.defineProperty(globalThis, 'process', {
    value: realProcess,
    configurable: true,
    writable: true,
  });
}
console.log('OK: logger/observability safe under process=undefined');
`;

test("logger and observability modules do not reference `process.*` directly in code", async () => {
  async function checkFile(relPath: string): Promise<void> {
    const full = path.join(REPO_ROOT, relPath);
    const src = await fs.readFile(full, "utf8");
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(
        /\bprocess\s*\.\s*(env|stderr|stdout|stdin|cwd|platform|version|memoryUsage|uptime|cpuUsage|exit|kill|hrtime|nextTick|argv|execPath|exitCode|pid|ppid|browser|config)\b/g,
        "<<PROCESS_DIRECT_REMOVED>>",
      );
    assert.doesNotMatch(
      stripped,
      /<<PROCESS_DIRECT_REMOVED>>/,
      `${relPath} must not reference process.* directly. Use the globalThis.process pattern instead.`,
    );
  }

  await checkFile("lib/observability.ts");
  await checkFile("lib/logger.ts");
});

test("logger and observability modules run cleanly when globalThis.process is undefined", () => {
  const scriptPath = path.join(REPO_ROOT, ".tmp-hostile-env-check.mts");
  writeFileSync(scriptPath, SANDBOX_SCRIPT, "utf8");
  try {
    const result = spawnSync(
      "node",
      ["--import", "tsx", scriptPath],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, NODE_ENV: "production" },
        encoding: "utf8",
        timeout: 30_000,
      },
    );
    if (result.status !== 0) {
      assert.fail(
        `hostile-env child process failed (status=${result.status})\n` +
          `stdout:\n${result.stdout}\n` +
          `stderr:\n${result.stderr}`,
      );
    }
    assert.match(
      result.stdout,
      /OK: logger\/observability safe under process=undefined/,
    );
  } finally {
    try {
      unlinkSync(scriptPath);
    } catch {
    }
  }
});
