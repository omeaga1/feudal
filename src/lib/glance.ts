import type { MatchupBrief } from "./brief";
import type { LengthWindow } from "./dangerWindows";
import type { Age, Unit } from "./gameData";
import { clock } from "./gamePlans";

// The in-game Live view has to fit one screen with no scrolling, so these
// helpers decide how much of the brief makes the cut.

export interface GlanceThreat {
  enemy: Unit;
  answers: Unit[];
}

export interface GlanceAge {
  age: Age;
  threats: GlanceThreat[];
}

/** The top enemy units per age, each with the few units of yours that beat it best. */
export function glanceThreats(brief: MatchupBrief, perAge = 3, answers = 2): GlanceAge[] {
  return brief.ages
    .map(({ age, threats }) => ({
      age,
      threats: threats.slice(0, perAge).map((t) => ({ enemy: t.enemy, answers: t.counters.slice(0, answers).map((c) => c.unit) })),
    }))
    .filter((a) => a.threats.length > 0);
}

/** "Go full archers with a few spears. Don't answer..." -> "Go full archers with a few spears." */
export function firstSentence(text: string): string {
  const match = /^.*?[.!?](?=\s|$)/.exec(text.trim());
  return match ? match[0] : text.trim();
}

/** Seconds since the match started on AoE4 World, never negative. Loading screens make it run a little ahead of the game clock. */
export function elapsedSeconds(startedAt: string, now: number): number | null {
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return null;
  return Math.max(0, Math.floor((now - start) / 1000));
}

/** Index of the game-length window that `seconds` falls in, or -1. */
export function windowAt(windows: LengthWindow[], seconds: number): number {
  return windows.findIndex((w) => seconds >= w.from && (w.to === null || seconds < w.to));
}

/**
 * Which build steps to show at `seconds` into the game: the step you should be
 * on, the one before it, and the next few. Before the clock is known, starts
 * at the first step.
 */
export function stepWindow<T extends { step: { t: string } }>(
  steps: T[],
  seconds: number | null,
  ahead = 3,
): { items: T[]; current: number; offset: number } {
  const times = steps.map(({ step }) => clock(step.t));
  let current = 0;
  if (seconds !== null) times.forEach((t, i) => !Number.isNaN(t) && t <= seconds && (current = i));
  const offset = Math.max(0, Math.min(current - 1, steps.length - (ahead + 2)));
  return { items: steps.slice(offset, offset + ahead + 2), current, offset };
}
