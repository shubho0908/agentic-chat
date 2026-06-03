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

const IMAGE_TOKEN_PRICING_BY_MODEL: ImageTokenPricing[] = [
  { pattern: /^gpt-5(?:[.-]|$)/i, baseTokens: 70, tileTokens: 140 },
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
