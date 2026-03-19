import test from "node:test";
import assert from "node:assert/strict";

import { getActiveTool, setActiveTool, removeActiveTool } from "@/lib/storage";
import { parseToolId, TOOL_IDS, type ToolId } from "@/lib/tools/config";

class LocalStorageMock {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key) ?? null : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

const localStorageMock = new LocalStorageMock();
const originalLocalStorage = globalThis.localStorage;

test.before(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorageMock,
  });
});

test.after(() => {
  if (originalLocalStorage === undefined) {
    // Match the pre-test environment when localStorage is absent.
    delete (globalThis as { localStorage?: Storage }).localStorage;
    return;
  }

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: originalLocalStorage,
  });
});

test.beforeEach(() => {
  localStorageMock.clear();
});

test("parseToolId only accepts supported tool ids", () => {
  assert.equal(parseToolId(TOOL_IDS.WEB_SEARCH), TOOL_IDS.WEB_SEARCH);
  assert.equal(parseToolId(TOOL_IDS.DEEP_RESEARCH), TOOL_IDS.DEEP_RESEARCH);
  assert.equal(parseToolId("youtube"), null);
  assert.equal(parseToolId(null), null);
});

test("getActiveTool returns valid stored tool ids", () => {
  localStorage.setItem("agentic-chat-active-tool", TOOL_IDS.GOOGLE_SUITE);

  assert.equal(getActiveTool(), TOOL_IDS.GOOGLE_SUITE);
  assert.equal(localStorage.getItem("agentic-chat-active-tool"), TOOL_IDS.GOOGLE_SUITE);
});

test("getActiveTool purges legacy invalid stored tool ids", () => {
  localStorage.setItem("agentic-chat-active-tool", "youtube");

  assert.equal(getActiveTool(), null);
  assert.equal(localStorage.getItem("agentic-chat-active-tool"), null);
});

test("getActiveTool removes empty-string values from storage", () => {
  localStorage.setItem("agentic-chat-active-tool", "");

  assert.equal(getActiveTool(), null);
  assert.equal(localStorage.getItem("agentic-chat-active-tool"), null);
});

test("setActiveTool persists valid ids and rejects invalid ids at runtime", () => {
  assert.equal(setActiveTool(TOOL_IDS.WEB_SEARCH), true);
  assert.equal(getActiveTool(), TOOL_IDS.WEB_SEARCH);

  assert.equal(setActiveTool("youtube" as unknown as ToolId), false);
  assert.equal(localStorage.getItem("agentic-chat-active-tool"), null);

  setActiveTool(TOOL_IDS.DEEP_RESEARCH);
  removeActiveTool();
  assert.equal(localStorage.getItem("agentic-chat-active-tool"), null);
});
