import { readFile } from "node:fs/promises";
import {
  evaluateRetrieval,
  type LabeledQuery,
  type RankedQueryResult,
} from "../lib/rag/evaluation";
async function main() {
  const file = process.argv[2] ?? "eval/rag-fixtures.json";
  const fixture = JSON.parse(await readFile(file, "utf8")) as {
    labels: LabeledQuery[];
    results: RankedQueryResult[];
  };
  console.log(
    JSON.stringify(evaluateRetrieval(fixture.labels, fixture.results), null, 2),
  );
}
void main();
