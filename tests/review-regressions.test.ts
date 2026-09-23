import test from "node:test";
import assert from "node:assert/strict";

import { shouldUseSemanticCache } from "@/hooks/chat/cacheHandler";
import { filterFiles } from "@/lib/fileValidation";
import { type Message, MessageRole } from "@/lib/schemas/chat";
import { estimateImageTokensForModel } from "@/lib/utils/imageTokenCost";

test("semantic cache is bypassed when prior messages only store image attachments", () => {
  const messages: Message[] = [
    {
      id: "user-image",
      role: MessageRole.USER,
      content: "Use this uploaded product image later",
      attachments: [
        {
          id: "attachment-image",
          fileUrl: "https://utfs.io/f/product.png",
          fileName: "product.png",
          fileType: "image/png",
          fileSize: 42_000,
        },
      ],
    },
  ];

  assert.equal(shouldUseSemanticCache(messages), false);
});

test("file filtering treats known unsupported vision extensions as unsupported images", () => {
  const svgWithGenericMime = new File(["<svg />"], "diagram.svg", {
    type: "application/octet-stream",
  });
  const bmpWithMissingMime = new File(["BM"], "scan.bmp", { type: "" });

  const result = filterFiles([svgWithGenericMime, bmpWithMissingMime]);

  assert.deepEqual(
    result.unsupportedImages.map((file) => file.name),
    ["diagram.svg", "scan.bmp"],
  );
  assert.deepEqual(result.unsupportedFiles, []);
  assert.deepEqual(result.validImages, []);
});

test("image token estimates follow the documented vision sizing families", () => {
  // Base/tile table families: 70 base tokens + 6 default tiles at 140.
  assert.equal(estimateImageTokensForModel("gpt-5"), 910);
  assert.equal(estimateImageTokensForModel("gpt-4.1"), 1105);
  // GPT-5.x point releases and the GPT-6 family are patch-budget sized (2,500
  // patches at "high" detail, 30,000-patch rejection limit), so the tile
  // estimator falls back instead of borrowing a tile rate.
  assert.equal(estimateImageTokensForModel("gpt-5.6-terra"), 1105);
  assert.equal(estimateImageTokensForModel("gpt-6-sol"), 1105);
  assert.equal(estimateImageTokensForModel("gpt-6-astra"), 1105);
  assert.equal(estimateImageTokensForModel("unknown-model"), 1105);
});
