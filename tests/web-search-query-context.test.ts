import test from "node:test";
import assert from "node:assert/strict";

import {
  needsWebSearchConversationContext,
  stripSearchCommandPhrases,
} from "@/lib/tools/web-search/queryContext";

test("stripSearchCommandPhrases removes redundant search commands", () => {
  assert.equal(
    stripSearchCommandPhrases("Search for Donald Trump"),
    "Donald Trump",
  );
  assert.equal(
    stripSearchCommandPhrases("What he eats, search"),
    "What he eats",
  );
});

test("needsWebSearchConversationContext flags ambiguous follow-up phrasing", () => {
  assert.equal(
    needsWebSearchConversationContext("What he eats, search"),
    true,
  );
  assert.equal(
    needsWebSearchConversationContext("What about his diet"),
    true,
  );
});

test("needsWebSearchConversationContext ignores self-contained queries", () => {
  assert.equal(
    needsWebSearchConversationContext("What does Donald Trump eat"),
    false,
  );
  assert.equal(
    needsWebSearchConversationContext("Donald Trump diet and food preferences"),
    false,
  );
});
