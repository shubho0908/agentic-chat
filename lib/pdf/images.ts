import { safeFetch } from "@/lib/network/safeFetch";
import { logger } from "@/lib/logger";
import { PdfLimits } from "./document";
import { readRasterSize, type RasterSize } from "./imageSize";

export type PdfImageAsset =
  | { ok: true; dataUri: string; size: RasterSize | null }
  | { ok: false; reason: string };

const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const IMAGE_TIMEOUT_MS = 10_000;
const IMAGE_CONCURRENCY = 3;

async function fetchOne(url: string, signal?: AbortSignal): Promise<PdfImageAsset> {
  try {
    const response = await safeFetch(url, {
      timeoutMs: IMAGE_TIMEOUT_MS,
      retries: 1,
      maxResponseBytes: PdfLimits.IMAGE_BYTES,
      signal,
    });
    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }
    const mimeType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      return { ok: false, reason: mimeType ? `unsupported type ${mimeType}` : "not an image" };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) {
      return { ok: false, reason: "empty response" };
    }
    const size = readRasterSize(bytes, mimeType);
    return { ok: true, dataUri: `data:${mimeType};base64,${bytes.toString("base64")}`, size };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn("[PDF] Image fetch failed", { url, reason });
    return { ok: false, reason };
  }
}

export async function prefetchPdfImages(
  urls: string[],
  signal?: AbortSignal,
): Promise<Map<string, PdfImageAsset>> {
  const assets = new Map<string, PdfImageAsset>();
  for (let index = 0; index < urls.length; index += IMAGE_CONCURRENCY) {
    const batch = urls.slice(index, index + IMAGE_CONCURRENCY);
    const results = await Promise.all(batch.map((url) => fetchOne(url, signal)));
    batch.forEach((url, batchIndex) => {
      assets.set(url, results[batchIndex]);
    });
  }
  return assets;
}
