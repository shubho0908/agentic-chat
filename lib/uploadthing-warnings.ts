const INSTALLED = Symbol.for("agentic-chat.suppressUploadthingDeprecationNoise");


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
