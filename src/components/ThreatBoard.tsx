import { AGE_NAMES } from "../lib/gameData";
import type { MatchupBrief } from "../lib/brief";

/** Each age's new enemy units with the units that beat them, as icons: their unit, an arrow, your answers. */
export function ThreatBoard({ brief }: { brief: MatchupBrief }) {
  const ages = brief.ages.filter((a) => a.threats.length > 0);
  if (ages.length === 0) return null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Their units → your answer</h3>
      </div>
      <div className="threat-ages">
        {ages.map(({ age, threats }) => (
          <div key={age} className="threat-age">
            <div className="threat-age-name">{AGE_NAMES[age]}</div>
            <div className="threat-list">
              {threats.map(({ enemy, counters }) => (
                <div key={enemy.id} className={enemy.unique ? "threat unique" : "threat"}>
                  <span className="threat-enemy" title={enemy.name}>
                    <img src={enemy.icon} alt={enemy.name} loading="lazy" />
                    <span>{enemy.name}</span>
                  </span>
                  <span className="threat-arrow" aria-hidden="true">
                    ➜
                  </span>
                  <span className="threat-counters">
                    {counters.length === 0 ? (
                      <span className="muted small">Mix units</span>
                    ) : (
                      counters.slice(0, 3).map((c) => <img key={c.unit.id} src={c.unit.icon} alt={c.unit.name} title={c.unit.name} loading="lazy" />)
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
