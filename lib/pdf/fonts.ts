import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PdfFontFamily = {
  BODY: "PdfInter",
  MONO: "PdfJetBrainsMono",
  DEVANAGARI: "PdfNotoSansDevanagari",
} as const;

type PdfFontFamilyValue = (typeof PdfFontFamily)[keyof typeof PdfFontFamily];

interface PdfFontFace {
  src: string;
  fontWeight: number;
  fontStyle?: "normal" | "italic";
}

const FONT_FILES: Record<PdfFontFamilyValue, Array<{ file: string; fontWeight: number; fontStyle?: "normal" | "italic" }>> = {
  [PdfFontFamily.BODY]: [
    { file: "Inter-Regular.ttf", fontWeight: 400 },
    { file: "Inter-Medium.ttf", fontWeight: 500 },
    { file: "Inter-SemiBold.ttf", fontWeight: 600 },
    { file: "Inter-Bold.ttf", fontWeight: 700 },
    { file: "Inter-Italic.ttf", fontWeight: 400, fontStyle: "italic" },
  ],
  [PdfFontFamily.MONO]: [
    { file: "JetBrainsMono-Regular.ttf", fontWeight: 400 },
    { file: "JetBrainsMono-SemiBold.ttf", fontWeight: 600 },
  ],
  [PdfFontFamily.DEVANAGARI]: [
    { file: "NotoSansDevanagari-Regular.ttf", fontWeight: 400 },
    { file: "NotoSansDevanagari-SemiBold.ttf", fontWeight: 600 },
  ],
};

/** React PDF throws when a family lacks the exact weight+style combination a
 * run requests, and most script fonts ship no italic cut at all. Alias the
 * upright face for every weight that has no real italic so any family -
 * including ones added later - degrades to upright rendering instead of
 * crashing the document. */
function withItalicFallbacks(faces: PdfFontFace[]): PdfFontFace[] {
  const italicWeights = new Set(
    faces.filter((face) => face.fontStyle === "italic").map((face) => face.fontWeight),
  );
  const aliases = faces
    .filter((face) => face.fontStyle !== "italic" && !italicWeights.has(face.fontWeight))
    .map((face) => ({ ...face, fontStyle: "italic" as const }));
  return [...faces, ...aliases];
}

let registered = false;

export async function ensurePdfFonts(fontDir = join(process.cwd(), "public", "fonts", "pdf")): Promise<void> {
  if (registered) return;

  const { Font } = await import("@react-pdf/renderer");
  const load = (file: string): string =>
    `data:font/ttf;base64,${readFileSync(join(fontDir, file)).toString("base64")}`;

  for (const family of Object.values(PdfFontFamily)) {
    const faces = FONT_FILES[family].map(({ file, fontWeight, fontStyle }) => ({
      src: load(file),
      fontWeight,
      ...(fontStyle ? { fontStyle } : {}),
    }));
    Font.register({ family, fonts: withItalicFallbacks(faces) });
  }

  registered = true;
}
