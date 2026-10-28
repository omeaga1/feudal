import { landmarks } from "./scouting";
import { units, type Unit } from "./gameData";

// Branching game plans, one file per civ in src/data/gameplans. Each plan is
// a Dark Age opening, two Feudal paths, and two Castle paths under each
// Feudal path, condensed from pro build orders on aoe4guides.com (most of
// which follow a pro's YouTube guide).

/** Villagers on [food, wood, gold, stone]. */
export type Split = [number, number, number, number];

export const RESOURCES = ["food", "wood", "gold", "stone"] as const;
export type Resource = (typeof RESOURCES)[number];

export interface PlanStep {
  /** Game clock, "m:ss". */
  t: string;
  /** Villagers gathering each resource at this point. */
  v?: Split;
  /** Villagers building (landmark, Town Center) at this point. */
  b?: number;
  /** What to do, in a few words. */
  do: string;
}

export type PlanStyle = "boom" | "aggro" | "fast-castle" | "timing" | "pro-scouts" | "defense" | "fast-imperial";

export const STYLE_LABELS: Record<PlanStyle, string> = {
  boom: "Boom",
  aggro: "Aggression",
  "fast-castle": "Fast Castle",
  timing: "Timing attack",
  "pro-scouts": "Pro Scouts",
  defense: "Defensive",
  "fast-imperial": "Fast Imperial",
};

export interface PlanNode {
  id: string;
  name: string;
  style: PlanStyle;
  /** The landmark built to reach this age, when the path names one. */
  landmark?: string;
  /** When you reach this age, "m:ss". */
  ageUp: string;
  /** When to take this path, in one line. */
  pick: string;
  steps: PlanStep[];
  /** Unit names, matched against AoE4 World's unit data for icons. */
  army?: string[];
  /** What you're aiming for by the end of this age. */
  goal?: string;
}

export interface FeudalPath extends PlanNode {
  castle: PlanNode[];
}

export interface PlanSource {
  title: string;
  url: string;
  video?: string;
}

export interface GamePlan {
  civ: string;
  /** The ranked season of the guides this plan was condensed from. */
  season: string;
  /** The game build (AoE4 World's `patch`) the plan was last checked against. */
  checkedBuild: number;
  updated: string;
  opening: { decideAt: string; steps: PlanStep[] };
  feudal: FeudalPath[];
  sources: PlanSource[];
}

const modules = import.meta.glob<GamePlan>("../data/gameplans/*.json", { eager: true, import: "default" });

export const gamePlans: GamePlan[] = Object.values(modules);

export function getGamePlan(civId: string): GamePlan | undefined {
  return gamePlans.find((p) => p.civ === civId);
}

/** "4:30" -> 270. Unparseable clocks give NaN. */
export function clock(t: string): number {
  const m = t.trim().match(/^(\d+):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface SelectedPath {
  feudal: FeudalPath;
  castle: PlanNode;
}

export interface TimelinePoint {
  seconds: number;
  split: Split;
  builders: number;
}

/** Every step of a chosen path in clock order: the opening, then Feudal, then Castle. */
export function pathSteps(plan: GamePlan, path: SelectedPath): { age: 1 | 2 | 3; step: PlanStep }[] {
  return [
    ...plan.opening.steps.map((step) => ({ age: 1 as const, step })),
    ...path.feudal.steps.map((step) => ({ age: (clock(step.t) < clock(path.feudal.ageUp) ? 1 : 2) as 1 | 2, step })),
    ...path.castle.steps.map((step) => ({ age: (clock(step.t) < clock(path.castle.ageUp) ? 2 : 3) as 2 | 3, step })),
  ];
}

/** The villager split over time for a chosen path, for the stacked chart. Steps without a split are skipped. */
export function villagerTimeline(plan: GamePlan, path: SelectedPath): TimelinePoint[] {
  return pathSteps(plan, path)
    .filter(({ step }) => step.v && !Number.isNaN(clock(step.t)))
    .map(({ step }) => ({ seconds: clock(step.t), split: step.v!, builders: step.b ?? 0 }))
    .sort((a, b) => a.seconds - b.seconds);
}

export function totalVillagers(point: TimelinePoint): number {
  return point.split.reduce((a, b) => a + b, 0) + point.builders;
}

const unitsByName = new Map<string, Unit[]>();
for (const u of units) {
  for (const key of [u.name.toLowerCase(), u.baseId.replace(/-/g, " ")]) {
    unitsByName.set(key, [...(unitsByName.get(key) ?? []), u]);
  }
}

/** The unit a plan names, preferring the civ's own version at the lowest age it exists. */
export function findUnit(name: string, civAbbr?: string): Unit | undefined {
  const matches = unitsByName.get(name.toLowerCase()) ?? [];
  const own = civAbbr ? matches.filter((u) => u.civs.includes(civAbbr)) : matches;
  return [...(own.length ? own : matches)].sort((a, b) => a.age - b.age)[0];
}

/** The landmark icon for a plan's landmark name, if AoE4 World's data has it. */
export function landmarkIcon(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const key = name.toLowerCase();
  return landmarks.find((l) => l.name.toLowerCase() === key)?.icon;
}
