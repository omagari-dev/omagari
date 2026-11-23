import { INSTALL_COMMAND } from "./install.ts";

/** The dist-tag members install (`omagari@next` until the first release, then `latest`), read from `INSTALL_COMMAND`. */
export const DIST_TAG = INSTALL_COMMAND.match(/omagari@([\w.-]+)/)?.[1] ?? "latest";

/**
 * The newest published version of `DIST_TAG`, read by the browser straight from npm (ADR-0061). npm answers with CORS open.
 * Undefined if npm can't be reached: then no card shows.
 */
export async function newestVersion(): Promise<string | undefined> {
  try {
    const response = await fetch(new URL(`https://registry.npmjs.org/omagari/${DIST_TAG}`));
    if (!response.ok) return undefined;
    const { version } = (await response.json()) as { version?: unknown };
    return typeof version === "string" ? version : undefined;
  } catch {
    return undefined;
  }
}

/** Splits `0.0.0-dev.57` into its core numbers and prerelease parts. */
const parts = (version: string) => {
  const [core = "", pre] = version.split("-", 2);
  return { core: core.split(".").map(Number), pre: pre?.split(".") };
};

/** `a` is older than `b`, in SemVer order (a prerelease is older than its release; `dev.9` is older than `dev.10`). */
export function older(a: string, b: string) {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.core[i] ?? 0) - (y.core[i] ?? 0);
    if (d) return d < 0;
  }
  if (!x.pre || !y.pre) return !!x.pre && !y.pre;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === q) continue;
    if (p === undefined) return true;
    if (q === undefined) return false;
    const [m, n] = [Number(p), Number(q)];
    if (Number.isInteger(m) && Number.isInteger(n)) return m < n;
    return p < q;
  }
  return false;
}

/** How a version shows on the card: `dev.57` for `0.0.0-dev.57`, a release as it is. */
export const shortVersion = (version: string) => version.replace(/^0\.0\.0-/, "");
