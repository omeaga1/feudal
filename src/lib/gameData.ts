import { gameIcon } from "./assets";
import civsJson from "../data/generated/civs.json";
import unitsJson from "../data/generated/units.json";
import metaJson from "../data/generated/meta.json";

export type Age = 1 | 2 | 3 | 4;

export const AGE_NAMES: Record<Age, string> = {
  1: "Dark Age",
  2: "Feudal Age",
  3: "Castle Age",
  4: "Imperial Age",
};

export interface Civ {
  /** Matches the civilization ids used by the AoE4 World API, e.g. "holy_roman_empire". */
  id: string;
  /** Short code used in unit data, e.g. "hr". */
  abbr: string;
  name: string;
  expansion: string[];
  classes: string;
  description: string;
  bonuses: string[];
}

export interface WeaponModifier {
  property: string;
  /** Any inner list matching the target's classes applies the bonus. */
  target: string[][];
  value: number;
}

export interface Weapon {
  name: string;
  type: "melee" | "ranged" | "siege" | "fire" | string;
  damage: number;
  speed: number;
  range: number;
  modifiers: WeaponModifier[];
}

export interface Unit {
  id: string;
  baseId: string;
  name: string;
  age: Age;
  civs: string[];
  unique: boolean;
  classes: string[];
  displayClasses: string[];
  costs: { food: number; wood: number; stone: number; gold: number; total: number; popcap: number; time: number };
  hitpoints: number;
  weapons: Weapon[];
  armor: { type: string; value: number }[];
  producedBy: string[];
  icon: string;
}

export const civs = civsJson as Civ[];
export const units = (unitsJson as Unit[]).map((u) => ({ ...u, icon: gameIcon(u.icon) }));
export const dataMeta = metaJson as { source: string; dataVersion: string; syncedAt: string };

const civsById = new Map(civs.map((c) => [c.id, c]));

export function getCiv(id: string): Civ | undefined {
  return civsById.get(id);
}

function isLandUnit(unit: Unit): boolean {
  return !unit.classes.includes("naval") && !unit.classes.includes("ship");
}

/**
 * The land military units a civ can field by the given age, one entry per
 * unit line, using the most advanced variant available at that age.
 */
export function rosterAt(civ: Civ, age: Age, pool: Unit[] = units): Unit[] {
  const best = new Map<string, Unit>();
  for (const unit of pool) {
    if (!unit.civs.includes(civ.abbr) || unit.age > age || !isLandUnit(unit)) continue;
    // Skip units without weapons and free units (Khan, Khaganate spawns, levies).
    if (unit.weapons.length === 0 || unit.costs.total === 0) continue;
    const current = best.get(unit.baseId);
    if (!current || unit.age > current.age) best.set(unit.baseId, unit);
  }
  return [...best.values()].sort((a, b) => a.age - b.age || a.name.localeCompare(b.name));
}
