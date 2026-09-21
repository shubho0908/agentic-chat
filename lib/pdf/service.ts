import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error pdf-parse v1 has no type declarations
import pdf from "pdf-parse/lib/pdf-parse.js";
import { logger } from "@/lib/logger";
import { normalizePdfDocument, extractImageUrls } from "./normalize";
import { prefetchPdfImages } from "./images";
import { renderPdfDocument } from "./render";
import { storePdf, type StoredPdf } from "./store";

export interface GeneratedPdf {
  url: string;
  name: string;
  size: number;
  pageCount: number;
  title: string;
}

export type GeneratePdfResult =
  | { ok: true; pdf: GeneratedPdf }
  | { ok: false; error: string };

export interface GeneratePdfOptions {
  signal?: AbortSignal;
  generatedAt?: Date;
  store?: (buffer: Buffer, fileName: string) => Promise<StoredPdf>;
}

const FILENAME_MAX_CHARS = 80;
const PDF_RENDER_TIMEOUT_MS = 60_000;

export function slugifyPdfFileName(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, FILENAME_MAX_CHARS)
    .replace(/^-+|-+$/g, "");
  const stamp = Date.now().toString(36);
  return `${slug || "document"}-${stamp}.pdf`;
}

let cachedLogoDataUri: string | undefined;

function loadLogoDataUri(): string | undefined {
  if (cachedLogoDataUri !== undefined) return cachedLogoDataUri || undefined;
  try {
    const bytes = readFileSync(join(process.cwd(), "public", "logo.png"));
    cachedLogoDataUri = `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    cachedLogoDataUri = "";
  }
  return cachedLogoDataUri || undefined;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("PDF generation was cancelled"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export async function generateAndStorePdf(
  rawInput: unknown,
  options: GeneratePdfOptions = {},
): Promise<GeneratePdfResult> {
  const normalized = normalizePdfDocument(rawInput);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  const { document } = normalized;

  try {
    const imageUrls = extractImageUrls(document);
    const images = await prefetchPdfImages(imageUrls, options.signal);

    const buffer = await withTimeout(
      renderPdfDocument(document, {
        images,
        generatedAt: options.generatedAt ?? new Date(),
        logoDataUri: loadLogoDataUri(),
      }),
      PDF_RENDER_TIMEOUT_MS,
      "PDF rendering",
      options.signal,
    );

    let pageCount = 0;
    try {
      const parsed = await pdf(buffer);
      pageCount = typeof parsed?.numpages === "number" ? parsed.numpages : 0;
    } catch (error) {
      logger.warn("[PDF] Page count extraction failed:", error);
    }

    const storeFn = options.store ?? storePdf;
    const stored = await storeFn(buffer, slugifyPdfFileName(document.title));

    return {
      ok: true,
      pdf: {
        url: stored.url,
        name: stored.name,
        size: stored.size,
        pageCount,
        title: document.title,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("[PDF] Generation failed:", error);
    return { ok: false, error: message };
  }
}
