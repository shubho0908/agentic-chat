export const SANDBOX_URL: string =
  process.env.NEXT_PUBLIC_SANDBOX_URL || "/sandbox.html";

export const SANDBOX_ATTR = "allow-scripts";

export function getSandboxTargetOrigin(): string {
  return "*";
}

export const SANDBOX_VALID_ORIGINS: ReadonlySet<string> = new Set(["null"]);
