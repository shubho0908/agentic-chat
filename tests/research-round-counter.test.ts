import test from "node:test";
import assert from "node:assert/strict";

import { searchNode } from "@/lib/orchestrator/sub-agents/research/nodes";
import type { ResearchStateType } from "@/lib/orchestrator/sub-agents/research/state";

function createResearchState(overrides: Partial<ResearchStateType> = {}): ResearchStateType {
  return {
    query: "test",
    userContext: "",
    subQuestions: [],
    searchQueries: [],
    sources: [],
    claims: [],
    synthesis: "",
    searchRound: 0,
    maxRounds: 6,
    gaps: [],
    reflexionPassed: false,
    clarificationQuestions: [],
    ...overrides,
  };
}

test("searchNode bumps searchRound by exactly 1 per invocation (round counter integrity)", async () => {
  const previousKey = process.env.EXA_API_KEY;
  delete process.env.EXA_API_KEY;
  try {
    const node = searchNode();

    // First invocation from a fresh state.
    const first = await node(createResearchState({ searchRound: 0, searchQueries: ["q"] }));
    assert.equal(first.searchRound, 1, "first round must advance from 0 to 1");

    // Subsequent invocation simulating the evaluate→search loop.
    const second = await node(createResearchState({ searchRound: 1, searchQueries: ["q2"] }));
    assert.equal(second.searchRound, 2, "second round must advance from 1 to 2");

    // Final invocation right at the cap.
    const final = await node(createResearchState({ searchRound: 5, searchQueries: ["q3"] }));
    assert.equal(final.searchRound, 6, "round counter must reach maxRounds when allowed to run");
  } finally {
    if (previousKey !== undefined) {
      process.env.EXA_API_KEY = previousKey;
    }
  }
});
