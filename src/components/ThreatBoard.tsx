import type { MatchupBrief } from "../lib/brief";
import { CounterRow } from "./CounterRow";
import { AgeMark } from "./ui";

/** Each age's new enemy units, each with the units of yours that beat it. */
export function ThreatBoard({ brief }: { brief: MatchupBrief }) {
  const ages = brief.ages.filter((a) => a.threats.length > 0);
  if (ages.length === 0) return null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Their units, your answer</h3>
        <span className="muted small">New enemy units each age, and what to build against them</span>
      </div>
      <div className="threat-ages">
        {ages.map(({ age, threats }) => (
          <div key={age} className="threat-age">
            <div className="threat-age-name">
              <AgeMark age={age} />
            </div>
            <div className="threat-list">
              {threats.map(({ enemy, counters }) => (
                <CounterRow
                  key={enemy.id}
                  enemy={{ name: enemy.name, icon: enemy.icon, unit: enemy }}
                  unique={enemy.unique}
                  answers={counters.slice(0, 3).map((c) => ({ name: c.unit.name, icon: c.unit.icon, unit: c.unit }))}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
