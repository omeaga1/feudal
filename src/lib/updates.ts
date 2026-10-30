import type { FetchFn } from "./aoe4world";

export const RELEASES_API = "https://api.github.com/repos/omeaga1/feudal/releases/latest";

export interface Release {
  version: string;
  url: string;
  /** The Windows installer and its SHA-256 digest, when the release has one, for installing in place. */
  installer?: { url: string; sha256: string };
}

interface ReleaseAsset {
  name?: string;
  browser_download_url?: string;
  digest?: string | null;
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
    const body = (await res.json()) as { tag_name?: string; html_url?: string; assets?: ReleaseAsset[] };
    if (!body.tag_name || !body.html_url) return null;
    if (compareVersions(body.tag_name, current) <= 0) return null;
    const release: Release = { version: body.tag_name.replace(/^v/, ""), url: body.html_url };
    const setup = body.assets?.find((a) => a.name?.endsWith("-setup.exe") && a.browser_download_url && a.digest?.startsWith("sha256:"));
    if (setup) release.installer = { url: setup.browser_download_url!, sha256: setup.digest! };
    return release;
  } catch {
    return null;
  }
}

export type InstallPhase = "idle" | "installing" | "failed";

/**
 * What the update notice shows. Feudal never installs on its own: it offers
 * the update and installs only when the player clicks. During a game the
 * offer waits ("after this game") so nothing pops up or relaunches mid-match.
 */
export type UpdateStage =
  | { kind: "none" }
  | { kind: "after-game"; release: Release }
  | { kind: "ready"; release: Release }
  | { kind: "installing"; release: Release }
  | { kind: "download"; release: Release };

export function updateStage(release: Release | null, opts: { desktop: boolean; inGame: boolean; phase: InstallPhase }): UpdateStage {
  if (!release) return { kind: "none" };
  if (opts.phase === "installing") return { kind: "installing", release };
  // Outside the desktop app, without a checked installer, or after a failed
  // install, the player gets the release page instead.
  if (!opts.desktop || !release.installer || opts.phase === "failed") return { kind: "download", release };
  if (opts.inGame) return { kind: "after-game", release };
  return { kind: "ready", release };
}
