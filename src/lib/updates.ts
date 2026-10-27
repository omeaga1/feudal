import type { FetchFn } from "./aoe4world";

export const RELEASES_API = "https://api.github.com/repos/omeaga1/feudal/releases/latest";

export interface Release {
  version: string;
  url: string;
}

/** Compares dotted versions like "0.10.2" and "0.9.0". Positive when a is newer. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, "").split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** The newest published release when it's newer than `current`, else null. Never throws. */
export async function checkForUpdate(fetchFn: FetchFn, current: string): Promise<Release | null> {
  try {
    const res = await fetchFn(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const body = (await res.json()) as { tag_name?: string; html_url?: string };
    if (!body.tag_name || !body.html_url) return null;
    return compareVersions(body.tag_name, current) > 0 ? { version: body.tag_name.replace(/^v/, ""), url: body.html_url } : null;
  } catch {
    return null;
  }
}
