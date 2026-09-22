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

const checkpointSchema = z.enum(Object.values(JevCheckpoint));
const modeSchema = z.enum(Object.values(JevMode));
const outcomeRowSchema = z.object({
  checkpoint: z.string().min(1),
  mode: z.string().min(1).optional(),
  outcome: z.string().min(1),
  count: z.number().int().nonnegative(),
});
const latencyRowSchema = z.object({
  checkpoint: z.string().min(1),
  mode: z.string().min(1).optional(),
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

type OutcomeRow = z.infer<typeof outcomeRowSchema>;
type LatencyRow = z.infer<typeof latencyRowSchema>;

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

export async function queryJevStats(
  query: JevStatsQuery,
): Promise<JevCheckpointStats[]> {
  const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);
  const { checkpoint, mode } = query;

  const rawOutcomeRows = await prisma.$queryRawUnsafe<unknown[]>(
    `SELECT checkpoint, outcome, COUNT(*)::int AS count
     FROM jev_decisions
     WHERE created_at >= $1
       AND ($2::text IS NULL OR checkpoint = $2)
       AND ($3::text IS NULL OR mode = $3)
     GROUP BY checkpoint, outcome`,
    since,
    checkpoint,
    mode,
  );
  const rawLatencyRows = await prisma.$queryRawUnsafe<unknown[]>(
    `SELECT checkpoint,
       COUNT(*)::int AS total,
       AVG(CASE WHEN fallback_used THEN 1.0 ELSE 0.0 END)::float AS fallback_rate,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::float AS p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::float AS p95
     FROM jev_decisions
     WHERE created_at >= $1
       AND ($2::text IS NULL OR checkpoint = $2)
       AND ($3::text IS NULL OR mode = $3)
     GROUP BY checkpoint`,
    since,
    checkpoint,
    mode,
  );
  const rawModeOutcomeRows = await prisma.$queryRawUnsafe<unknown[]>(
    `SELECT checkpoint, mode, outcome, COUNT(*)::int AS count
     FROM jev_decisions
     WHERE created_at >= $1
       AND ($2::text IS NULL OR checkpoint = $2)
       AND ($3::text IS NULL OR mode = $3)
     GROUP BY checkpoint, mode, outcome`,
    since,
    checkpoint,
    mode,
  );
  const rawModeLatencyRows = await prisma.$queryRawUnsafe<unknown[]>(
    `SELECT checkpoint, mode,
       COUNT(*)::int AS total,
       AVG(CASE WHEN fallback_used THEN 1.0 ELSE 0.0 END)::float AS fallback_rate,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::float AS p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::float AS p95
     FROM jev_decisions
     WHERE created_at >= $1
       AND ($2::text IS NULL OR checkpoint = $2)
       AND ($3::text IS NULL OR mode = $3)
     GROUP BY checkpoint, mode`,
    since,
    checkpoint,
    mode,
  );

  const outcomeRows = z.array(outcomeRowSchema).parse(rawOutcomeRows);
  const latencyRows = z.array(latencyRowSchema).parse(rawLatencyRows);
  const modeOutcomeRows = z.array(outcomeRowSchema).parse(rawModeOutcomeRows);
  const modeLatencyRows = z.array(latencyRowSchema).parse(rawModeLatencyRows);

  return mergeJevStats(
    outcomeRows,
    latencyRows,
    modeOutcomeRows,
    modeLatencyRows,
  );
}
