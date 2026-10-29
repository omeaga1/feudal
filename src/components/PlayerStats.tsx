import NumberFlow from "@number-flow/react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { motion } from "motion/react";
import { ToggleGroup } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { GiFire, GiSnowflake1 } from "react-icons/gi";
import type { ApiGame } from "../lib/aoe4world";
import { getCiv } from "../lib/gameData";
import { appFetch } from "../lib/http";
import {
  clock,
  fetchModeGames,
  fetchPlayer,
  gameRows,
  mapRecords,
  playedModes,
  ratingSeries,
  timeAgo,
  type ModeId,
  type ModeStats,
  type PlayerDetails,
} from "../lib/playerStats";
import { WinRing } from "./BriefView";
import { Flag } from "./Flag";
import { Avatar, LeagueBadge } from "./PlayerBits";
import { PlayerSearch } from "./ProfileLink";
import { Tip } from "./ui";

const tone = (winRate: number) => (winRate >= 52 ? "good" : winRate <= 48 ? "bad" : "even");
const pct = (wins: number, games: number) => (games ? (wins / games) * 100 : 0);

function Tile({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile-value">{children}</span>
      <span className="stat-tile-label">{label}</span>
      {sub && <span className="stat-tile-sub">{sub}</span>}
    </div>
  );
}

/** Rating over the season: a line with an area under it, and a crosshair on hover. */
function RatingChart({ stats }: { stats: ModeStats }) {
  const series = useMemo(() => ratingSeries(stats), [stats]);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (series.length < 2) return <p className="muted small">Not enough games this season to draw a rating line.</p>;

  const height = 180;
  const pad = { l: 44, r: 12, t: 12, b: 24 };
  const ratings = series.map((p) => p.rating);
  const step = 50;
  const lo = Math.floor((Math.min(...ratings) - 10) / step) * step;
  const hi = Math.ceil((Math.max(...ratings) + 10) / step) * step;
  const t0 = series[0].t;
  const t1 = series[series.length - 1].t;
  const x = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (width - pad.l - pad.r);
  const y = (r: number) => pad.t + (1 - (r - lo) / (hi - lo)) * (height - pad.t - pad.b);
  const ticks = Array.from({ length: 4 }, (_, i) => Math.round(lo + ((hi - lo) * i) / 3));
  const line = series.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.rating).toFixed(1)}`).join(" ");
  const area = `${line} L${x(t1).toFixed(1)},${height - pad.b} L${x(t0).toFixed(1)},${height - pad.b} Z`;
  const date = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const point = hover === null ? series[series.length - 1] : series[hover];

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left + pad.l;
    let best = 0;
    for (let i = 1; i < series.length; i++) if (Math.abs(x(series[i].t) - px) < Math.abs(x(series[best].t) - px)) best = i;
    setHover(best);
  };

  return (
    <div className="rating-chart" ref={wrap}>
      <svg width={width} height={height} role="img" aria-label={`Rating from ${series[0].rating} to ${series[series.length - 1].rating} this season`}>
        <defs>
          <linearGradient id="rating-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={pad.l - 8} y={y(t)} className="chart-label" textAnchor="end" dominantBaseline="middle">
              {t}
            </text>
          </g>
        ))}
        <text x={pad.l} y={height - 6} className="chart-label">
          {date(t0)}
        </text>
        <text x={width - pad.r} y={height - 6} className="chart-label" textAnchor="end">
          {date(t1)}
        </text>
        <path d={area} fill="url(#rating-fill)" />
        <motion.path d={line} className="chart-line" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: "easeOut" }} />
        {hover !== null && <line x1={x(point.t)} x2={x(point.t)} y1={pad.t} y2={height - pad.b} className="chart-cross" />}
        <circle cx={x(point.t)} cy={y(point.rating)} r={5} className="chart-dot" />
        <rect x={pad.l} y={pad.t} width={width - pad.l - pad.r} height={height - pad.t - pad.b} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      <div className="chart-readout">
        <b>{point.rating}</b> <span className="muted">{date(point.t)}</span>
      </div>
    </div>
  );
}

function WinBar({ winRate }: { winRate: number }) {
  return (
    <span className="win-bar">
      <motion.span className={`win-bar-fill ${tone(winRate)}`} initial={{ width: 0 }} animate={{ width: `${winRate}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
      <span className="win-bar-mid" />
    </span>
  );
}

function CivTable({ stats }: { stats: ModeStats }) {
  const [all, setAll] = useState(false);
  const civs = [...(stats.civilizations ?? [])].filter((c) => c.games_count > 0).sort((a, b) => b.games_count - a.games_count);
  if (civs.length === 0) return null;
  const shown = all ? civs : civs.slice(0, 6);
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Civs</h3>
        <span className="muted small">Win rate this season, most played first</span>
      </div>
      <div className="bar-list">
        {shown.map((c) => (
          <div key={c.civilization} className="bar-row">
            <Flag civ={c.civilization} size="sm" />
            <span className="bar-name">{getCiv(c.civilization)?.name ?? c.civilization}</span>
            <span className="bar-count">{c.games_count}</span>
            <WinBar winRate={c.win_rate} />
            <span className={`bar-value ${tone(c.win_rate)}`}>{Math.round(c.win_rate)}%</span>
          </div>
        ))}
      </div>
      {civs.length > 6 && (
        <button type="button" className="link" onClick={() => setAll((a) => !a)}>
          {all ? "Show fewer" : `Show all ${civs.length}`}
        </button>
      )}
    </section>
  );
}

function MapTable({ games, profileId }: { games: ApiGame[]; profileId: number }) {
  const maps = mapRecords(gameRows(games, profileId)).slice(0, 6);
  if (maps.length === 0) return null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Maps</h3>
        <span className="muted small">From the last {games.length} games</span>
      </div>
      <div className="bar-list">
        {maps.map((m) => {
          const wr = pct(m.wins, m.games);
          return (
            <div key={m.map} className="bar-row no-flag">
              <span className="bar-name">{m.map}</span>
              <span className="bar-count">{m.games}</span>
              <WinBar winRate={wr} />
              <span className={`bar-value ${tone(wr)}`}>{Math.round(wr)}%</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RecentGames({ games, profileId, onPlayer }: { games: ApiGame[]; profileId: number; onPlayer: (id: number) => void }) {
  const rows = gameRows(games, profileId).slice(0, 12);
  if (rows.length === 0) return null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Recent games</h3>
      </div>
      <div className="game-list">
        {rows.map((g) => (
          <div key={g.gameId} className={`game-row ${g.result ?? "pending"}`}>
            <span className="game-result">{g.result === "win" ? "W" : g.result === "loss" ? "L" : "…"}</span>
            <span className="game-civs">
              <Flag civ={g.civ} size="sm" />
              <span className="muted small">vs</span>
              {g.opponents.map((o) => (
                <Tip key={o.profileId} label={getCiv(o.civ)?.name ?? o.civ}>
                  <span>
                    <Flag civ={o.civ} size="sm" />
                  </span>
                </Tip>
              ))}
            </span>
            <span className="game-opponent">
              {g.opponents.map((o, i) => (
                <span key={o.profileId}>
                  {i > 0 && ", "}
                  <button type="button" className="link" onClick={() => onPlayer(o.profileId)}>
                    {o.name}
                  </button>
                  {o.rating ? <span className="muted small"> {o.rating}</span> : null}
                </span>
              ))}
            </span>
            <span className="game-map muted">{g.map}</span>
            <span className="game-time muted">{clock(g.duration)}</span>
            <span className={`game-diff ${g.ratingDiff && g.ratingDiff > 0 ? "good" : g.ratingDiff ? "bad" : ""}`}>
              {g.ratingDiff ? `${g.ratingDiff > 0 ? "+" : ""}${g.ratingDiff}` : ""}
            </span>
            <span className="game-ago muted small">{timeAgo(g.startedAt)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Seasons({ stats }: { stats: ModeStats }) {
  const seasons = [...(stats.previous_seasons ?? [])].filter((s) => s.games_count > 0).sort((a, b) => b.season - a.season).slice(0, 8);
  if (seasons.length === 0) return null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Past seasons</h3>
      </div>
      <div className="season-strip">
        {seasons.map((s) => (
          <div key={s.season} className="season-card">
            <span className="season-num">S{s.season}</span>
            <LeagueBadge rankLevel={s.rank_level} />
            <b>{s.rating ?? "–"}</b>
            <span className="muted small">{Math.round(s.win_rate ?? pct(s.wins_count, s.games_count))}% of {s.games_count}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatsBody({ player, onPlayer }: { player: PlayerDetails; onPlayer: (id: number) => void }) {
  const modes = playedModes(player);
  const [mode, setMode] = useState<ModeId | null>(modes[0]?.id ?? null);
  const [games, setGames] = useState<ApiGame[] | null>(null);
  const active = modes.find((m) => m.id === mode) ?? modes[0];

  useEffect(() => {
    setMode(playedModes(player)[0]?.id ?? null);
  }, [player]);

  useEffect(() => {
    let cancelled = false;
    setGames(null);
    if (!active) return;
    fetchModeGames(appFetch, player.profile_id, active.id)
      .then((g) => !cancelled && setGames(g))
      .catch(() => !cancelled && setGames([]));
    return () => {
      cancelled = true;
    };
  }, [player.profile_id, active?.id]);

  const s = active?.stats;
  const streak = s?.streak ?? 0;
  return (
    <div className="stack">
      <section className="panel player-hero">
        <Avatar src={player.avatars?.full ?? player.avatars?.medium} name={player.name} size={84} />
        <div className="player-hero-text">
          <h2>{player.name}</h2>
          <div className="player-hero-meta">
            {player.country && <span className="country">{player.country.toUpperCase()}</span>}
            {player.site_url && (
              <a href={player.site_url} target="_blank" rel="noreferrer" className="muted small">
                AoE4 World <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
          </div>
          {modes.length > 1 && (
            <ToggleGroup.Root className="segmented" type="single" value={active?.id} onValueChange={(v) => v && setMode(v as ModeId)} aria-label="Game mode">
              {modes.map((m) => (
                <ToggleGroup.Item key={m.id} value={m.id} className="segmented-item">
                  {m.id === active?.id && <motion.span layoutId="mode-seg" className="segmented-thumb" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                  <span>{m.label}</span>
                </ToggleGroup.Item>
              ))}
            </ToggleGroup.Root>
          )}
        </div>
        {s && <LeagueBadge rankLevel={s.rank_level} size="lg" />}
      </section>

      {!s ? (
        <section className="panel muted">No ranked or quick-match games on AoE4 World yet.</section>
      ) : (
        <>
          <section className="panel stat-tiles">
            <Tile label="Rating" sub={s.max_rating ? `Season best ${s.max_rating}` : undefined}>
              {s.rating ? <NumberFlow value={s.rating} /> : "–"}
            </Tile>
            <Tile label="Ladder rank">{s.rank ? <>#<NumberFlow value={s.rank} /></> : "–"}</Tile>
            <WinRing value={s.win_rate ?? pct(s.wins_count, s.games_count)} label="Win rate" />
            <Tile label="Record" sub={`${s.games_count} games`}>
              <span className="good">{s.wins_count}</span>
              <span className="muted">–</span>
              <span className="bad">{s.losses_count}</span>
            </Tile>
            <Tile label="Streak">
              <span className={streak > 0 ? "streak hot" : streak < 0 ? "streak cold" : "streak"}>
                {streak > 0 ? <GiFire aria-hidden="true" /> : streak < 0 ? <GiSnowflake1 aria-hidden="true" /> : null}
                {streak === 0 ? "–" : `${Math.abs(streak)} ${streak > 0 ? (streak === 1 ? "win" : "wins") : streak === -1 ? "loss" : "losses"}`}
              </span>
            </Tile>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>Rating history</h3>
            </div>
            <RatingChart stats={s} />
          </section>

          <div className="brief-split">
            <CivTable stats={s} />
            {games ? <MapTable games={games} profileId={player.profile_id} /> : <section className="panel"><span className="skeleton" /></section>}
          </div>

          {games && <RecentGames games={games} profileId={player.profile_id} onPlayer={onPlayer} />}
          <Seasons stats={s} />
        </>
      )}
    </div>
  );
}

/** Ladder stats for the linked player, or anyone looked up by name. */
export function PlayerStats({ profileId }: { profileId: number | null }) {
  const [viewing, setViewing] = useState<number | null>(profileId);
  const [player, setPlayer] = useState<PlayerDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPlayer(null);
    setError(null);
    if (viewing === null) return;
    fetchPlayer(appFetch, viewing)
      .then((p) => !cancelled && setPlayer(p))
      .catch((err) => !cancelled && setError(`Couldn't load this player from AoE4 World: ${err instanceof Error ? err.message : String(err)}`));
    return () => {
      cancelled = true;
    };
  }, [viewing]);

  return (
    <div className="stack">
      <div className="stats-toolbar">
        {viewing !== profileId && profileId !== null && (
          <button type="button" className="button-secondary" onClick={() => setViewing(profileId)}>
            <ArrowLeft size={16} aria-hidden="true" />
            My stats
          </button>
        )}
        <PlayerSearch onPick={(p) => setViewing(p.profileId)} placeholder="Look up any player" />
      </div>
      {viewing === null && <section className="panel muted">Link your profile on the Live tab, or look up any player above.</section>}
      {error && <section className="panel error">{error}</section>}
      {viewing !== null && !player && !error && (
        <section className="panel player-hero">
          <span className="skeleton" style={{ width: 84, height: 84, borderRadius: 12 }} />
          <span className="skeleton" style={{ width: 200 }} />
        </section>
      )}
      {player && <StatsBody player={player} onPlayer={setViewing} />}
    </div>
  );
}
