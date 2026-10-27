import mapsJson from "../data/maps.json";
import { API_BASE, USER_AGENT, type FetchFn } from "./aoe4world";

export interface MapInfo {
  name: string;
  features: string[];
  summary: string;
  tips: string[];
}

/** Hand-written notes per map, from the Age of Empires wiki's map pages. */
export const maps = mapsJson as MapInfo[];

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getMapInfo(name: string): MapInfo | undefined {
  const key = normalize(name);
  return maps.find((m) => normalize(m.name) === key);
}

export interface MapCivStat {
  civilization: string;
  win_rate: number;
  games_count: number;
}

export interface MapStats {
  map: string;
  games: number;
  durationMedian: number;
  civs: MapCivStat[];
}

interface MapListRow {
  map_id: number;
  map: string;
  games_count: number;
  duration_median: number;
}

async function getJson<T>(fetchFn: FetchFn, path: string): Promise<T> {
  const res = await fetchFn(`${API_BASE}${path}`, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`AoE4 World returned HTTP ${res.status} for ${path}`);
  return (await res.json()) as T;
}

/** Ranked 1v1 civ win rates on one map for the current patches, or null if AoE4 World has no stats for it. */
export async function fetchMapStats(fetchFn: FetchFn, mapName: string): Promise<MapStats | null> {
  const list = await getJson<{ data: MapListRow[] }>(fetchFn, "/stats/rm_solo/maps");
  const row = list.data.find((m) => normalize(m.map) === normalize(mapName));
  if (!row) return null;
  const detail = await getJson<{ data: MapCivStat[] }>(fetchFn, `/stats/rm_solo/maps/${row.map_id}`);
  return { map: row.map, games: row.games_count, durationMedian: row.duration_median, civs: detail.data };
}
