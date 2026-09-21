/**
 * uploadthing@7 exposes `file.url` / `file.appUrl` as deprecated getters that
 * warn in favor of `file.ufsUrl`.
 *
 * All app code already reads `ufsUrl` only, but uploadthing's own internals
 * still read the deprecated getters while building the `UTApi.uploadFiles()`
 * result (see `uploadFile()` in `uploadthing/server`), so compliant callers
 * still see:
 *
 *   [uploadthing][deprecated] `file.url` is deprecated ... Use `file.ufsUrl`
 *   [uploadthing][deprecated] `file.appUrl` is deprecated ... Use `file.ufsUrl`
 *
 * This installs a one-time, narrowly-scoped `console.warn` filter that drops
 * exactly those two self-inflicted messages. Every other warning (including
 * any future uploadthing message that does not match) still passes through.
 *
 * Import for side effects from server modules that touch uploadthing
 * (`app/api/upload/core.ts`, `lib/pdf/store.ts`).
 */

const INSTALLED = Symbol.for("agentic-chat.suppressUploadthingDeprecationNoise");

const MATCHERS = [
  "[uploadthing][deprecated]",
  "`file.url`",
  "`file.appUrl`",
  "file.ufsUrl",
] as const;

function isUploadthingSelfDeprecation(args: unknown[]): boolean {
  if (args.length === 0) return false;
  const first = args[0];
  if (typeof first !== "string") return false;
  if (!first.includes("[uploadthing]") || !first.includes("deprecated")) return false;
  const mentionsDeprecatedAccessor =
    first.includes("`file.url`") || first.includes("`file.appUrl`");
  return mentionsDeprecatedAccessor && first.includes("file.ufsUrl");
}

function install(): void {
  const g = globalThis as Record<symbol, boolean | undefined>;
  if (g[INSTALLED]) return;
  g[INSTALLED] = true;

  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    if (isUploadthingSelfDeprecation(args)) return;
    (originalWarn as (...a: unknown[]) => void)(...args);
  };
}

install();

export { MATCHERS as uploadthingDeprecationMatchers };
