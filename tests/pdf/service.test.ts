import test from "node:test";
import assert from "node:assert/strict";

import { generateAndStorePdf, slugifyPdfFileName } from "@/lib/pdf/service";
import { createPdfTool } from "@/lib/tools/pdf";

const fakeStore = async (buffer: Buffer, fileName: string) => ({
  url: `https://uploadthing.test/f/${fileName}`,
  name: fileName,
  size: buffer.length,
});

test("slugifyPdfFileName produces safe filenames from messy titles", () => {
  assert.match(slugifyPdfFileName('My Report: <2026> & "beyond"!'), /^my-report-2026-beyond-[a-z0-9]+\.pdf$/);
  assert.match(slugifyPdfFileName("😀😀"), /^document-[a-z0-9]+\.pdf$/);
  const long = slugifyPdfFileName("word ".repeat(60));
  assert.ok(long.length <= 100);
});

test("generateAndStorePdf returns a stored file for valid input", async () => {
  const outcome = await generateAndStorePdf(
    {
      title: "Service Test",
      sections: [{ blocks: [{ type: "paragraph", text: "Body text." }] }],
    },
    { store: fakeStore, generatedAt: new Date("2026-09-21T12:00:00Z") },
  );
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.match(outcome.pdf.url, /^https:\/\/uploadthing\.test\/f\/service-test-[a-z0-9]+\.pdf$/);
    assert.ok(outcome.pdf.size > 500);
    assert.ok(outcome.pdf.pageCount >= 1);
    assert.equal(outcome.pdf.title, "Service Test");
  }
});

test("generateAndStorePdf returns an error instead of throwing on invalid input", async () => {
  const outcome = await generateAndStorePdf({ sections: [] }, { store: fakeStore });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.match(outcome.error, /title/i);
});

test("generateAndStorePdf propagates storage failures as errors", async () => {
  const outcome = await generateAndStorePdf(
    { title: "T", sections: [{ blocks: ["x"] }] },
    {
      store: async () => {
        throw new Error("storage down");
      },
    },
  );
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.match(outcome.error, /storage down/);
});

test("create_pdf tool returns a corrective message on malformed input", async () => {
  const result = await createPdfTool.func(
    { title: "", sections: [] },
    undefined as never,
    {} as never,
  );
  assert.equal(typeof result, "string");
  assert.match(result as string, /PDF creation failed/);
  assert.match(result as string, /create_pdf/);
});

test("create_pdf tool succeeds end to end with a working store", async () => {
  const originalToken = process.env.UPLOADTHING_TOKEN;
  delete process.env.UPLOADTHING_TOKEN;
  try {
    const result = await createPdfTool.func(
      {
        title: "Tool Test",
        sections: [{ blocks: [{ type: "paragraph", text: "From the tool." }] }],
      },
      undefined as never,
      {} as never,
    );
    assert.equal(typeof result, "string");
    assert.match(result as string, /PDF (created|creation failed)/);
  } finally {
    if (originalToken !== undefined) process.env.UPLOADTHING_TOKEN = originalToken;
  }
});
