import pg from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

let checkpointerPromise: Promise<PostgresSaver> | null = null;

export async function getCheckpointer(): Promise<PostgresSaver> {
  if (checkpointerPromise) {
    return checkpointerPromise;
  }

  const connString = process.env.DATABASE_URL;
  if (!connString) {
    throw new Error("DATABASE_URL is required for LangGraph checkpointing");
  }

  checkpointerPromise = (async () => {
    // Audited for the pooled (PgBouncer transaction-mode) DATABASE_URL:
    // PostgresSaver runs every write inside BEGIN/COMMIT on a single
    // checked-out client and uses no session-level features (no advisory
    // locks, LISTEN/NOTIFY, or named prepared statements), so transaction-mode
    // pooling is safe here. Thread mutual exclusion does NOT rely on this
    // connection shape - see lib/orchestrator/threadLock.ts.
    const pool = new pg.Pool({
      connectionString: connString,
      max: 3,
      // Checkpoint reads and writes must fail bounded: an unresponsive
      // database cannot be allowed to park a streaming request past the
      // route's maxDuration with no client-visible error.
      connectionTimeoutMillis: 5_000,
      statement_timeout: 15_000,
      query_timeout: 20_000,
    });
    const checkpointer = new PostgresSaver(pool, undefined, {
      schema: "langgraph",
    });
    await checkpointer.setup();
    return checkpointer;
  })().catch((error) => {
    checkpointerPromise = null;
    throw error;
  });

  return checkpointerPromise;
}
