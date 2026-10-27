import type { Age } from "./gameData";

export interface PowerSpike {
  age: Age;
  label: string;
  /** What the civ does at this point. */
  detail: string;
  /** What to do about it when playing against this civ. */
  answer: string;
}

export interface UnitPairing {
  /** The units that work together, e.g. "Spearmen + Archers". */
  units: string;
  why: string;
}

export type WinConditionKind = "army" | "relics" | "sacred_sites" | "wonder" | "trade" | "economy" | "defense";

export interface WinCondition {
  kind: WinConditionKind;
  detail: string;
}

export interface PlaybookSource {
  title: string;
  url?: string;
  /** Patch date or upload date, YYYY-MM-DD. */
  date: string;
  kind: "patch_notes" | "game_data" | "video" | "written_guide";
}

export interface Playbook {
  civ: string;
  /** The patch this playbook was last checked against; null until reviewed. */
  patch: string | null;
  /** The game build (AoE4 World's `patch` number) the draft was written for. */
  draftedForBuild?: number;
  status: "draft" | "reviewed";
  summary: string;
  spikes: PowerSpike[];
  /** Early signs that tell you which plan this civ is on. */
  scout?: string[];
  /** Unit combinations this civ likes to field. */
  pairings?: UnitPairing[];
  /** How this civ usually wins games. */
  winConditions?: WinCondition[];
  sources?: PlaybookSource[];
}

const modules = import.meta.glob<Playbook>("../data/playbooks/*.json", { eager: true, import: "default" });

export const playbooks: Playbook[] = Object.values(modules);

export function getPlaybook(civId: string): Playbook | undefined {
  return playbooks.find((p) => p.civ === civId);
}

/** True when the playbook was written for an older build than the one being played. */
export function isStale(playbook: Playbook, currentBuild: number | null | undefined): boolean {
  if (!currentBuild || !playbook.draftedForBuild) return false;
  return currentBuild > playbook.draftedForBuild;
}
