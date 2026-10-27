import { useEffect, useMemo, useState } from "react";
import { fetchCivStats, fetchMatchupStat, fetchRecentGames, type CivStat, type MatchupStat } from "../lib/aoe4world";
import { buildBrief } from "../lib/brief";
import { AGE_NAMES, getCiv } from "../lib/gameData";
import { appFetch } from "../lib/http";
import { summarizePlayer, type PlayerProfile } from "../lib/opponent";
import { isStale, type Playbook } from "../lib/playbooks";
import { landmarkChoices } from "../lib/scouting";
import { civTempo, TEMPO_LABELS } from "../lib/tempo";

interface Props {
  myCivId: string;
  enemyCivId: string;
  opponentName?: string;
  /** Set during a live match to show the enemy player's habits. */
  opponentProfileId?: number;
  /** The live game's build, used to flag playbooks written for an older patch. */
  gameBuild?: number;
}

// Civ stats change slowly, so fetch them once per app session.
let civStatsRequest: Promise<CivStat[]> | null = null;
function loadCivStats(): Promise<CivStat[]> {
  civStatsRequest ??= fetchCivStats(appFetch).catch((err) => {
    civStatsRequest = null;
    throw err;
  });
  return civStatsRequest;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function PlayerHabits({ name, profile }: { name: string; profile: PlayerProfile }) {
  const top = profile.civs.slice(0, 3);
  return (
    <section className="panel">
      <h3>{name}'s habits</h3>
      <p>
        Won {percent(profile.winRate)} of their last {profile.games} ranked games. Most played:{" "}
        {top.map((c) => `${getCiv(c.civ)?.name ?? c.civ} ${percent(c.share)} (wins ${percent(c.winRate)})`).join(", ")}.
      </p>
      <p className={profile.shortGameShare >= 0.4 ? "warn" : undefined}>
        {percent(profile.shortGameShare)} of their games end before 15 minutes
        {profile.shortGameWinRate !== null && <>, and they win {percent(profile.shortGameWinRate)} of those</>}.
        {profile.medianDuration !== null && <> Their games usually last about {formatMinutes(profile.medianDuration)}.</>}
      </p>
    </section>
  );
}

function PlaybookBadge({ playbook, gameBuild }: { playbook: Playbook; gameBuild?: number }) {
  if (isStale(playbook, gameBuild)) return <span className="pill draft">Older patch</span>;
  return playbook.status === "draft" ? <span className="pill draft">Draft</span> : null;
}

function GamePlan({ civName, playbook, gameBuild }: { civName: string; playbook: Playbook; gameBuild?: number }) {
  const pairings = playbook.pairings ?? [];
  const wins = playbook.winConditions ?? [];
  if (pairings.length === 0 && wins.length === 0) return null;
  return (
    <section className="panel">
      <h3>
        Your game plan as {civName}
        <PlaybookBadge playbook={playbook} gameBuild={gameBuild} />
      </h3>
      {pairings.length > 0 && (
        <ul className="plan">
          {pairings.map((p) => (
            <li key={p.units}>
              <b>{p.units}.</b> {p.why}
            </li>
          ))}
        </ul>
      )}
      {wins.length > 0 && (
        <p>
          <b>How {civName} wins:</b> {wins.map((w) => w.detail).join(" ")}
        </p>
      )}
    </section>
  );
}

function formatMinutes(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

export function BriefView({ myCivId, enemyCivId, opponentName, opponentProfileId, gameBuild }: Props) {
  const brief = useMemo(() => buildBrief(myCivId, enemyCivId), [myCivId, enemyCivId]);
  const scouting = useMemo(() => {
    const enemy = getCiv(enemyCivId);
    return enemy ? landmarkChoices(enemy) : [];
  }, [enemyCivId]);
  const [stat, setStat] = useState<MatchupStat | null | "unavailable">(null);
  const [civStats, setCivStats] = useState<CivStat[] | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCivStats()
      .then((s) => !cancelled && setCivStats(s))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    if (opponentProfileId === undefined) return;
    fetchRecentGames(appFetch, opponentProfileId)
      .then((games) => !cancelled && setProfile(summarizePlayer(games, opponentProfileId)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [opponentProfileId]);

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
  const { me, enemy, enemyPlaybook, myPlaybook } = brief;
  const tempo = civStats ? civTempo(enemy.id, civStats) : null;

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
        {tempo && (
          <p>
            <span className={`pill tempo ${tempo.tempo}`}>{TEMPO_LABELS[tempo.tempo]}</span>{" "}
            <span className="muted">
              {enemy.name} games last about {formatMinutes(tempo.medianDuration)}, against{" "}
              {formatMinutes(tempo.ladderMedian)} for a typical civ.
            </span>
          </p>
        )}
        <p className="muted">{enemyPlaybook?.summary ?? enemy.description}</p>
      </section>

      {profile && <PlayerHabits name={opponentName ?? "Your opponent"} profile={profile} />}

      {scouting.length > 0 && (
        <section className="panel">
          <h3>What to scout for</h3>
          <p className="muted">Each age-up, {enemy.name} builds one of these landmarks. Spot which one to read their plan.</p>
          <div className="stack">
            {scouting.map((choice) => (
              <div key={choice.advancingTo}>
                <b>Going to {AGE_NAMES[choice.advancingTo]}</b>
                <ul className="landmarks">
                  {choice.options.map((l) => (
                    <li key={l.id}>
                      <b>{l.name}:</b> {l.description.replace(/\n/g, " ")}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {enemyPlaybook && enemyPlaybook.spikes.length > 0 && (
        <section className="panel">
          <h3>
            When {enemy.name} is dangerous
            <PlaybookBadge playbook={enemyPlaybook} gameBuild={gameBuild} />
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
          {enemyPlaybook.scout && enemyPlaybook.scout.length > 0 && (
            <>
              <b>Signs to scout for</b>
              <ul className="plan">
                {enemyPlaybook.scout.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {enemyPlaybook.winConditions && enemyPlaybook.winConditions.length > 0 && (
            <p>
              <b>How {enemy.name} wins:</b> {enemyPlaybook.winConditions.map((w) => w.detail).join(" ")}
            </p>
          )}
        </section>
      )}

      {myPlaybook && <GamePlan civName={me.name} playbook={myPlaybook} gameBuild={gameBuild} />}

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
