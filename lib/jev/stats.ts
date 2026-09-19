import { prisma } from "@/lib/prisma";
import { JevCheckpoint, type JevCheckpointName } from "./types";

export const JEV_STATS_DEFAULT_DAYS = 30;
export const JEV_STATS_MAX_DAYS = 90;

const CHECKPOINT_NAMES = new Set<string>(Object.values(JevCheckpoint));

export interface JevStatsQuery {
  days: number;
  checkpoint: JevCheckpointName | null;
}

/** Parses and validates the stats window. Days are clamped into 1..90; an
 * unknown checkpoint name is rejected so typos never silently return an
 * empty report. */
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
  if (rawCheckpoint) {
    if (!CHECKPOINT_NAMES.has(rawCheckpoint)) {
      return {
        error: `unknown checkpoint: ${rawCheckpoint}. Expected one of ${[...CHECKPOINT_NAMES].join(", ")}`,
      };
    }
    return { days, checkpoint: rawCheckpoint as JevCheckpointName };
  }
  return { days, checkpoint: null };
}

interface OutcomeRow {
  checkpoint: string;
  outcome: string;
  count: number;
}

interface LatencyRow {
  checkpoint: string;
  total: number;
  fallback_rate: number;
  p50: number | null;
  p95: number | null;
}

export interface JevCheckpointStats {
  checkpoint: string;
  total: number;
  outcomes: Record<string, number>;
  fallbackRate: number;
  latencyMs: { p50: number | null; p95: number | null };
}

/** Merges the outcome breakdown with the latency/fallback aggregates into
 * one per-checkpoint report, sorted by volume descending. */
export function mergeJevStats(
  outcomeRows: OutcomeRow[],
  latencyRows: LatencyRow[],
): JevCheckpointStats[] {
  const byCheckpoint = new Map<string, JevCheckpointStats>();
  for (const row of latencyRows) {
    byCheckpoint.set(row.checkpoint, {
      checkpoint: row.checkpoint,
      total: row.total,
      outcomes: {},
      fallbackRate: Math.round(row.fallback_rate * 10_000) / 10_000,
      latencyMs: {
        p50: row.p50 === null ? null : Math.round(row.p50),
        p95: row.p95 === null ? null : Math.round(row.p95),
      },
    });
  }
  for (const row of outcomeRows) {
    const entry = byCheckpoint.get(row.checkpoint) ?? {
      checkpoint: row.checkpoint,
      total: 0,
      outcomes: {},
      fallbackRate: 0,
      latencyMs: { p50: null, p95: null },
    };
    entry.outcomes[row.outcome] = row.count;
    if (!byCheckpoint.has(row.checkpoint)) byCheckpoint.set(row.checkpoint, entry);
  }
  return [...byCheckpoint.values()].sort((a, b) => b.total - a.total);
}

export async function queryJevStats(
  query: JevStatsQuery,
): Promise<JevCheckpointStats[]> {
  const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);
  const checkpoint = query.checkpoint;

  const outcomeRows = await prisma.$queryRawUnsafe<OutcomeRow[]>(
    `SELECT checkpoint, outcome, COUNT(*)::int AS count
     FROM jev_decisions
     WHERE created_at >= $1
       AND ($2::text IS NULL OR checkpoint = $2)
     GROUP BY checkpoint, outcome`,
    since,
    checkpoint,
  );

  const latencyRows = await prisma.$queryRawUnsafe<LatencyRow[]>(
    `SELECT checkpoint,
       COUNT(*)::int AS total,
       AVG(CASE WHEN fallback_used THEN 1.0 ELSE 0.0 END)::float AS fallback_rate,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::float AS p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::float AS p95
     FROM jev_decisions
     WHERE created_at >= $1
       AND ($2::text IS NULL OR checkpoint = $2)
     GROUP BY checkpoint`,
    since,
    checkpoint,
  );

  return mergeJevStats(outcomeRows, latencyRows);
}
