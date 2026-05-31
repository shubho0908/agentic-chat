import type { JsonValue } from "@/lib/schemas/chat";

const MAX_JSON_DEPTH = 20;

function formatFunction(value: { readonly name?: string }): string {
  return `[Function${value.name ? `: ${value.name}` : ""}]`;
}

function convertToJsonValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number
): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === "bigint" || typeof value === "symbol") {
    return String(value);
  }

  if (typeof value === "function") {
    return formatFunction(value);
  }

  if (depth >= MAX_JSON_DEPTH) {
    return "[Max depth exceeded]";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack ? { stack: value.stack } : {}),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => convertToJsonValue(item, seen, depth + 1) ?? null);
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    const record: Record<string, JsonValue> = {};

    for (const [key, entryValue] of Object.entries(value)) {
      const converted = convertToJsonValue(entryValue, seen, depth + 1);
      if (converted !== undefined) {
        record[key] = converted;
      }
    }

    seen.delete(value);
    return record;
  }

  return String(value);
}

export function toJsonValue(value: unknown): JsonValue | undefined {
  return convertToJsonValue(value, new WeakSet<object>(), 0);
}
