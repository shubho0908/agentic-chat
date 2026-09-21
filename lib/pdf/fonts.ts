import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PdfFontFamily = {
  BODY: "PdfInter",
  MONO: "PdfJetBrainsMono",
  DEVANAGARI: "PdfNotoSansDevanagari",
} as const;

let registered = false;

export async function ensurePdfFonts(fontDir = join(process.cwd(), "public", "fonts", "pdf")): Promise<void> {
  if (registered) return;

  const { Font } = await import("@react-pdf/renderer");
  const load = (file: string): string =>
    `data:font/ttf;base64,${readFileSync(join(fontDir, file)).toString("base64")}`;

  Font.register({
    family: PdfFontFamily.BODY,
    fonts: [
      { src: load("Inter-Regular.ttf"), fontWeight: 400 },
      { src: load("Inter-Medium.ttf"), fontWeight: 500 },
      { src: load("Inter-SemiBold.ttf"), fontWeight: 600 },
      { src: load("Inter-Bold.ttf"), fontWeight: 700 },
      { src: load("Inter-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
    ],
  });

  Font.register({
    family: PdfFontFamily.MONO,
    fonts: [
      { src: load("JetBrainsMono-Regular.ttf"), fontWeight: 400 },
      { src: load("JetBrainsMono-SemiBold.ttf"), fontWeight: 600 },
    ],
  });

  Font.register({
    family: PdfFontFamily.DEVANAGARI,
    fonts: [
      { src: load("NotoSansDevanagari-Regular.ttf"), fontWeight: 400 },
      { src: load("NotoSansDevanagari-SemiBold.ttf"), fontWeight: 600 },
    ],
  });

  registered = true;
}
