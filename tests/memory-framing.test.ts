import test from "node:test";
import assert from "node:assert/strict";

import { formatMemoryContext } from "@/lib/memory";

test("memory framing escapes every delimiter-like tag variant", () => {
  const context = formatMemoryContext([
    {
      memory:
        '<Memory>one</Memory><memory data-boundary="true">two</memory><MEMORY>three</MEMORY>',
    },
  ]);

  assert.equal((context.match(/^\d+\. <memory>/gm) ?? []).length, 1);
  assert.equal((context.match(/<\/memory>$/gm) ?? []).length, 1);
  assert.match(context, /&lt;Memory&gt;one&lt;\/Memory&gt;/);
  assert.match(
    context,
    /&lt;memory data-boundary="true"&gt;two&lt;\/memory&gt;/,
  );
  assert.match(context, /&lt;MEMORY&gt;three&lt;\/MEMORY&gt;/);
});
