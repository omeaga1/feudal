import bundled from "../data/generated/build-watch.json";
import type { FetchFn } from "./aoe4world";

// The build-watch job checks every game plan against the newest game build
// and lists fresh guides on aoe4guides.com. It commits the report to the repo
// daily, so the app reads it from main and falls back to the bundled copy.

export interface FreshGuide {
  title: string;
  author: string;
  url: string;
  video?: string;
  updated: string;
}

export interface CivWatch {
  checkedBuild: number;
  stale: boolean;
  fresh: FreshGuide[];
}

export interface BuildWatch {
  latestBuild: number | null;
  checkedAt: string | null;
  civs: Record<string, CivWatch>;
}

export const BUILD_WATCH_URL = "https://raw.githubusercontent.com/omeaga1/feudal/main/src/data/generated/build-watch.json";

export const bundledBuildWatch = bundled as BuildWatch;

function isBuildWatch(value: unknown): value is BuildWatch {
  const v = value as BuildWatch;
  return !!v && typeof v.civs === "object" && v.civs !== null;
}

export async function loadBuildWatch(fetchFn: FetchFn): Promise<BuildWatch> {
  try {
    const res = await fetchFn(BUILD_WATCH_URL);
    if (res.ok) {
      const json: unknown = await res.json();
      if (isBuildWatch(json) && (json.checkedAt ?? "") >= (bundledBuildWatch.checkedAt ?? "")) return json;
    }
  } catch {
    // Offline or blocked; the bundled copy is fine.
  }
  return bundledBuildWatch;
}

/**
 * Whether a plan is older than the game: the build being played when we know
 * it, otherwise the newest build the watcher has seen.
 */
export function planIsStale(checkedBuild: number, watch: BuildWatch, gameBuild?: number): boolean {
  const current = gameBuild ?? watch.latestBuild;
  return !!current && current > checkedBuild;
}
