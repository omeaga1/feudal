import type { Unit, Weapon } from "./gameData";
import overridesJson from "../data/counter-overrides.json";

const ATTACK_PROPERTY: Record<string, string> = {
  melee: "meleeAttack",
  ranged: "rangedAttack",
  siege: "siegeAttack",
  fire: "fireAttack",
};

/**
 * A bonus target such as ["light", "melee", "infantry"] matches either the
 * joined class ("light_melee_infantry") or a unit carrying every word as its
 * own class ("light", "melee", "infantry").
 */
export function matchesTarget(target: string[], classes: Set<string>): boolean {
  return classes.has(target.join("_")) || target.every((word) => classes.has(word));
}

export function damagePerHit(weapon: Weapon, defender: Unit): number {
  const classes = new Set(defender.classes);
  const property = ATTACK_PROPERTY[weapon.type];
  let damage = weapon.damage;
  for (const modifier of weapon.modifiers) {
    if (modifier.property !== property) continue;
    if (modifier.target.some((target) => matchesTarget(target, classes))) damage += modifier.value;
  }
  const armor = defender.armor.find((a) => a.type === weapon.type)?.value ?? 0;
  return Math.max(1, damage - armor);
}

/** Highest damage per second the attacker can deal to the defender, ignoring torches. */
export function bestDps(attacker: Unit, defender: Unit): number {
  let best = 0;
  for (const weapon of attacker.weapons) {
    if (weapon.type === "fire" || weapon.speed <= 0) continue;
    best = Math.max(best, damagePerHit(weapon, defender) / weapon.speed);
  }
  return best;
}

/**
 * How well `unit` does against `enemy` when both sides spend the same
 * resources. Above 1 means `unit` wins. Uses Lanchester's square law, so
 * cheaper units get credit for fielding more bodies. Range, speed and micro
 * are ignored; counter-overrides.json corrects the cases where that matters.
 */
export function costEfficiency(unit: Unit, enemy: Unit): number {
  const dealt = bestDps(unit, enemy);
  const taken = bestDps(enemy, unit);
  if (dealt === 0) return 0;
  if (taken === 0) return Number.POSITIVE_INFINITY;
  const unitCost = Math.max(1, unit.costs.total);
  const enemyCost = Math.max(1, enemy.costs.total);
  return (dealt * unit.hitpoints * enemyCost ** 2) / (taken * enemy.hitpoints * unitCost ** 2);
}

export interface CounterOverride {
  unit: string;
  enemy: string;
  /** Multiplies the computed score, e.g. 1.5 for ranged units that kite their target. */
  factor: number;
  reason: string;
}

const overrides = overridesJson.overrides as CounterOverride[];

export interface CounterPick {
  unit: Unit;
  score: number;
  reason?: string;
}

const NOT_COUNTERS = ["siege", "hero", "leader", "scout"];

/**
 * Units worth recommending as an answer: regular army units, not siege,
 * scouts or one-off heroes. Siege is answered with fast melee cavalry, the
 * standard way to snipe it, because the math above can't model that.
 */
export function counterCandidates(enemy: Unit, roster: Unit[]): Unit[] {
  const army = roster.filter((u) => !NOT_COUNTERS.some((c) => u.classes.includes(c)));
  if (!enemy.classes.includes("siege")) return army;
  const cavalry = army.filter((u) => u.classes.includes("cavalry") && u.classes.includes("melee"));
  return cavalry.length > 0 ? cavalry : army.filter((u) => u.classes.includes("melee"));
}

export function rankCounters(enemy: Unit, roster: Unit[], limit = 3): CounterPick[] {
  return counterCandidates(enemy, roster)
    .map((unit) => {
      const override = overrides.find((o) => o.unit === unit.baseId && o.enemy === enemy.baseId);
      const score = costEfficiency(unit, enemy) * (override?.factor ?? 1);
      return { unit, score, reason: override?.reason };
    })
    .filter((pick) => pick.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
