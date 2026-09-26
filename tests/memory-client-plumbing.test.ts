import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("first-party send, edit, regenerate and continuation paths contain no memory toggle plumbing", () => {
  for (const path of [
    "hooks/useChat.ts",
    "hooks/chat/messageSender.ts",
    "hooks/chat/messageEditor.ts",
    "hooks/chat/messageRegenerator.ts",
    "hooks/chat/streamingHandler.ts",
    "hooks/chat/streamingApi.ts",
    "hooks/chat/useChatInputController.ts",
    "components/chat/chatInputForm.tsx",
    "components/chat/chatPageClient.tsx",
    "components/homeContent.tsx",
    "types/chat.ts",
  ]) {
    assert.doesNotMatch(
      read(path),
      /memoryEnabled|MemoryToggle|onMemoryToggle|getMemoryEnabled|setMemoryEnabled/,
      path,
    );
  }
});

test("server route alone preserves external-client false opt-out and owns kill switch", () => {
  const route = read("app/api/chat/completions/route.ts");
  assert.match(route, /parseOptionalBoolean\(\s*body\.memoryEnabled/);
  assert.match(route, /process\.env\.MEMORY_ENABLED\s*!==\s*[\"\']false[\"\']/);
});

test("toggle component and stale localStorage key are removed", () => {
  assert.doesNotMatch(
    read("lib/storage.ts"),
    /agentic-chat-memory-enabled|MEMORY_ENABLED/,
  );
  assert.doesNotMatch(
    read("components/chat/toolsMenu.tsx"),
    /MemoryToggle|memoryEnabled/,
  );
  assert.doesNotMatch(
    read("components/chat/toolsDrawer.tsx"),
    /MemoryToggle|memoryEnabled/,
  );
});
