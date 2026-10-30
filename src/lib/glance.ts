import type { MatchupBrief } from "./brief";
import type { Age, Unit } from "./gameData";

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
