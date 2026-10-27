import landmarksJson from "../data/generated/landmarks.json";
import type { Age, Civ } from "./gameData";

export interface Landmark {
  id: string;
  name: string;
  civs: string[];
  /** The age it is built in; finishing it advances the civ to the next age. */
  builtInAge: Age;
  description: string;
  icon: string;
}

export const landmarks = landmarksJson as Landmark[];

export interface LandmarkChoice {
  /** The age the civ advances into by building one of these. */
  advancingTo: Age;
  options: Landmark[];
}

/**
 * The landmark choices a civ makes at each age-up. Scouting which one the
 * enemy builds is the quickest read on their plan. Civs that age up another
 * way (Abbasid's House of Wisdom wings, for example) have no entries.
 */
export function landmarkChoices(civ: Civ, pool: Landmark[] = landmarks): LandmarkChoice[] {
  const choices: LandmarkChoice[] = [];
  for (const age of [1, 2, 3] as Age[]) {
    const options = pool.filter((l) => l.civs.includes(civ.abbr) && l.builtInAge === age);
    if (options.length > 1) choices.push({ advancingTo: (age + 1) as Age, options });
  }
  return choices;
}
