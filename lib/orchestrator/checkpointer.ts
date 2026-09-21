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
    const pool = new pg.Pool({ connectionString: connString, max: 3 });
    const checkpointer = new PostgresSaver(pool, undefined, { schema: "langgraph" });
    await checkpointer.setup();
    return checkpointer;
  })().catch((error) => {
    checkpointerPromise = null;
    throw error;
  });

  return checkpointerPromise;
}
