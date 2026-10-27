import type { Age } from "./gameData";

export interface PowerSpike {
  age: Age;
  label: string;
  /** What the civ does at this point. */
  detail: string;
  /** What to do about it when playing against this civ. */
  answer: string;
}

export interface Playbook {
  civ: string;
  /** The patch this playbook was last checked against; null until reviewed. */
  patch: string | null;
  status: "draft" | "reviewed";
  summary: string;
  spikes: PowerSpike[];
}

const modules = import.meta.glob<Playbook>("../data/playbooks/*.json", { eager: true, import: "default" });

export const playbooks: Playbook[] = Object.values(modules);

export function getPlaybook(civId: string): Playbook | undefined {
  return playbooks.find((p) => p.civ === civId);
}
