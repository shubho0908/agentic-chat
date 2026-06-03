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

test("image token estimates follow model-family tile pricing", () => {
  assert.equal(estimateImageTokensForModel("gpt-5"), 910);
  assert.equal(estimateImageTokensForModel("gpt-5.5"), 910);
  assert.equal(estimateImageTokensForModel("gpt-4.1"), 1105);
  assert.equal(estimateImageTokensForModel("unknown-model"), 1105);
});
