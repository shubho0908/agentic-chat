import test from "node:test";
import assert from "node:assert/strict";

import { shouldUseSemanticCache } from "@/hooks/chat/cacheHandler";
import { filterFiles } from "@/lib/fileValidation";
import { type Message, MessageRole } from "@/lib/schemas/chat";
import {
  estimateImageTokensForModel,
  estimatePatchImageTokensForDimensions,
} from "@/lib/utils/imageTokenCost";

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
  assert.equal(estimateImageTokensForModel("gpt-5.1"), 910);
  assert.equal(estimateImageTokensForModel("gpt-4.1"), 1105);
  // GPT-5.2+ point releases and the GPT-6 family are patch-budget sized, so
  // they use the documented 2,500-patch high budget × 1.2 = 3,000 tokens
  // instead of borrowing a tile rate.
  assert.equal(estimateImageTokensForModel("gpt-5.6-terra"), 3000);
  assert.equal(estimateImageTokensForModel("gpt-6-sol"), 3000);
  assert.equal(estimateImageTokensForModel("gpt-6-astra"), 3000);
  assert.equal(estimateImageTokensForModel("gpt-5-mini"), 3000);
  assert.equal(estimateImageTokensForModel("unknown-model"), 1105);
});

test("patch dimensions match the documented 32px patch examples", () => {
  // Examples from the vision guide for gpt-6-astra high (2,500 budget, 1.2x).
  assert.equal(estimatePatchImageTokensForDimensions(1024, 1024, "gpt-6-astra", "high"), 1229);
  assert.equal(estimatePatchImageTokensForDimensions(2048, 2048, "gpt-6-astra", "high"), 3000);
  assert.equal(estimatePatchImageTokensForDimensions(4096, 512, "gpt-6-astra", "high"), 2458);
  // auto/original preserve dimensions: 4000×3000 is 125×94 patches × 1.2.
  assert.equal(estimatePatchImageTokensForDimensions(4000, 3000, "gpt-6-astra", "auto"), 14100);
  // Over the 30,000-patch rejection limit.
  assert.equal(estimatePatchImageTokensForDimensions(10000, 10000, "gpt-6-astra", "auto"), null);
});
