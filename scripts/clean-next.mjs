import { rm } from "node:fs/promises";
import path from "node:path";
import logger from "./logger.mjs";

const rootDir = process.cwd();
const nextDir = path.join(rootDir, ".next");

try {
  await rm(nextDir, { recursive: true, force: true });
} catch (error) {
  logger.error(
    `Failed to clean ${nextDir}: ${(error instanceof Error && error.message) || String(error)}`
  );
  process.exitCode = 1;
}
