interface ImageTokenPricing {
  pattern: RegExp;
  baseTokens: number;
  tileTokens: number;
}

interface PatchImagePricing {
  pattern: RegExp;
  multiplier: number;
  patchBudget: number;
}

const DEFAULT_TILE_COUNT = 6;
const FALLBACK_IMAGE_TOKEN_PRICING: Omit<ImageTokenPricing, "pattern"> = {
  baseTokens: 85,
  tileTokens: 170,
};

/**
 * Conservative default for patch-budget families when image dimensions are
 * unknown (production callers only have a URL). Uses the documented 2,500
 * patch "high" budget × 1.2 multiplier = 3,000 tokens. Real auto/original
 * costs scale with dimensions (ceil(w/32)×ceil(h/32)×1.2, up to the 30,000
 * patch rejection limit ≈ 36k tokens), so this still undercounts very large
 * originals — callers with dimensions should use
 * estimatePatchImageTokensForDimensions instead.
 * Source: https://developers.openai.com/api/docs/guides/images-vision
 */
const DEFAULT_PATCH_BUDGET = 2500;
const DEFAULT_PATCH_MULTIPLIER = 1.2;

/**
 * Image token pricing for the families in OpenAI's base/tile table. Only
 * gpt-5 (base) and gpt-5.1 are tile-priced in the GPT-5 series — later point
 * releases (5.2, 5.4, 5.5, 5.6) and GPT-6 are patch-budget priced instead.
 * Source: https://developers.openai.com/api/docs/guides/images-vision
 */
const IMAGE_TOKEN_PRICING_BY_MODEL: ImageTokenPricing[] = [
  // gpt-5 base and gpt-5.1 are the tile rows (70/140, deprecated); every
  // other gpt-5.x point release is patch-budget sized.
  { pattern: /^gpt-5(?:\.1)?(?:[.-]|$)/i, baseTokens: 70, tileTokens: 140 },
  { pattern: /^gpt-4o-mini(?:[.-]|$)/i, baseTokens: 2833, tileTokens: 5667 },
  { pattern: /^gpt-4o(?:[.-]|$)/i, baseTokens: 85, tileTokens: 170 },
  { pattern: /^gpt-4\.1(?:[.-]|$)/i, baseTokens: 85, tileTokens: 170 },
  { pattern: /^gpt-4\.5(?:[.-]|$)/i, baseTokens: 85, tileTokens: 170 },
  { pattern: /^o(?:1|3)(?:[.-]|$)/i, baseTokens: 75, tileTokens: 150 },
];

/**
 * Patch-budget families (32px×32px patches × multiplier). Covers the current
 * catalog (GPT-6 Astra/Sol/Luna, GPT-5.6 Sol/Terra/Luna) plus other documented
 * patch families so they never borrow a tile rate.
 * Source: https://developers.openai.com/api/docs/guides/images-vision
 */
const PATCH_IMAGE_PRICING_BY_MODEL: PatchImagePricing[] = [
  { pattern: /^gpt-6(?:[.-]|$)/i, multiplier: 1.2, patchBudget: 2500 },
  // Any gpt-5.x point release beyond 5.1 (5.2, 5.4, 5.5, 5.6, future 5.x).
  { pattern: /^gpt-5\.(?:[2-9]|\d{2,})(?:[.-]|$)/i, multiplier: 1.2, patchBudget: 2500 },
  { pattern: /^gpt-5(?:-mini|-nano)(?:[.-]|$)/i, multiplier: 1.2, patchBudget: 2500 },
  { pattern: /^gpt-4\.1-mini(?:[.-]|$)/i, multiplier: 1.62, patchBudget: 6144 },
  { pattern: /^o4-mini(?:[.-]|$)/i, multiplier: 1.72, patchBudget: 6144 },
];

/**
 * Exact patch cost when dimensions are known: patches to cover the image
 * after sizing, × multiplier, rounded up. `detail` follows the model sizing
 * table: high applies the resizing patch budget, low fits within 512×512
 * (GPT-6/5.6 behavior), auto/original preserve dimensions (65,535px limit)
 * with no patch budget. Returns null when the 30,000-patch rejection limit
 * is exceeded or dimensions are invalid.
 */
export function estimatePatchImageTokensForDimensions(
  width: number,
  height: number,
  model: string,
  detail: "low" | "high" | "original" | "auto" = "high",
): number | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  const patch =
    PATCH_IMAGE_PRICING_BY_MODEL.find(({ pattern }) => pattern.test(model)) ?? {
      multiplier: DEFAULT_PATCH_MULTIPLIER,
      patchBudget: DEFAULT_PATCH_BUDGET,
    };
  let sizedWidth = width;
  let sizedHeight = height;
  // Pixel-dimension caps from the sizing table.
  const maxDim = 65535;
  const dimScale = Math.min(1, maxDim / Math.max(sizedWidth, sizedHeight));
  sizedWidth *= dimScale;
  sizedHeight *= dimScale;

  if (detail === "low") {
    const lowScale = Math.min(1, 512 / Math.max(sizedWidth, sizedHeight));
    sizedWidth *= lowScale;
    sizedHeight *= lowScale;
  }

  const rawPatches =
    Math.ceil(sizedWidth / 32) * Math.ceil(sizedHeight / 32);
  let patches = rawPatches;
  // High (and low, after the 512 fit) respect the resizing patch budget;
  // auto/original preserve dimensions and only enforce the rejection limit.
  if (detail === "high" || detail === "low") {
    if (rawPatches > patch.patchBudget) {
      const scale = Math.sqrt(
        (32 * 32 * patch.patchBudget) / (sizedWidth * sizedHeight),
      );
      const resizedWidth = Math.max(1, Math.floor(sizedWidth * scale));
      const resizedHeight = Math.max(1, Math.floor(sizedHeight * scale));
      patches = Math.ceil(resizedWidth / 32) * Math.ceil(resizedHeight / 32);
    }
  }
  if (patches > 30000) return null;
  return Math.ceil(patches * patch.multiplier);
}

export function estimateImageTokensForModel(
  model: string,
  tileCount: number = DEFAULT_TILE_COUNT,
): number {
  // Check patch families first so specific patch variants (gpt-4.1-mini,
  // gpt-5-mini) win over broader tile prefixes (gpt-4.1, gpt-5).
  const patchPricing = PATCH_IMAGE_PRICING_BY_MODEL.find(({ pattern }) =>
    pattern.test(model),
  );
  if (patchPricing) {
    // No dimensions available at call sites (URL only) — use the documented
    // resizing budget as a conservative default instead of a tile fallback.
    return Math.ceil(patchPricing.patchBudget * patchPricing.multiplier);
  }

  const tilePricing = IMAGE_TOKEN_PRICING_BY_MODEL.find(({ pattern }) =>
    pattern.test(model),
  );
  if (tilePricing) {
    const safeTileCount = Math.max(1, Math.ceil(tileCount));
    return tilePricing.baseTokens + safeTileCount * tilePricing.tileTokens;
  }

  const safeTileCount = Math.max(1, Math.ceil(tileCount));

  return (
    FALLBACK_IMAGE_TOKEN_PRICING.baseTokens +
    safeTileCount * FALLBACK_IMAGE_TOKEN_PRICING.tileTokens
  );
}
