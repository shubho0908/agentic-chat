import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  JevCheckpoint,
  JevMode,
  type JevCheckpointName,
  type JevModeValue,
} from "./types";

export const JEV_STATS_DEFAULT_DAYS = 30;
export const JEV_STATS_MAX_DAYS = 90;

export const JEV_STATS_ALLOWED_EMAIL_ENV = "JEV_STATS_ALLOWED_EMAIL";

export function isJevStatsAllowedEmail(
  email: string | null | undefined,
  allowedEmail: string | null | undefined,
): boolean {
  const allowed = allowedEmail?.trim();
  if (!allowed || !email) return false;
  return email.trim().toLowerCase() === allowed.toLowerCase();
}

export const JEV_STATS_CACHE_TTL_ENV = "JEV_STATS_CACHE_TTL_SECONDS";
export const JEV_STATS_CACHE_DEFAULT_TTL_SECONDS = 30;
export const JEV_STATS_CACHE_MAX_TTL_SECONDS = 300;

export function resolveJevStatsCacheTtlMs(
  raw: string | null | undefined,
): number {
  const trimmed = raw?.trim();
  const parsed = trimmed ? Number(trimmed) : Number.NaN;
  const seconds =
    Number.isInteger(parsed) && parsed >= 0
      ? Math.min(parsed, JEV_STATS_CACHE_MAX_TTL_SECONDS)
      : JEV_STATS_CACHE_DEFAULT_TTL_SECONDS;
  return seconds * 1000;
}

const checkpointSchema = z.enum(Object.values(JevCheckpoint));
const modeSchema = z.enum(Object.values(JevMode));
const outcomeRowSchema = z.object({
  checkpoint: z.string().min(1),
  mode: z.string().min(1).nullable(),
  mode_grouped: z.number().int().min(0).max(1),
  outcome: z.string().min(1),
  count: z.number().int().nonnegative(),
});
const latencyRowSchema = z.object({
  checkpoint: z.string().min(1),
  mode: z.string().min(1).nullable(),
  mode_grouped: z.number().int().min(0).max(1),
  total: z.number().int().nonnegative(),
  fallback_rate: z.number().min(0).max(1),
  p50: z.number().nonnegative().nullable(),
  p95: z.number().nonnegative().nullable(),
});

export interface JevStatsQuery {
  days: number;
  checkpoint: JevCheckpointName | null;
  mode: JevModeValue | null;
}

export function parseJevStatsQuery(
  searchParams: URLSearchParams,
): JevStatsQuery | { error: string } {
  const rawDays = searchParams.get("days");
  let days = JEV_STATS_DEFAULT_DAYS;
  if (rawDays !== null) {
    const parsed = Number(rawDays);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { error: "days must be a positive number" };
    }
    days = Math.min(JEV_STATS_MAX_DAYS, Math.max(1, Math.floor(parsed)));
  }

  const rawCheckpoint = searchParams.get("checkpoint")?.trim();
  const parsedCheckpoint = rawCheckpoint
    ? checkpointSchema.safeParse(rawCheckpoint)
    : null;
  if (parsedCheckpoint && !parsedCheckpoint.success) {
    return {
      error: `unknown checkpoint: ${rawCheckpoint}. Expected one of ${checkpointSchema.options.join(", ")}`,
    };
  }

  const rawMode = searchParams.get("mode")?.trim();
  const parsedMode = rawMode ? modeSchema.safeParse(rawMode) : null;
  if (parsedMode && !parsedMode.success) {
    return {
      error: `unknown mode: ${rawMode}. Expected one of ${modeSchema.options.join(", ")}`,
    };
  }

  return {
    days,
    checkpoint: parsedCheckpoint?.success ? parsedCheckpoint.data : null,
    mode: parsedMode?.success ? parsedMode.data : null,
  };
}

interface OutcomeRow {
  checkpoint: string;
  mode?: string | null;
  mode_grouped?: number;
  outcome: string;
  count: number;
}

interface LatencyRow {
  checkpoint: string;
  mode?: string | null;
  mode_grouped?: number;
  total: number;
  fallback_rate: number;
  p50: number | null;
  p95: number | null;
}

interface JevStatsAggregate {
  total: number;
  outcomes: Record<string, number>;
  fallbackRate: number;
  latencyMs: { p50: number | null; p95: number | null };
}

export interface JevModeStats extends JevStatsAggregate {
  mode: JevModeValue;
}

export interface JevCheckpointStats extends JevStatsAggregate {
  checkpoint: string;
  modes: JevModeStats[];
}

function aggregateFromLatency(row: LatencyRow): JevStatsAggregate {
  return {
    total: row.total,
    outcomes: {},
    fallbackRate: Math.round(row.fallback_rate * 10_000) / 10_000,
    latencyMs: {
      p50: row.p50 === null ? null : Math.round(row.p50),
      p95: row.p95 === null ? null : Math.round(row.p95),
    },
  };
}

function emptyAggregate(): JevStatsAggregate {
  return {
    total: 0,
    outcomes: {},
    fallbackRate: 0,
    latencyMs: { p50: null, p95: null },
  };
}

export function mergeJevStats(
  outcomeRows: OutcomeRow[],
  latencyRows: LatencyRow[],
  modeOutcomeRows: OutcomeRow[] = [],
  modeLatencyRows: LatencyRow[] = [],
): JevCheckpointStats[] {
  const byCheckpoint = new Map<string, JevCheckpointStats>();
  for (const row of latencyRows) {
    byCheckpoint.set(row.checkpoint, {
      checkpoint: row.checkpoint,
      ...aggregateFromLatency(row),
      modes: [],
    });
  }
  for (const row of outcomeRows) {
    const entry = byCheckpoint.get(row.checkpoint) ?? {
      checkpoint: row.checkpoint,
      ...emptyAggregate(),
      modes: [],
    };
    entry.outcomes[row.outcome] = row.count;
    byCheckpoint.set(row.checkpoint, entry);
  }

  const modesByCheckpoint = new Map<string, Map<JevModeValue, JevModeStats>>();
  for (const row of modeLatencyRows) {
    const parsedMode = modeSchema.safeParse(row.mode);
    if (!parsedMode.success) continue;
    const byMode = modesByCheckpoint.get(row.checkpoint) ?? new Map();
    byMode.set(parsedMode.data, {
      mode: parsedMode.data,
      ...aggregateFromLatency(row),
    });
    modesByCheckpoint.set(row.checkpoint, byMode);
  }
  for (const row of modeOutcomeRows) {
    const parsedMode = modeSchema.safeParse(row.mode);
    if (!parsedMode.success) continue;
    const byMode = modesByCheckpoint.get(row.checkpoint) ?? new Map();
    const entry = byMode.get(parsedMode.data) ?? {
      mode: parsedMode.data,
      ...emptyAggregate(),
    };
    entry.outcomes[row.outcome] = row.count;
    byMode.set(parsedMode.data, entry);
    modesByCheckpoint.set(row.checkpoint, byMode);
  }
  for (const [checkpoint, modes] of modesByCheckpoint) {
    const entry = byCheckpoint.get(checkpoint);
    if (entry) {
      entry.modes = [...modes.values()].sort((a, b) => b.total - a.total);
    }
  }

  return [...byCheckpoint.values()].sort((a, b) => b.total - a.total);
}

export const JEV_STATS_ROUTE_MAX_DURATION_SECONDS = 60;
export const JEV_STATS_RESPONSE_MARGIN_MS = 5_000;
export const JEV_STATS_QUERY_DEADLINE_MS =
  JEV_STATS_ROUTE_MAX_DURATION_SECONDS * 1_000 - JEV_STATS_RESPONSE_MARGIN_MS;
export const JEV_STATS_TRANSACTION_MAX_WAIT_MS = 5_000;
export const JEV_STATS_TRANSACTION_TIMEOUT_MS =
  JEV_STATS_QUERY_DEADLINE_MS - JEV_STATS_TRANSACTION_MAX_WAIT_MS;
export const JEV_STATS_STATEMENT_TIMEOUT_MS =
  JEV_STATS_TRANSACTION_TIMEOUT_MS / 2;

export async function queryJevStats(
  query: JevStatsQuery,
): Promise<JevCheckpointStats[]> {
  const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);
  const { checkpoint, mode } = query;

  const [rawOutcomeRows, rawLatencyRows] = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('statement_timeout', $1, true)`,
        String(JEV_STATS_STATEMENT_TIMEOUT_MS),
      );
      const outcomeRows = await tx.$queryRawUnsafe<unknown[]>(
        `SELECT checkpoint,
       CASE WHEN GROUPING(mode) = 1 THEN NULL ELSE mode END AS mode,
       GROUPING(mode)::int AS mode_grouped,
       outcome,
       COUNT(*)::int AS count
     FROM jev_decisions
     WHERE created_at >= $1
       AND ($2::text IS NULL OR checkpoint = $2)
       AND ($3::text IS NULL OR mode = $3)
     GROUP BY GROUPING SETS (
       (checkpoint, outcome),
       (checkpoint, mode, outcome)
     )`,
        since,
        checkpoint,
        mode,
      );
      const latencyRows = await tx.$queryRawUnsafe<unknown[]>(
        `SELECT checkpoint,
       CASE WHEN GROUPING(mode) = 1 THEN NULL ELSE mode END AS mode,
       GROUPING(mode)::int AS mode_grouped,
       COUNT(*)::int AS total,
       AVG(CASE WHEN fallback_used THEN 1.0 ELSE 0.0 END)::float AS fallback_rate,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::float AS p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::float AS p95
     FROM jev_decisions
     WHERE created_at >= $1
       AND ($2::text IS NULL OR checkpoint = $2)
       AND ($3::text IS NULL OR mode = $3)
     GROUP BY GROUPING SETS (
       (checkpoint),
       (checkpoint, mode)
     )`,
        since,
        checkpoint,
        mode,
      );
      return [outcomeRows, latencyRows] as const;
    },
    {
      maxWait: JEV_STATS_TRANSACTION_MAX_WAIT_MS,
      timeout: JEV_STATS_TRANSACTION_TIMEOUT_MS,
    },
  );

  const allOutcomeRows: OutcomeRow[] = z
    .array(outcomeRowSchema)
    .parse(rawOutcomeRows);
  const allLatencyRows: LatencyRow[] = z
    .array(latencyRowSchema)
    .parse(rawLatencyRows);
  const outcomeRows = allOutcomeRows.filter((row) => row.mode_grouped === 1);
  const latencyRows = allLatencyRows.filter((row) => row.mode_grouped === 1);
  const modeOutcomeRows = allOutcomeRows.filter(
    (row): row is OutcomeRow & { mode: string } =>
      row.mode_grouped === 0 && row.mode !== null,
  );
  const modeLatencyRows = allLatencyRows.filter(
    (row): row is LatencyRow & { mode: string } =>
      row.mode_grouped === 0 && row.mode !== null,
  );

  return mergeJevStats(
    outcomeRows,
    latencyRows,
    modeOutcomeRows,
    modeLatencyRows,
  );
}

export interface JevStatsPayload {
  window: {
    days: number;
    checkpoint: JevCheckpointName | null;
    mode: JevModeValue | null;
    since: string;
  };
  checkpoints: JevCheckpointStats[];
}

export async function computeJevStatsPayload(
  query: JevStatsQuery,
): Promise<JevStatsPayload> {
  const since = new Date(
    Date.now() - query.days * 24 * 60 * 60 * 1000,
  ).toISOString();
  const checkpoints = await queryJevStats(query);
  return {
    window: {
      days: query.days,
      checkpoint: query.checkpoint,
      mode: query.mode,
      since,
    },
    checkpoints,
  };
}

interface JevStatsCacheEntry {
  payload: Promise<JevStatsPayload>;
  expiresAt: number;
}

export interface JevStatsCacheOptions {
  compute: (query: JevStatsQuery) => Promise<JevStatsPayload>;
  ttlMs: () => number;
  pendingDeadlineMs: number;
  now: () => number;
}

function jevStatsCacheKey(query: JevStatsQuery): string {
  return `${query.days}|${query.checkpoint ?? ""}|${query.mode ?? ""}`;
}

export function createJevStatsCache(options: JevStatsCacheOptions) {
  const entries = new Map<string, JevStatsCacheEntry>();

  function evictExpired(now: number): void {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
  }

  return function loadJevStats(query: JevStatsQuery): Promise<JevStatsPayload> {
    if (options.ttlMs() <= 0) {
      entries.clear();
      return options.compute(query);
    }

    const now = options.now();
    const key = jevStatsCacheKey(query);
    const cached = entries.get(key);
    if (cached && cached.expiresAt > now) return cached.payload;

    evictExpired(now);
    const payload = options.compute(query);
    const pending: JevStatsCacheEntry = {
      payload,
      expiresAt: now + options.pendingDeadlineMs,
    };
    entries.set(key, pending);
    payload.then(
      () => {
        if (entries.get(key) !== pending) return;
        entries.set(key, {
          payload,
          expiresAt: options.now() + options.ttlMs(),
        });
      },
      () => {
        if (entries.get(key) === pending) entries.delete(key);
      },
    );
    return payload;
  };
}

export const loadJevStats = createJevStatsCache({
  compute: computeJevStatsPayload,
  ttlMs: () => resolveJevStatsCacheTtlMs(process.env[JEV_STATS_CACHE_TTL_ENV]),
  pendingDeadlineMs: JEV_STATS_QUERY_DEADLINE_MS,
  now: Date.now,
});
