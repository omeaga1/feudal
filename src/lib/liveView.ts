import type { DangerWindows } from "./dangerWindows";
import { clock, pathSteps, type GamePlan, type PlanStyle, type SelectedPath } from "./gamePlans";
import { firstSentence } from "./glance";
import { production, type Production } from "./playback";
import type { Playbook } from "./playbooks";

// The in-game Live view shows three things: what counters what, when the
// opponent's civ is dangerous or weak, and where your villager count should be
// right now. These helpers turn plans, playbooks and stats into that.

/**
 * AoE4 World stamps a match when the lobby launches, so the loading screen
 * makes its clock run ahead of the game's. This is the usual gap.
 */
export const LOADING_SECONDS = 40;

/** Seconds into the game at `now`, never negative, or null when the start time is unknown. */
export function gameSeconds(startedAt: string, now: number, loading = LOADING_SECONDS): number | null {
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return null;
  return Math.max(0, Math.floor((now - start) / 1000) - loading);
}

export type TimingKind = "rush" | "spike" | "weak" | "yours" | "theirs";

export interface Timing {
  kind: TimingKind;
  /** Seconds. */
  from: number;
  /** Seconds; null for an open-ended stretch. */
  to: number | null;
  title: string;
  /** What to do about it, one short sentence. */
  tip: string;
  /** Unit names to show as icons. */
  units?: string[];
}

const AGGRESSIVE: PlanStyle[] = ["aggro", "pro-scouts", "timing"];
const GREEDY: PlanStyle[] = ["boom", "fast-castle", "fast-imperial"];
/** How long a Feudal rush stays dangerous after the age-up. */
const RUSH_SECONDS = 150;
/** How long a Castle spike takes to show up on the map. */
const SPIKE_SECONDS = 120;
/** The Castle landmark goes up this long before the age-up lands: they're paying for it with no army. */
const CLICK_UP_SECONDS = 90;

/**
 * The playbook's answer to a power spike in these ages. With `about`, only a
 * spike that names one of those units or sounds like aggression counts, so a
 * rush never gets advice meant for a boom.
 */
function spikeTip(playbook: Playbook | undefined, ages: number[], fallback: string, about?: string[]): string {
  const words = about?.map((u) => u.toLowerCase().replace(/(men|man|s)$/, ""));
  const fits = (text: string) => !words || /rush|aggress|pressure|harass|raid|all-in/i.test(text) || words.some((w) => text.toLowerCase().includes(w));
  const spike = playbook?.spikes.find((s) => ages.includes(s.age) && fits(`${s.label} ${s.detail}`));
  return spike ? firstSentence(spike.answer) : fallback;
}

/**
 * When the enemy civ hits hardest and when it's open, from its game plan
 * (Feudal paths and Castle age-ups), its playbook's power spikes, and the
 * win rate by game length for this matchup. Sorted by time.
 */
export function enemyTimings(plan: GamePlan | undefined, playbook: Playbook | undefined, danger: DangerWindows | null): Timing[] {
  const out: Timing[] = [];
  if (plan) {
    const paths = plan.feudal.slice(0, 2);
    const rush = paths.filter((f) => AGGRESSIVE.includes(f.style)).sort((a, b) => clock(a.ageUp) - clock(b.ageUp))[0];
    if (rush) {
      const at = clock(rush.ageUp);
      out.push({
        kind: "rush",
        from: at,
        to: at + RUSH_SECONDS,
        title: rush.name,
        tip: spikeTip(playbook, [1, 2], "Spears and archers at home, a tower on gold.", rush.army),
        units: rush.army?.slice(0, 3),
      });
    }
    const greedy = paths.find((f) => GREEDY.includes(f.style));
    if (greedy) {
      const castleAt = Math.min(...greedy.castle.map((c) => clock(c.ageUp)));
      out.push({
        kind: "weak",
        from: clock(greedy.ageUp),
        to: castleAt - CLICK_UP_SECONDS,
        title: `${greedy.name}: thin army`,
        tip: "Hit them now, before the eco pays off.",
      });
    }
    const castles = paths.flatMap((f) => f.castle).sort((a, b) => clock(a.ageUp) - clock(b.ageUp));
    const first = castles[0];
    if (first) {
      const at = clock(first.ageUp);
      out.push({
        kind: "weak",
        from: at - CLICK_UP_SECONDS,
        to: at,
        title: "Clicking up to Castle",
        tip: "Their resources are in the landmark. Attack or snipe it.",
      });
      out.push({
        kind: "spike",
        from: at,
        to: at + SPIKE_SECONDS,
        title: `Castle spike: ${first.name}`,
        tip: spikeTip(playbook, [3], "Have walls or a keep and your counters grouped."),
        units: first.army?.slice(0, 3),
      });
    }
  }
  if (danger) {
    const solid = danger.windows.filter((w) => !w.thin);
    const best = solid.filter((w) => w.kind === "yours").sort((a, b) => b.winRate - a.winRate)[0];
    const worst = solid.filter((w) => w.kind === "danger").sort((a, b) => a.winRate - b.winRate)[0];
    if (best) out.push({ kind: "yours", from: best.from, to: best.to, title: `You win ${Math.round(best.winRate * 100)}% here`, tip: "Your stretch of the game. Take fights." });
    if (worst)
      out.push({
        kind: "theirs",
        from: worst.from,
        to: worst.to,
        title: `They win ${Math.round((1 - worst.winRate) * 100)}% here`,
        tip: "Their stretch. Defend and don't take bad fights.",
      });
  }
  return out.filter((t) => !Number.isNaN(t.from) && (t.to === null || t.to > t.from)).sort((a, b) => a.from - b.from);
}

/** Whether a timing is on now, coming up, or over. */
export function timingState(t: Timing, seconds: number | null): "now" | "past" | "later" {
  if (seconds === null) return "later";
  if (seconds >= t.from && (t.to === null || seconds < t.to)) return "now";
  if (t.to !== null && seconds >= t.to) return "past";
  return "later";
}

/** Pros stop training villagers somewhere past a hundred. */
export const VILLAGER_CAP = 120;

/**
 * Villager production for your build by the game's rules (Town Centers,
 * villager landmarks, age-up pauses), carried on past the plan's last step
 * with every producer still training, up to `until`.
 */
export function villagerTargets(plan: GamePlan, path: SelectedPath, until: number): Production {
  const steps = pathSteps(plan, path)
    .map(({ step }) => ({ seconds: clock(step.t), text: step.do, builders: step.b }))
    .filter((s) => !Number.isNaN(s.seconds))
    .sort((a, b) => a.seconds - b.seconds);
  const feudalAt = clock(path.feudal.ageUp);
  const castleAt = clock(path.castle.ageUp);
  return production(
    plan.civ,
    steps,
    until,
    [
      { name: path.feudal.landmark, at: feudalAt },
      { name: path.castle.landmark, at: castleAt },
    ],
    [
      { age: 2, at: feudalAt },
      { age: 3, at: castleAt },
    ],
  );
}

/** Villagers you should have at `seconds`, capped where players stop making them. */
export function villagersAt(prod: Production, seconds: number): number {
  let n = 0;
  while (n < prod.born.length && prod.born[n] <= seconds) n++;
  return Math.min(VILLAGER_CAP, prod.start + n);
}
