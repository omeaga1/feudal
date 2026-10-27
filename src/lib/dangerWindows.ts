import bundled from "../data/generated/danger-windows.json";
import type { FetchFn } from "./aoe4world";

/** Shape of src/data/generated/danger-windows.json, written by scripts/sync-danger-windows.mjs. */
export interface DangerData {
  updatedAt: string | null;
  lastUpdatedAt: string | null;
  /** Upper edges of the game-length buckets in seconds; the last bucket is open-ended. */
  bucketEdges: number[];
  /** Per game build: matchups[civ][other] = [wins, games] pairs per bucket, from `civ`'s side. */
  patches: Record<string, { games: number; matchups: Record<string, Record<string, number[]>> }>;
}

export type WindowKind = "danger" | "even" | "yours";

export interface LengthWindow {
  /** Seconds. */
  from: number;
  /** Seconds; null for the open-ended last bucket. */
  to: number | null;
  label: string;
  wins: number;
  games: number;
  /** Win rate pulled slightly toward the overall rate so tiny samples don't swing wildly. */
  winRate: number;
  kind: WindowKind;
  /** Too few games to read much into. */
  thin: boolean;
}

export interface DangerWindows {
  /** "matchup" when there are enough games for this exact pairing; else "civ" (everyone against the enemy civ). */
  basis: "matchup" | "civ";
  games: number;
  overallWinRate: number;
  windows: LengthWindow[];
  builds: number[];
  updatedAt: string | null;
}

export const DANGER_THRESHOLD = 0.45;
export const YOURS_THRESHOLD = 0.55;
const MIN_MATCHUP_GAMES = 150;
const THIN_BUCKET = 25;
// Weight, in games, of the prior that pulls each bucket toward the overall win rate.
const PRIOR_GAMES = 10;

export const DANGER_DATA_URL = "https://raw.githubusercontent.com/omeaga1/feudal/main/src/data/generated/danger-windows.json";

function minutes(seconds: number): number {
  return Math.round(seconds / 60);
}

function bucketLabel(from: number, to: number | null): string {
  if (from === 0 && to !== null) return `Under ${minutes(to)} min`;
  if (to === null) return `${minutes(from)}+ min`;
  return `${minutes(from)}–${minutes(to)} min`;
}

function addInto(total: number[], row: number[] | undefined) {
  if (!row) return;
  row.forEach((v, i) => (total[i] = (total[i] ?? 0) + v));
}

/** Sums [wins, games] pairs for one side of a pairing across every stored build. */
function matchupCounts(data: DangerData, civ: string, other: string): number[] {
  const total: number[] = [];
  for (const entry of Object.values(data.patches)) addInto(total, entry.matchups[civ]?.[other]);
  return total;
}

/** Everyone's results against `enemy`, from the side of the enemy's opponents. */
function againstCivCounts(data: DangerData, enemy: string): number[] {
  const total: number[] = [];
  for (const entry of Object.values(data.patches)) {
    for (const row of Object.values(entry.matchups[enemy] ?? {})) {
      // The enemy's wins are their opponents' losses.
      addInto(
        total,
        row.map((v, i) => (i % 2 === 0 ? row[i + 1] - v : v)),
      );
    }
  }
  return total;
}

function sumGames(counts: number[]): number {
  return counts.reduce((sum, v, i) => (i % 2 === 1 ? sum + v : sum), 0);
}

/** Win rate by game length for `myCiv` against `enemyCiv`, or null if there's no data yet. */
export function dangerWindows(myCiv: string, enemyCiv: string, data: DangerData = bundled as DangerData): DangerWindows | null {
  let counts = matchupCounts(data, myCiv, enemyCiv);
  let basis: DangerWindows["basis"] = "matchup";
  if (sumGames(counts) < MIN_MATCHUP_GAMES) {
    counts = againstCivCounts(data, enemyCiv);
    basis = "civ";
  }
  const games = sumGames(counts);
  if (games === 0) return null;
  const totalWins = counts.reduce((sum, v, i) => (i % 2 === 0 ? sum + v : sum), 0);
  const overallWinRate = totalWins / games;

  const edges = data.bucketEdges;
  const windows = Array.from({ length: edges.length + 1 }, (_, i): LengthWindow => {
    const from = i === 0 ? 0 : edges[i - 1];
    const to = i < edges.length ? edges[i] : null;
    const wins = counts[2 * i] ?? 0;
    const n = counts[2 * i + 1] ?? 0;
    const winRate = (wins + PRIOR_GAMES * overallWinRate) / (n + PRIOR_GAMES);
    const thin = n < THIN_BUCKET;
    const kind: WindowKind = thin ? "even" : winRate <= DANGER_THRESHOLD ? "danger" : winRate >= YOURS_THRESHOLD ? "yours" : "even";
    return { from, to, label: bucketLabel(from, to), wins, games: n, winRate, kind, thin };
  });

  return {
    basis,
    games,
    overallWinRate,
    windows,
    builds: Object.keys(data.patches).map(Number).sort((a, b) => b - a),
    updatedAt: data.updatedAt,
  };
}

/** One line for the brief: the worst stretch to be caught in, and the best. */
export function summarizeWindows(result: DangerWindows): string {
  const solid = result.windows.filter((w) => !w.thin);
  if (solid.length === 0) return "Not enough games yet to tell when this matchup swings.";
  const worst = solid.reduce((a, b) => (b.winRate < a.winRate ? b : a));
  const best = solid.reduce((a, b) => (b.winRate > a.winRate ? b : a));
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const parts: string[] = [];
  if (worst.kind === "danger") parts.push(`Games that end at ${worst.label.toLowerCase()} go their way: you win ${pct(worst.winRate)}.`);
  if (best.kind === "yours") parts.push(`Your window is ${best.label.toLowerCase()}, where you win ${pct(best.winRate)}.`);
  if (parts.length === 0) return "No stretch of the game clearly favors either side. Play your normal game.";
  return parts.join(" ");
}

function isDangerData(value: unknown): value is DangerData {
  const v = value as DangerData;
  return !!v && Array.isArray(v.bucketEdges) && typeof v.patches === "object" && v.patches !== null;
}

/**
 * The nightly job commits fresh numbers to the repo, so try those first and
 * fall back to the copy bundled with this build.
 */
export async function loadDangerData(fetchFn: FetchFn): Promise<DangerData> {
  try {
    const res = await fetchFn(DANGER_DATA_URL);
    if (res.ok) {
      const json: unknown = await res.json();
      if (isDangerData(json) && (json.updatedAt ?? "") >= ((bundled as DangerData).updatedAt ?? "")) return json;
    }
  } catch {
    // Offline or blocked; the bundled copy is fine.
  }
  return bundled as DangerData;
}
