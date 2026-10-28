import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { fetchCivStats, fetchMatchupStat, fetchRecentGames, type CivStat, type MatchupStat } from "../lib/aoe4world";
import { buildBrief } from "../lib/brief";
import { getCiv } from "../lib/gameData";
import { appFetch } from "../lib/http";
import { summarizePlayer, type PlayerProfile } from "../lib/opponent";
import { civTempo, TEMPO_LABELS } from "../lib/tempo";
import { DangerTimeline } from "./DangerTimeline";
import { MapPanel } from "./MapPanel";
import { TheirPlan } from "./TheirPlan";
import { ThreatBoard } from "./ThreatBoard";
import { YourPlan } from "./YourPlan";

interface Props {
  myCivId: string;
  enemyCivId: string;
  opponentName?: string;
  /** Set during a live match to show the enemy player's habits. */
  opponentProfileId?: number;
  /** The live game's build, used to flag plans written for an older patch. */
  gameBuild?: number;
  /** The map being played, for map notes and per-map win rates. */
  mapName?: string;
}

// Civ stats change slowly, so fetch them once per app session.
let civStatsRequest: Promise<CivStat[]> | null = null;
export function loadCivStats(): Promise<CivStat[]> {
  civStatsRequest ??= fetchCivStats(appFetch).catch((err) => {
    civStatsRequest = null;
    throw err;
  });
  return civStatsRequest;
}

function minutes(seconds: number): string {
  return `${Math.round(seconds / 60)}m`;
}

/** A ring that fills to a percentage: green above 50, red below. */
export function WinRing({ value, label }: { value: number | null; label: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const tone = value === null ? "" : value >= 52 ? "good" : value <= 48 ? "bad" : "even";
  return (
    <div className={`win-ring ${tone}`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="ring-bg" />
        {value !== null && (
          <motion.circle
            cx="32"
            cy="32"
            r={r}
            className="ring-fill"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - value / 100) }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        )}
      </svg>
      <span className="ring-value">{value === null ? "–" : `${Math.round(value)}%`}</span>
      <span className="ring-label">{label}</span>
    </div>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function StatStrip({ myCivId, enemyCivId }: { myCivId: string; enemyCivId: string }) {
  const [stat, setStat] = useState<MatchupStat | null | "unavailable">(null);
  const [civStats, setCivStats] = useState<CivStat[] | null>(null);

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
    setStat(null);
    fetchMatchupStat(appFetch, myCivId, enemyCivId)
      .then((s) => !cancelled && setStat(s ?? "unavailable"))
      .catch(() => !cancelled && setStat("unavailable"));
    return () => {
      cancelled = true;
    };
  }, [myCivId, enemyCivId]);

  const tempo = civStats ? civTempo(enemyCivId, civStats) : null;
  const theirs = civStats?.find((c) => c.civilization === enemyCivId);
  const row = stat && stat !== "unavailable" ? stat : null;

  return (
    <section className="panel stat-strip">
      <WinRing value={row?.win_rate ?? null} label="Your win rate" />
      <div className="stats">
        <Stat value={row ? row.games_count.toLocaleString() : "–"} label="Games this patch" />
        <Stat value={row ? minutes(row.duration_median) : "–"} label="Typical length" />
        {theirs && <Stat value={`${theirs.win_rate.toFixed(1)}%`} label={`${getCiv(enemyCivId)?.name ?? "Their"} overall`} />}
        {tempo && <Stat value={TEMPO_LABELS[tempo.tempo]} label="Their tempo" tone={tempo.tempo} />}
      </div>
      {stat === "unavailable" && <span className="muted small">Matchup stats aren't available right now.</span>}
    </section>
  );
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function PlayerHabits({ name, profile }: { name: string; profile: PlayerProfile }) {
  return (
    <section className="panel habits">
      <div className="panel-head">
        <h3>{name}</h3>
      </div>
      <div className="stats">
        <Stat value={percent(profile.winRate)} label={`Won, last ${profile.games}`} />
        <Stat value={percent(profile.shortGameShare)} label="Games under 15m" tone={profile.shortGameShare >= 0.4 ? "early-pressure" : undefined} />
        {profile.medianDuration !== null && <Stat value={minutes(profile.medianDuration)} label="Usual length" />}
      </div>
      <div className="habit-civs">
        {profile.civs.slice(0, 3).map((c) => (
          <span key={c.civ} className="habit-civ">
            <b>{getCiv(c.civ)?.name ?? c.civ}</b> {percent(c.share)}
          </span>
        ))}
      </div>
    </section>
  );
}

/** The matchup at a glance: stats, your branching plan, their plan, and unit answers. */
export function BriefView({ myCivId, enemyCivId, opponentName, opponentProfileId, gameBuild, mapName }: Props) {
  const brief = useMemo(() => buildBrief(myCivId, enemyCivId), [myCivId, enemyCivId]);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);

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

  if (!brief) return <section className="panel error">No data for this matchup yet.</section>;
  const { enemy, enemyPlaybook } = brief;

  return (
    <div className="brief">
      <div className="brief-top">
        <StatStrip myCivId={myCivId} enemyCivId={enemyCivId} />
        <DangerTimeline myCivId={myCivId} enemyCivId={enemyCivId} />
      </div>

      <YourPlan civ={myCivId} gameBuild={gameBuild} />

      <div className="brief-split">
        <TheirPlan civ={enemyCivId} />
        <div className="stack">
          {profile && <PlayerHabits name={opponentName ?? "Your opponent"} profile={profile} />}
          {mapName && <MapPanel mapName={mapName} myCivId={myCivId} enemyCivId={enemyCivId} />}
          {enemyPlaybook?.howToBeat && enemyPlaybook.howToBeat.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <h3>Beating {enemy.name}</h3>
              </div>
              <ul className="tight">
                {enemyPlaybook.howToBeat.slice(0, 3).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <ThreatBoard brief={brief} />
    </div>
  );
}
