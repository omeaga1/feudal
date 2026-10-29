import { rankCounters, type CounterPick } from "./counters";
import { getCiv, rosterAt, units as allUnits, type Age, type Civ, type Unit } from "./gameData";
import { getPlaybook, type Playbook } from "./playbooks";

export interface Threat {
  enemy: Unit;
  counters: CounterPick[];
}

export interface AgeBrief {
  age: Age;
  threats: Threat[];
}

export interface MatchupBrief {
  me: Civ;
  enemy: Civ;
  enemyPlaybook?: Playbook;
  myPlaybook?: Playbook;
  ages: AgeBrief[];
}

const BRIEF_AGES: Age[] = [2, 3, 4];
const MAX_THREATS_PER_AGE = 5;
// Units that rarely decide fights and would crowd out the real threats.
const IGNORED_LINES = new Set(["scout", "battering-ram", "siege-tower"]);

/** Unit lines the enemy unlocks in this age, unique units first. */
function newThreats(enemyRoster: Unit[], earlierLines: Set<string>): Unit[] {
  return enemyRoster
    .filter((u) => !IGNORED_LINES.has(u.baseId) && !earlierLines.has(u.baseId))
    .sort((a, b) => Number(b.unique) - Number(a.unique) || b.costs.total - a.costs.total)
    .slice(0, MAX_THREATS_PER_AGE);
}

/** Builds the brief for playing `myCivId` against `enemyCivId`. */
export function buildBrief(myCivId: string, enemyCivId: string, pool: Unit[] = allUnits): MatchupBrief | null {
  const me = getCiv(myCivId);
  const enemy = getCiv(enemyCivId);
  if (!me || !enemy) return null;

  const ages = BRIEF_AGES.map((age) => {
    const myRoster = rosterAt(me, age, pool);
    const enemyRoster = rosterAt(enemy, age, pool);
    // The first brief age also lists Dark Age unique units (Berserkers,
    // Samurai), since no earlier section shows them.
    const earlier = rosterAt(enemy, (age - 1) as Age, pool).filter((u) => !(age === BRIEF_AGES[0] && u.unique));
    const earlierLines = new Set(earlier.map((u) => u.baseId));
    return {
      age,
      threats: newThreats(enemyRoster, earlierLines).map((unit) => ({ enemy: unit, counters: rankCounters(unit, myRoster) })),
    };
  });

  return { me, enemy, enemyPlaybook: getPlaybook(enemy.id), myPlaybook: getPlaybook(me.id), ages };
}
