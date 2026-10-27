import type { CivStat } from "./aoe4world";

export type Tempo = "early-pressure" | "balanced" | "long-game";

export interface CivTempo {
  tempo: Tempo;
  /** This civ's median game length in seconds. */
  medianDuration: number;
  /** Median of all civs' median game lengths, for comparison. */
  ladderMedian: number;
}

// A civ whose games run 8% shorter than the ladder's typical game is one
// that tends to win, or lose, by pressing early.
const FAST = 0.92;
const SLOW = 1.08;

/** Classifies a civ by how long its ranked games last compared with every other civ. */
export function civTempo(civ: string, stats: CivStat[]): CivTempo | null {
  const row = stats.find((s) => s.civilization === civ);
  if (!row || stats.length === 0) return null;
  const medians = stats.map((s) => s.duration_median).sort((a, b) => a - b);
  const ladderMedian = medians[Math.floor(medians.length / 2)];
  const ratio = row.duration_median / ladderMedian;
  const tempo: Tempo = ratio <= FAST ? "early-pressure" : ratio >= SLOW ? "long-game" : "balanced";
  return { tempo, medianDuration: row.duration_median, ladderMedian };
}

export const TEMPO_LABELS: Record<Tempo, string> = {
  "early-pressure": "Expect early pressure",
  balanced: "Expect a standard game",
  "long-game": "Expect a boom and a long game",
};
