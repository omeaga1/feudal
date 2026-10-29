import economyJson from "../data/generated/economy.json";
import { getCiv } from "./gameData";
import { landmarks } from "./scouting";
import { clock, pathSteps, RESOURCES, type GamePlan, type PlanStep, type Resource, type SelectedPath, type Split } from "./gamePlans";

// Plays a chosen path back as a simulated game: the clock runs, villagers
// move between resources, buildings appear, and the ages tick over. The plan's
// steps say where villagers go; the game's production rules say when each one
// exists: every Town Center trains one villager per the civ's train time
// (from AoE4 World's game data), nonstop from 0:00.

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
  ["townCenter", /\b(2nd|second|third|3rd|another|extra|new) (tc|town ?center)s?\b/i],
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

/** What a step's text says about moving villagers: who gets pulled where, and where the Town Center rallies. */
export interface Hints {
  pulls: { from: Slot; to: Slot }[];
  rally?: Resource;
}

const RESOURCE_WORDS: [RegExp, Resource][] = [
  [/^(food|sheep|berry|berries|deer|hunt|farms?|boar|cattle|shore|fish)$/, "food"],
  [/^(wood|woodline|lumber|trees?|chop)$/, "wood"],
  [/^gold$/, "gold"],
  [/^stone$/, "stone"],
];

function resourceWord(word: string | undefined): Resource | undefined {
  return word ? RESOURCE_WORDS.find(([re]) => re.test(word))?.[1] : undefined;
}

/**
 * Reads villager moves out of a step like "Pull gold to wood, 4 sheep build
 * Council Hall" or "Builders to sheep; rally gold". Anything it can't read
 * is left to the split itself.
 */
export function stepHints(text: string): Hints {
  const t = text.toLowerCase();
  const pulls: Hints["pulls"] = [];
  for (const m of t.matchAll(/\b([a-z]+)\s+(?:villagers?\s+)?builds?\b/g)) {
    const from = resourceWord(m[1]);
    if (from) pulls.push({ from, to: "build" });
  }
  for (const m of t.matchAll(/\bbuilders?\s+(?:back\s+)?to\s+([a-z]+)(?:\s+and\s+([a-z]+))?/g)) {
    for (const w of [m[1], m[2]]) {
      const to = resourceWord(w);
      if (to) pulls.push({ from: "build", to });
    }
  }
  for (const m of t.matchAll(/\b([a-z]+)\s+(?:villagers?\s+)?to\s+([a-z]+)/g)) {
    const from = resourceWord(m[1]);
    const to = resourceWord(m[2]);
    if (from && to && from !== to) pulls.push({ from, to });
  }
  const rally =
    t.match(/\brall(?:y|ies|ying)\s+(?:back\s+)?(?:to\s+)?(?:\d+(?:\s+(?:or|to)\s+\d+)?\s+)?(?:villagers\s+)?(?:to\s+|on\s+)?([a-z]+)/)?.[1] ??
    t.match(/\bnext\s+(?:\d+|ones?|few|villagers?)\s+(?:villagers\s+)?(?:to|on)\s+([a-z]+)/)?.[1];
  return { pulls, rally: resourceWord(rally) };
}

/** Where builders come from when a step doesn't say: sheep first, as most guides do. */
const BUILDER_SOURCES: Slot[] = ["food", "wood", "gold", "stone"];
/** Where anyone else comes from: finished builders first. */
const ANY_SOURCE: Slot[] = ["build", "food", "wood", "gold", "stone"];

/**
 * Moves the fewest villagers to match a new split. Villagers already on a
 * resource that still needs them stay put. The step's own words decide who
 * gets pulled where, new villagers go to the rally point, and the rest
 * fill whatever shortfall is left.
 */
export function assignVillagers(prev: Villager[], split: Split, builders: number, nextId = nextVillagerId(prev), hints: Hints = { pulls: [] }): Villager[] {
  const target: Record<Slot, number> = { food: split[0], wood: split[1], gold: split[2], stone: split[3], build: builders };
  const count: Record<Slot, number> = { food: 0, wood: 0, gold: 0, stone: 0, build: 0 };
  const freed: Record<Slot, number[]> = { food: [], wood: [], gold: [], stone: [], build: [] };
  prev.forEach((v, i) => {
    if (count[v.at] < target[v.at]) count[v.at]++;
    else freed[v.at].push(i);
  });
  const need = Object.fromEntries(SLOTS.map((s) => [s, target[s] - count[s]])) as Record<Slot, number>;
  const moved = new Map<number, Slot>();
  const take = (from: Slot, to: Slot) => {
    while (freed[from].length && need[to] > 0) {
      moved.set(freed[from].shift()!, to);
      need[to]--;
    }
  };

  for (const p of hints.pulls) take(p.from, p.to);
  // New villagers walk out of the Town Center to the rally point.
  const total = SLOTS.reduce((a, s) => a + target[s], 0);
  let fresh = Math.max(0, total - prev.length);
  const toRally = hints.rally ? Math.min(fresh, Math.max(0, need[hints.rally])) : 0;
  if (hints.rally) need[hints.rally] -= toRally;
  fresh -= toRally;
  for (const from of BUILDER_SOURCES) take(from, "build");
  for (const to of SLOTS) for (const from of ANY_SOURCE) take(from, to);

  const out: Villager[] = [];
  prev.forEach((v, i) => {
    const at = moved.get(i);
    if (at) out.push({ id: v.id, at });
    else if (!SLOTS.some((s) => freed[s].includes(i))) out.push(v);
  });
  let id = nextId;
  for (let k = 0; k < toRally; k++) out.push({ id: id++, at: hints.rally! });
  for (const to of SLOTS) {
    while (need[to] > 0 && fresh > 0) {
      out.push({ id: id++, at: to });
      need[to]--;
      fresh--;
    }
  }
  return out;
}

function nextVillagerId(vils: Villager[]): number {
  return vils.reduce((m, v) => Math.max(m, v.id + 1), 0);
}

/** Every civ starts with six villagers. */
export const START_VILLAGERS = 6;

export interface Producer {
  /** "Town Center", "TC 2", or a landmark that trains villagers. */
  label: string;
  /** When it starts training villagers. */
  from: number;
}

export interface Production {
  /** Seconds per villager (per batch) from one Town Center. */
  trainTime: number;
  /** Villagers per batch: Golden Horde trains two at once. */
  batch: number;
  /** Everything that trains villagers, in the order it comes online. */
  producers: Producer[];
  /** When each villager after the first six walks out, in order. */
  born: number[];
}

interface Economy {
  trainTime: number;
  batch: number;
  townCenterBuildTime: number;
  villagerLandmarks: string[];
}
const ECONOMY = economyJson as Record<string, Economy>;
const DEFAULT_ECONOMY: Economy = { trainTime: 20, batch: 1, townCenterBuildTime: 165, villagerLandmarks: [] };

/** Which Town Center a step is about: "TC 2", "second TC", "both TCs". */
function tcNumber(text: string, have: number): number | undefined {
  if (/\b(tc ?2|(2nd|second) (tc|town ?center)|(two|both) (tcs|town ?centers))\b/i.test(text)) return 2;
  if (/\b(tc ?3|(3rd|third) (tc|town ?center)|(three|all three) (tcs|town ?centers))\b/i.test(text)) return 3;
  if (/\b(another|extra|new) (tc|town ?center)\b/i.test(text)) return have + 1;
  return undefined;
}

/**
 * Villager production for a plan, by the game's rules: one Town Center from
 * 0:00, each extra TC a step builds once the civ's TC build time has passed
 * (or right away when the step says it's done or running), and any landmark
 * the path builds that trains villagers (King's Palace, Palace of Swabia)
 * from its age-up. Every producer trains nonstop.
 */
export function production(civId: string, steps: { seconds: number; text: string }[], until: number, built: { name?: string; at: number }[] = []): Production {
  const eco = ECONOMY[getCiv(civId)?.abbr ?? ""] ?? DEFAULT_ECONOMY;
  const producers: Producer[] = [{ label: "Town Center", from: 0 }];
  let tcs = 1;
  for (const { seconds, text } of steps) {
    const n = tcNumber(text, tcs);
    if (!n || n <= tcs) continue;
    // "Stone for a second TC" or "rams or a second TC" plans one; it isn't built yet.
    if (/\b(for|or) (a |the )?(tc ?\d|\w+ (tc|town ?center))|\b(acts|works) as\b|\bsoon\b/i.test(text)) continue;
    const running = /\b(done|finished|complete[sd]?|running|both|two|nonstop|make villagers|making villagers)\b/i.test(text);
    while (tcs < n) producers.push({ label: `TC ${++tcs}`, from: seconds + (running ? 0 : eco.townCenterBuildTime) });
  }
  for (const { name, at } of built) {
    if (name && eco.villagerLandmarks.includes(name)) producers.push({ label: name, from: at });
  }
  producers.sort((a, b) => a.from - b.from);
  const born: number[] = [];
  for (const { from } of producers) {
    for (let t = from + eco.trainTime; t <= until; t += eco.trainTime) for (let k = 0; k < eco.batch; k++) born.push(t);
  }
  born.sort((a, b) => a - b);
  return { trainTime: eco.trainTime, batch: eco.batch, producers, born };
}

/** How many villagers exist at `t`. */
export function trainedBy(prod: Production, t: number): number {
  let n = 0;
  while (n < prod.born.length && prod.born[n] <= t) n++;
  return START_VILLAGERS + n;
}

/** When the villager that is `rank`th by age (0 = oldest) first exists. */
export function bornAt(prod: Production, rank: number): number {
  return rank < START_VILLAGERS ? 0 : (prod.born[rank - START_VILLAGERS] ?? Infinity);
}

export interface PlaybackEvent {
  seconds: number;
  age: 1 | 2 | 3;
  step: PlanStep;
  /** The split in effect from this step on (carried from the last step that gave one). */
  split: Split;
  builders: number;
  /** The villagers that exist when the step starts, where the step sends them. */
  villagers: Villager[];
  /** Every villager the plan counts at this step, trained yet or not. */
  planned: Villager[];
  /** Villagers the Town Centers train while this step is in effect. */
  trained: number;
  /** The villagers there are by the time the next step starts: what this step builds up to. */
  reached: Villager[];
  /** Buildings this step names for the first time. */
  newBuildings: BuildingKind[];
  /** Villagers this step sends somewhere new when it starts: pulled from a resource, or fresh out of the Town Center ("tc"). */
  moves: Move[];
  /** Where the Town Center sends new villagers from this step on. */
  rally: Resource;
  /** The id the next new villager gets. */
  nextId: number;
}

export interface Move {
  from: Slot | "tc";
  to: Slot;
  n: number;
}

/** Counts villagers that changed place between two steps, grouped by from and to. */
export function movesBetween(before: Villager[], after: Villager[]): Move[] {
  const was = new Map(before.map((v) => [v.id, v.at]));
  const moves: Move[] = [];
  for (const v of after) {
    const from = was.get(v.id) ?? "tc";
    if (from === v.at) continue;
    const m = moves.find((x) => x.from === from && x.to === v.at);
    if (m) m.n++;
    else moves.push({ from, to: v.at, n: 1 });
  }
  return moves;
}

export interface Playback {
  events: PlaybackEvent[];
  production: Production;
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
  let rally: Resource = "food";
  const seen = new Set<BuildingKind>();
  const events = pathSteps(plan, path)
    .map(({ age, step }) => ({ age, step, seconds: clock(step.t) }))
    .filter((e) => !Number.isNaN(e.seconds))
    .sort((a, b) => a.seconds - b.seconds)
    .map(({ age, step, seconds }): PlaybackEvent => {
      // A step without a split keeps the last one. Landmark builders stay on
      // the landmark until the age-up unless a step says otherwise.
      const hints = stepHints(step.do);
      const before = villagers;
      if (step.v) {
        split = step.v;
        if (step.b !== undefined) buildersUntil = age === 1 ? feudalAt : castleAt;
        builders = step.b ?? (seconds < buildersUntil ? builders : 0);
        villagers = assignVillagers(villagers, split, builders, nextId, { pulls: hints.pulls, rally: hints.rally ?? rally });
        nextId = Math.max(nextId, nextVillagerId(villagers));
      }
      const moves = movesBetween(before, villagers);
      // Without a rally in the text, the rally point is wherever this step's new villagers went.
      const fresh = moves.filter((m) => m.from === "tc" && m.to !== "build").sort((a, b) => b.n - a.n)[0];
      rally = hints.rally ?? (fresh?.to as Resource | undefined) ?? rally;
      const newBuildings = buildingsIn(step.do).filter((b) => !seen.has(b));
      newBuildings.forEach((b) => seen.add(b));
      return { seconds, age, step, split, builders, villagers, planned: villagers, trained: 0, reached: villagers, newBuildings, moves, rally, nextId };
    });
  const last = events.length ? events[events.length - 1].seconds : 0;
  const end = Math.max(last, castleAt) + 30;
  const prod = production(
    plan.civ,
    events.map((e) => ({ seconds: e.seconds, text: e.step.do })),
    end,
    [
      { name: path.feudal.landmark, at: feudalAt },
      { name: path.castle.landmark, at: castleAt },
    ],
  );
  const pb: Playback = { events, production: prod, feudalAt, castleAt, end };
  // What actually happens at each step under the production rules.
  const actual = events.map((e, i) => {
    const villagers = villagersAt(pb, i, e.seconds);
    const before = i > 0 ? villagersAt(pb, i - 1, e.seconds) : [];
    const next = events[i + 1]?.seconds ?? end;
    const reached = villagersAt(pb, i, next - 0.001);
    return { villagers, moves: movesBetween(before, villagers), trained: reached.length - villagers.length, reached };
  });
  actual.forEach((a, i) => Object.assign(events[i], a));
  return pb;
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
    villagers: villagersAt(pb, index, seconds),
    buildings,
  };
}

/**
 * The villagers that exist at `t` during step `index`: the plan's villagers
 * oldest first, up to what the Town Centers have trained by then. When the
 * TCs have made more than the plan counts, the extras stand at the rally point.
 */
export function villagersAt(pb: Playback, index: number, t: number): Villager[] {
  const e = pb.events[index];
  if (!e) return [];
  const n = trainedBy(pb.production, t);
  const out = [...e.planned].sort((a, b) => a.id - b.id).slice(0, n);
  for (let id = e.nextId; out.length < n; id++) out.push({ id, at: e.rally });
  return out;
}

/**
 * How far a step's villager count is from what the producers can make. A
 * step's split is what it builds up to before the next step, so a count
 * above what's trained by then is ahead (positive), and one below what's
 * already trained when it starts is behind (negative).
 */
export function planOff(pb: Playback, index: number): number {
  const e = pb.events[index];
  if (!e) return 0;
  const n = e.planned.length;
  const hi = e.reached.length;
  const lo = e.villagers.length;
  return n > hi ? n - hi : n < lo ? n - lo : 0;
}

export interface VillagerMove {
  /** Game time the villager was sent here. */
  t: number;
  at: Slot;
}

/**
 * Each villager's moves over the whole playback: where it was sent, and when.
 * The first move is its arrival, at the time its Town Center trained it.
 */
export function villagerMoves(pb: Playback): Map<number, VillagerMove[]> {
  const moves = new Map<number, VillagerMove[]>();
  const send = (id: number, t: number, at: Slot) => {
    const list = moves.get(id) ?? [];
    if (list[list.length - 1]?.at !== at) list.push({ t, at });
    moves.set(id, list);
  };
  pb.events.forEach((e, i) => {
    const until = pb.events[i + 1]?.seconds ?? pb.end;
    const planned = [...e.planned].sort((a, b) => a.id - b.id);
    planned.forEach((v, rank) => {
      const t = Math.max(e.seconds, bornAt(pb.production, rank));
      if (t < until) send(v.id, t, v.at);
    });
    for (let k = 0; ; k++) {
      const t = Math.max(e.seconds, bornAt(pb.production, planned.length + k));
      if (t >= until) break;
      send(e.nextId + k, t, e.rally);
    }
  });
  return moves;
}

/** Where a villager is headed at `t`, where it came from ("tc" when it was just trained), and since when. */
export function villagerAt(moves: VillagerMove[] | undefined, t: number): { from: Slot | "tc"; to: Slot; since: number } | undefined {
  if (!moves) return undefined;
  let i = -1;
  while (i + 1 < moves.length && moves[i + 1].t <= t) i++;
  if (i < 0) return undefined;
  return { from: i === 0 ? "tc" : moves[i - 1].at, to: moves[i].at, since: moves[i].t };
}

/** When villagers start building the landmark for an age-up, if the plan puts builders on it. */
export function landmarkStart(pb: Playback, to: 2 | 3): number | undefined {
  const [from, until] = to === 2 ? [0, pb.feudalAt] : [pb.feudalAt, pb.castleAt];
  return pb.events.find((e) => e.seconds >= from && e.seconds < until && e.builders > 0)?.seconds;
}
