import { spawn } from "node:child_process";
import { prepareCiEnv } from "./prepare-ci-env.mjs";

const steps = [
  {
    name: "Validate Prisma schema",
    command: "pnpm",
    args: ["run", "prisma:validate"],
  },
  { name: "Typecheck", command: "pnpm", args: ["run", "typecheck"] },
  { name: "Lint", command: "pnpm", args: ["run", "lint"] },
  { name: "Test", command: "pnpm", args: ["run", "test"] },
  { name: "Build", command: "pnpm", args: ["run", "build"] },
];

function runStep(step) {
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        CI: "true",
      },
    });
    currentChild = child;

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      currentChild = null;

      if (signal) {
        reject(new Error(`${step.name} terminated by signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${step.name} failed with exit code ${code}`));
        return;
      }

      resolve();
    });
  });
}

let restoreEnv = async () => {};
let currentChild = null;
let cleaningUp = false;

async function restoreEnvSafely() {
  if (cleaningUp) {
    return;
  }

  cleaningUp = true;

  try {
    await restoreEnv();
  } finally {
    cleaningUp = false;
  }
}

async function handleSignal(signal) {
  if (currentChild && !currentChild.killed) {
    currentChild.kill(signal);
  }

  await restoreEnvSafely();
  process.exit(signal === "SIGINT" ? 130 : 143);
}

process.on("SIGINT", () => {
  void handleSignal("SIGINT");
});

process.on("SIGTERM", () => {
  void handleSignal("SIGTERM");
});

try {
  const prepared = await prepareCiEnv();
  restoreEnv = prepared.restore;

  for (const step of steps) {
    console.log(`\n==> ${step.name}`);
    await runStep(step);
  }

  console.log("\nLocal CI passed.");
} catch (error) {
  console.error(
    `\nLocal CI failed: ${(error instanceof Error && error.message) || String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await restoreEnvSafely();
}
