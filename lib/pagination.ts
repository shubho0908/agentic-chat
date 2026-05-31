import { VALIDATION_LIMITS } from '@/constants/validation';

export function parsePaginationInteger(
  value: string | null,
  defaultValue: number,
  options: { min?: number; max?: number } = {}
): number {
  const min = options.min ?? 1;
  const max = options.max ?? VALIDATION_LIMITS.PAGINATION_MAX_LIMIT;

  if (value === null || value.trim() === '') {
    return defaultValue;
  }

  if (!/^\d+$/.test(value)) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    return defaultValue;
  }

  return Math.min(max, Math.max(min, parsed));
}
