import { useEffect, useMemo, useState } from "react";
import { fetchMatchupStat, type MatchupStat } from "../lib/aoe4world";
import { buildBrief } from "../lib/brief";
import { AGE_NAMES } from "../lib/gameData";
import { appFetch } from "../lib/http";

interface Props {
  myCivId: string;
  enemyCivId: string;
  opponentName?: string;
}

function formatMinutes(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

export function BriefView({ myCivId, enemyCivId, opponentName }: Props) {
  const brief = useMemo(() => buildBrief(myCivId, enemyCivId), [myCivId, enemyCivId]);
  const [stat, setStat] = useState<MatchupStat | null | "unavailable">(null);

  useEffect(() => {
    let cancelled = false;
    setStat(null);
    fetchMatchupStat(appFetch, myCivId, enemyCivId)
      .then((s) => !cancelled && setStat(s ?? "unavailable"))
      .catch(() => !cancelled && setStat("unavailable"));
    return () => {
      cancelled = true;
    };
  }, [myCivId, enemyCivId]);

  if (!brief) return <section className="panel error">No data for this matchup yet.</section>;
  const { me, enemy, enemyPlaybook } = brief;

  return (
    <div className="stack">
      <section className="panel">
        <h2>
          {me.name} vs {enemy.name}
          {opponentName && <span className="muted"> · {opponentName}</span>}
        </h2>
        {stat === "unavailable" ? (
          <p className="muted">Matchup stats aren't available right now.</p>
        ) : stat ? (
          <p>
            Ranked 1v1: you win <b>{stat.win_rate.toFixed(1)}%</b> of {stat.games_count.toLocaleString()} games. These
            games usually last about {formatMinutes(stat.duration_median)}.
          </p>
        ) : (
          <p className="muted">Loading matchup stats from AoE4 World…</p>
        )}
        <p className="muted">{enemyPlaybook?.summary ?? enemy.description}</p>
      </section>

      {enemyPlaybook && enemyPlaybook.spikes.length > 0 && (
        <section className="panel">
          <h3>
            When {enemy.name} is dangerous
            {enemyPlaybook.status === "draft" && <span className="pill draft">Draft</span>}
          </h3>
          <ul className="spikes">
            {enemyPlaybook.spikes.map((s) => (
              <li key={s.label}>
                <span className="pill">{AGE_NAMES[s.age]}</span>
                <div>
                  <b>{s.label}.</b> {s.detail}
                  <div className="answer">{s.answer}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {brief.ages.map(({ age, threats }) =>
        threats.length === 0 ? null : (
          <section className="panel" key={age}>
            <h3>{AGE_NAMES[age]}: what they add, and your answer</h3>
            <table className="counters">
              <thead>
                <tr>
                  <th>Their unit</th>
                  <th>Build</th>
                </tr>
              </thead>
              <tbody>
                {threats.map(({ enemy: unit, counters }) => (
                  <tr key={unit.id}>
                    <td>
                      {unit.name}
                      {unit.unique && <span className="pill">Unique</span>}
                    </td>
                    <td>
                      {counters.length === 0
                        ? "No clear counter by stats alone. Mix units or fight under towers."
                        : counters.map((c) => c.unit.name).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ),
      )}
    </div>
  );
}
