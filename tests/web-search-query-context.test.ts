import test from "node:test";
import assert from "node:assert/strict";

import {
  needsWebSearchConversationContext,
  prepareWebSearchQuery,
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

test("stripSearchCommandPhrases handles edge cases", () => {
  assert.equal(stripSearchCommandPhrases(""), "");
  assert.equal(stripSearchCommandPhrases("search"), "");
  assert.equal(
    stripSearchCommandPhrases("search for search results"),
    "search results",
  );
  assert.equal(
    stripSearchCommandPhrases("SEARCH for React hooks"),
    "React hooks",
  );
});

test("prepareWebSearchQuery strips explicit URLs from search terms", () => {
  assert.deepEqual(
    prepareWebSearchQuery(
      "who is shubhojeet bera? his website: https://shubhojeet.com"
    ),
    {
      originalQuery:
        "who is shubhojeet bera? his website: https://shubhojeet.com",
      searchQuery: "who is shubhojeet bera?",
      explicitUrls: ["https://shubhojeet.com"],
    },
  );
});

test("prepareWebSearchQuery falls back to the domain when only a URL is provided", () => {
  assert.deepEqual(
    prepareWebSearchQuery("https://shubhojeet.com"),
    {
      originalQuery: "https://shubhojeet.com",
      searchQuery: "shubhojeet",
      explicitUrls: ["https://shubhojeet.com"],
    },
  );
});

test("prepareWebSearchQuery preserves non-url website terms", () => {
  assert.deepEqual(
    prepareWebSearchQuery("website performance best practices"),
    {
      originalQuery: "website performance best practices",
      searchQuery: "website performance best practices",
      explicitUrls: [],
    },
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
