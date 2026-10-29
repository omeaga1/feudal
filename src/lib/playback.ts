import { landmarks } from "./scouting";
import { clock, pathSteps, RESOURCES, type GamePlan, type PlanStep, type Resource, type SelectedPath, type Split } from "./gamePlans";

// Plays a chosen path back as a simulated game: the clock runs, villagers
// move between resources, buildings appear, and the ages tick over. Built
// only from the plan's own steps, so it shows exactly what the plan says.

/** Where a villager is: on a resource, or building. */
export type Slot = Resource | "build";
export const SLOTS: readonly Slot[] = [...RESOURCES, "build"];

export interface Villager {
  /** Stable across steps, so the UI can animate one villager moving. */
  id: number;
  at: Slot;
}

export type BuildingKind =
  | "house"
  | "mill"
  | "lumber"
  | "mining"
  | "farm"
  | "barracks"
  | "range"
  | "stable"
  | "blacksmith"
  | "market"
  | "tower"
  | "townCenter"
  | "religious"
  | "dock"
  | "siege";

/** Building names as plan steps write them, first match wins per kind. */
const BUILDING_WORDS: [BuildingKind, RegExp][] = [
  ["house", /\bhouses?\b/i],
  ["mill", /\bmills?\b/i],
  ["lumber", /\blumber ?camps?\b/i],
  ["mining", /\b(mining|gold|stone) ?camps?\b/i],
  ["farm", /\bfarms?\b|\bfarmhouses?\b|\branch(es)?\b|\bpastures?\b/i],
  ["barracks", /\bbarracks\b/i],
  ["range", /\b(archery )?ranges?\b/i],
  ["stable", /\bstables?\b/i],
  ["blacksmith", /\bblacksmiths?\b|\bforge\b/i],
  ["market", /\bmarkets?\b/i],
  ["tower", /\b(outposts?|towers?)\b/i],
  ["townCenter", /\b(town ?centers?|(2nd|second|third|3rd) tc|tcs?)\b/i],
  ["religious", /\b(monaster(y|ies)|mosques?|prayer tents?|shrines?)\b/i],
  ["dock", /\bdocks?\b/i],
  ["siege", /\bsiege workshops?\b/i],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LANDMARK_NAMES = new RegExp(
  [...new Set(landmarks.map((l) => l.name))]
    .sort((a, b) => b.length - a.length)
    .map((n) => escape(n).replace(/^the /i, "(the )?"))
    .join("|"),
  "gi",
);

/** The buildings a step's text names, in a fixed order. */
export function buildingsIn(text: string): BuildingKind[] {
  // "The White Tower" is a landmark, not a tower; landmarks are tracked separately.
  const plain = text.replace(LANDMARK_NAMES, "");
  return BUILDING_WORDS.filter(([, re]) => re.test(plain)).map(([kind]) => kind);
}

/**
 * Moves the fewest villagers to match a new split. Villagers already on a
 * resource that still needs them stay put; the rest move to the shortfalls,
 * and new villagers (from the Town Center) fill whatever is left.
 */
export function assignVillagers(prev: Villager[], split: Split, builders: number, nextId = nextVillagerId(prev)): Villager[] {
  const target: Record<Slot, number> = { food: split[0], wood: split[1], gold: split[2], stone: split[3], build: builders };
  const count: Record<Slot, number> = { food: 0, wood: 0, gold: 0, stone: 0, build: 0 };
  const kept = prev.map((v) => {
    if (count[v.at] < target[v.at]) {
      count[v.at]++;
      return v;
    }
    return null;
  });
  const needs: Slot[] = SLOTS.flatMap((s) => Array.from({ length: Math.max(0, target[s] - count[s]) }, () => s));
  const out: Villager[] = [];
  kept.forEach((v, i) => {
    if (v) out.push(v);
    else if (needs.length) out.push({ id: prev[i].id, at: needs.shift()! });
  });
  let id = nextId;
  for (const at of needs) out.push({ id: id++, at });
  return out;
}

function nextVillagerId(vils: Villager[]): number {
  return vils.reduce((m, v) => Math.max(m, v.id + 1), 0);
}

export interface PlaybackEvent {
  seconds: number;
  age: 1 | 2 | 3;
  step: PlanStep;
  /** The split in effect from this step on (carried from the last step that gave one). */
  split: Split;
  builders: number;
  villagers: Villager[];
  /** Buildings this step names for the first time. */
  newBuildings: BuildingKind[];
}

export interface Playback {
  events: PlaybackEvent[];
  feudalAt: number;
  castleAt: number;
  /** Where playback stops: a little after the last thing that happens. */
  end: number;
}

export function buildPlayback(plan: GamePlan, path: SelectedPath): Playback {
  const feudalAt = clock(path.feudal.ageUp);
  const castleAt = clock(path.castle.ageUp);
  let split: Split = [0, 0, 0, 0];
  let builders = 0;
  let buildersUntil = 0;
  let villagers: Villager[] = [];
  let nextId = 0;
  const seen = new Set<BuildingKind>();
  const events = pathSteps(plan, path)
    .map(({ age, step }) => ({ age, step, seconds: clock(step.t) }))
    .filter((e) => !Number.isNaN(e.seconds))
    .sort((a, b) => a.seconds - b.seconds)
    .map(({ age, step, seconds }): PlaybackEvent => {
      // A step without a split keeps the last one. Landmark builders stay on
      // the landmark until the age-up unless a step says otherwise.
      if (step.v) {
        split = step.v;
        if (step.b !== undefined) buildersUntil = age === 1 ? feudalAt : castleAt;
        builders = step.b ?? (seconds < buildersUntil ? builders : 0);
        villagers = assignVillagers(villagers, split, builders, nextId);
        nextId = Math.max(nextId, nextVillagerId(villagers));
      }
      const newBuildings = buildingsIn(step.do).filter((b) => !seen.has(b));
      newBuildings.forEach((b) => seen.add(b));
      return { seconds, age, step, split, builders, villagers, newBuildings };
    });
  const last = events.length ? events[events.length - 1].seconds : 0;
  return { events, feudalAt, castleAt, end: Math.max(last, castleAt) + 30 };
}

export interface Frame {
  /** Index of the step in effect, or -1 before the first one. */
  index: number;
  current?: PlaybackEvent;
  next?: PlaybackEvent;
  /** The age you're in at this moment (the age-up time has passed). */
  age: 1 | 2 | 3;
  /** The next age-up, if one is still ahead. */
  nextAgeAt?: number;
  /** 0..1 through the current age toward the next age-up. */
  ageProgress: number;
  villagers: Villager[];
  buildings: { kind: BuildingKind; at: number }[];
}

export function frameAt(pb: Playback, seconds: number): Frame {
  let index = -1;
  for (let i = 0; i < pb.events.length && pb.events[i].seconds <= seconds; i++) index = i;
  const age = seconds >= pb.castleAt ? 3 : seconds >= pb.feudalAt ? 2 : 1;
  const [from, to] = age === 1 ? [0, pb.feudalAt] : age === 2 ? [pb.feudalAt, pb.castleAt] : [pb.castleAt, pb.castleAt];
  const buildings = pb.events.slice(0, index + 1).flatMap((e) => e.newBuildings.map((kind) => ({ kind, at: e.seconds })));
  return {
    index,
    current: pb.events[index],
    next: pb.events[index + 1],
    age,
    nextAgeAt: age < 3 ? to : undefined,
    ageProgress: age < 3 ? Math.min(1, Math.max(0, (seconds - from) / Math.max(1, to - from))) : 1,
    villagers: pb.events[index]?.villagers ?? [],
    buildings,
  };
}
