import { AGE_NAMES, getCiv } from "../lib/gameData";
import { getGamePlan, landmarkIcon, STYLE_LABELS } from "../lib/gamePlans";
import { getPlaybook } from "../lib/playbooks";
import { UnitIcons } from "./PlanTree";

/**
 * What the enemy civ is likely to do, read from the landmark they build:
 * each Feudal and Castle path, when it lands, and what it fields. Then their
 * power spikes with the one-line answer.
 */
export function TheirPlan({ civ }: { civ: string }) {
  const plan = getGamePlan(civ);
  const playbook = getPlaybook(civ);
  const name = getCiv(civ)?.name ?? civ;

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Scout their landmark, know their plan</h3>
      </div>
      {plan ? (
        <div className="their-paths">
          {plan.feudal.map((f) => (
            <div key={f.id} className={`their-path style-${f.style}`}>
              <div className="their-feudal">
                <Landmark name={f.landmark} />
                <div>
                  <div className="their-name">
                    {f.name} <span className="style-tag">{STYLE_LABELS[f.style]}</span>
                  </div>
                  <div className="muted small">
                    Feudal at <b>{f.ageUp}</b>
                  </div>
                </div>
                <UnitIcons names={f.army} civ={civ} size="md" />
              </div>
              <div className="their-castles">
                {f.castle.map((c) => (
                  <div key={c.id} className={`their-castle style-${c.style}`}>
                    <Landmark name={c.landmark} small />
                    <span className="their-castle-name">{c.name}</span>
                    <span className="age-time">{c.ageUp}</span>
                    <UnitIcons names={c.army} civ={civ} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No build plan for {name} yet.</p>
      )}
      {playbook && playbook.spikes.length > 0 && (
        <div className="spike-row">
          {playbook.spikes.map((s) => (
            <div key={s.label} className={`spike age-${s.age}`} title={s.detail}>
              <span className="spike-age">{AGE_NAMES[s.age]}</span>
              <span className="spike-label">{s.label}</span>
              <span className="spike-answer">{s.answer}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Landmark({ name, small }: { name?: string; small?: boolean }) {
  if (!name) return null;
  const icon = landmarkIcon(name);
  return (
    <span className={small ? "landmark small" : "landmark"} title={name}>
      {icon ? <img src={icon} alt={name} loading="lazy" /> : <span className="landmark-fallback">{name.slice(0, 1)}</span>}
      {!small && <span className="landmark-name">{name}</span>}
    </span>
  );
}
