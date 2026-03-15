import { randomBytes } from "node:crypto";
import { copyFile, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENV_FILE = ".env";
const ENV_LOCAL_FILE = ".env.local";
const ENV_EXAMPLE_FILE = ".env.example";

function randomSuffix() {
  return `${Date.now()}-${process.pid}-${randomBytes(4).toString("hex")}`;
}

function replaceOrAppendEnvVar(content, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(content)) {
    return content.replace(pattern, `${key}=${value}`);
  }

  const normalized = content.endsWith("\n") ? content : `${content}\n`;
  return `${normalized}${key}=${value}\n`;
}

export async function prepareCiEnv(rootDir = process.cwd()) {
  const envExamplePath = path.join(rootDir, ENV_EXAMPLE_FILE);
  const envPath = path.join(rootDir, ENV_FILE);
  const envLocalPath = path.join(rootDir, ENV_LOCAL_FILE);
  const backupSuffix = randomSuffix();
  const envBackupPath = path.join(rootDir, `${ENV_FILE}.backup-${backupSuffix}`);
  const envLocalBackupPath = path.join(rootDir, `${ENV_LOCAL_FILE}.backup-${backupSuffix}`);

  let envExample;

  try {
    envExample = await readFile(envExamplePath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${ENV_EXAMPLE_FILE}: ${(error instanceof Error && error.message) || String(error)}`);
  }

  let hadEnv = false;
  let hadEnvLocal = false;
  let finished = false;

  try {
    await copyFile(envPath, envBackupPath);
    hadEnv = true;
  } catch {
    hadEnv = false;
  }

  try {
    await rename(envLocalPath, envLocalBackupPath);
    hadEnvLocal = true;
  } catch {
    hadEnvLocal = false;
  }

  let nextEnv = envExample;

  nextEnv = replaceOrAppendEnvVar(nextEnv, "ENCRYPTION_KEY", randomBytes(32).toString("hex"));
  nextEnv = replaceOrAppendEnvVar(
    nextEnv,
    "BETTER_AUTH_SECRET",
    randomBytes(32).toString("base64").replace(/\n/g, "")
  );
  nextEnv = replaceOrAppendEnvVar(
    nextEnv,
    "DATABASE_URL",
    "postgresql://ci:ci@localhost:5432/agentic_chat_ci"
  );
  nextEnv = replaceOrAppendEnvVar(
    nextEnv,
    "DIRECT_DATABASE_URL",
    "postgresql://ci:ci@localhost:5432/agentic_chat_ci"
  );

  try {
    await writeFile(envPath, nextEnv, "utf8");
    finished = true;
  } catch (error) {
    if (hadEnv) {
      await rename(envBackupPath, envPath);
    } else {
      await rm(envPath, { force: true });
    }

    if (hadEnvLocal) {
      await rename(envLocalBackupPath, envLocalPath);
    }

    throw error;
  }

  return {
    async restore() {
      if (!finished) {
        return;
      }

      finished = false;

      if (hadEnv) {
        await rename(envBackupPath, envPath);
      } else {
        await rm(envPath, { force: true });
      }

      if (hadEnvLocal) {
        await rename(envLocalBackupPath, envLocalPath);
      }
    },
  };
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
const allowDirectMutation =
  process.env.GITHUB_ACTIONS === "true" || process.argv.includes("--write");

if (isDirectRun) {
  if (!allowDirectMutation) {
    console.error(
      "Refusing to mutate local env files directly. Use `pnpm run ci:local` for local checks or pass `--write` explicitly."
    );
    process.exit(1);
  }

  await prepareCiEnv();
}
