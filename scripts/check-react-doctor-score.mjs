import { spawnSync } from "node:child_process";

const MIN_SCORE = Number(process.env.REACT_DOCTOR_MIN_SCORE ?? 98);
const useFullScan = process.argv.includes("--full");
const useStagedScan = !useFullScan;

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function getStagedSourceFiles() {
  const result = run("git", [
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMRT",
  ]);

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Unable to inspect staged files.");
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((filePath) => /\.(jsx?|tsx?)$/.test(filePath));
}

if (!Number.isFinite(MIN_SCORE)) {
  console.error("REACT_DOCTOR_MIN_SCORE must be a number.");
  process.exit(1);
}

if (useStagedScan && getStagedSourceFiles().length === 0) {
  console.log("React Doctor skipped: no staged JS/TS source files.");
  process.exit(0);
}

const reactDoctorArgs = [
  "exec",
  "react-doctor",
  "--score",
  "--project",
  "agentic-chat",
  useFullScan ? "--full" : "--staged",
  ".",
];
const env = { ...process.env };

delete env.CI;

const result = run("pnpm", reactDoctorArgs, { env });

if (result.stderr.trim()) {
  process.stderr.write(result.stderr);
}

if (result.status !== 0) {
  process.stderr.write(result.stdout);
  process.exit(result.status ?? 1);
}

const rawScore = result.stdout.trim();
const score = Number(rawScore.match(/\d+(?:\.\d+)?/)?.[0]);

if (!Number.isFinite(score)) {
  console.error(
    "React Doctor did not return a numeric score. Check network access to the React Doctor score service.",
  );
  process.exit(1);
}

if (score <= MIN_SCORE) {
  console.error(
    `React Doctor score ${score} must be greater than ${MIN_SCORE}.`,
  );
  process.exit(1);
}

console.log(`React Doctor score ${score} > ${MIN_SCORE}.`);
