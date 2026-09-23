interface ImageTokenPricing {
  pattern: RegExp;
  baseTokens: number;
  tileTokens: number;
}

const DEFAULT_TILE_COUNT = 6;
const FALLBACK_IMAGE_TOKEN_PRICING: Omit<ImageTokenPricing, "pattern"> = {
  baseTokens: 85,
  tileTokens: 170,
};

/**
 * Image token pricing for the families in OpenAI's base/tile table. Newer
 * families are patch-budget priced rather than tile priced — the model sizing
 * table documents 2,500 patches at "high" detail and a 30,000-patch rejection
 * limit for the GPT-5.6 and GPT-6 families — so they fall through to
 * FALLBACK_IMAGE_TOKEN_PRICING instead of borrowing a tile rate.
 * Source: https://developers.openai.com/api/docs/guides/images-vision
 */
const IMAGE_TOKEN_PRICING_BY_MODEL: ImageTokenPricing[] = [
  // gpt-5 is the newest base/tile row published for the GPT-5 series (it is
  // marked deprecated); GPT-5.x point releases are patch-budget sized instead.
  { pattern: /^gpt-5(?!\.\d)/i, baseTokens: 70, tileTokens: 140 },
  { pattern: /^gpt-4o-mini(?:[.-]|$)/i, baseTokens: 2833, tileTokens: 5667 },
  { pattern: /^gpt-4o(?:[.-]|$)/i, baseTokens: 85, tileTokens: 170 },
  { pattern: /^gpt-4\.1(?:[.-]|$)/i, baseTokens: 85, tileTokens: 170 },
  { pattern: /^gpt-4\.5(?:[.-]|$)/i, baseTokens: 85, tileTokens: 170 },
  { pattern: /^o(?:1|3)(?:[.-]|$)/i, baseTokens: 75, tileTokens: 150 },
];

export function estimateImageTokensForModel(
  model: string,
  tileCount: number = DEFAULT_TILE_COUNT,
): number {
  const pricing =
    IMAGE_TOKEN_PRICING_BY_MODEL.find(({ pattern }) => pattern.test(model)) ??
    FALLBACK_IMAGE_TOKEN_PRICING;
  const safeTileCount = Math.max(1, Math.ceil(tileCount));

  return pricing.baseTokens + safeTileCount * pricing.tileTokens;
}
