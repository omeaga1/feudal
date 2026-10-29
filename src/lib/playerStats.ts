import { API_BASE, fetchRecentGames, USER_AGENT, type ApiGame, type FetchFn } from "./aoe4world";

/** The ladders a player profile can hold, in the order Feudal shows them. */
export const MODES = [
  { id: "rm_solo", label: "Ranked 1v1", games: "rm_solo" },
  { id: "rm_team", label: "Ranked team", games: "rm_team" },
  { id: "qm_1v1", label: "Quick match 1v1", games: "qm_1v1" },
] as const;
export type ModeId = (typeof MODES)[number]["id"];

export interface CivRecord {
  civilization: string;
  win_rate: number;
  pick_rate: number;
  games_count: number;
}

export interface SeasonRecord {
  season: number;
  rating?: number | null;
  rank?: number | null;
  rank_level?: string | null;
  games_count: number;
  wins_count: number;
  win_rate?: number | null;
}

export interface ModeStats {
  rating?: number | null;
  max_rating?: number | null;
  rank?: number | null;
  rank_level?: string | null;
  streak?: number | null;
  games_count: number;
  wins_count: number;
  losses_count: number;
  win_rate?: number | null;
  last_game_at?: string | null;
  season?: number;
  /** Keyed by Unix seconds. */
  rating_history?: Record<string, { rating: number; games_count?: number }>;
  civilizations?: CivRecord[];
  previous_seasons?: SeasonRecord[];
}

export interface PlayerDetails {
  profile_id: number;
  name: string;
  steam_id?: string | null;
  site_url?: string;
  country?: string | null;
  avatars?: { small?: string | null; medium?: string | null; full?: string | null };
  social?: Record<string, string>;
  modes: Partial<Record<string, ModeStats | null>>;
}

export async function fetchPlayer(fetchFn: FetchFn, profileId: number): Promise<PlayerDetails> {
  const res = await fetchFn(`${API_BASE}/players/${profileId}`, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`AoE4 World returned HTTP ${res.status}`);
  return (await res.json()) as PlayerDetails;
}

export function fetchModeGames(fetchFn: FetchFn, profileId: number, mode: ModeId, limit = 50): Promise<ApiGame[]> {
  return fetchRecentGames(fetchFn, profileId, MODES.find((m) => m.id === mode)?.games ?? mode, limit);
}

/** The modes this player has played, with their stats. */
export function playedModes(player: PlayerDetails): { id: ModeId; label: string; stats: ModeStats }[] {
  return MODES.flatMap((m) => {
    const stats = player.modes[m.id];
    return stats && stats.games_count > 0 ? [{ id: m.id, label: m.label, stats }] : [];
  });
}

export interface League {
  /** "conqueror", "diamond", ... or "unranked". */
  league: string;
  name: string;
  tier: number | null;
}

/** "conqueror_3" -> Conqueror III. */
export function parseLeague(rankLevel: string | null | undefined): League {
  const match = rankLevel?.match(/^([a-z]+)_(\d)$/);
  if (!match) return { league: "unranked", name: "Unranked", tier: null };
  const league = match[1];
  return { league, name: league[0].toUpperCase() + league.slice(1), tier: Number(match[2]) };
}

export const ROMAN = ["", "I", "II", "III", "IV"];

/** Rating points over time, oldest first. */
export function ratingSeries(stats: ModeStats): { t: number; rating: number }[] {
  return Object.entries(stats.rating_history ?? {})
    .map(([t, v]) => ({ t: Number(t), rating: v.rating }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.rating))
    .sort((a, b) => a.t - b.t);
}

export interface GameRow {
  gameId: number;
  startedAt: string;
  map: string;
  duration: number | null;
  result: "win" | "loss" | null;
  civ: string;
  ratingDiff: number | null;
  rating: number | null;
  opponents: { profileId: number; name: string; civ: string; rating: number | null }[];
}

type GamePlayer = ApiGame["teams"][number][number]["player"] & { rating_diff?: number | null };

/** One line per game, seen from the given player's side. */
export function gameRows(games: ApiGame[], profileId: number): GameRow[] {
  return games.flatMap((g) => {
    const myTeam = g.teams.find((team) => team.some((t) => t.player.profile_id === profileId));
    const me = myTeam?.find((t) => t.player.profile_id === profileId)?.player as GamePlayer | undefined;
    if (!myTeam || !me) return [];
    const result = me.result === "win" || me.result === "loss" ? me.result : null;
    return [
      {
        gameId: g.game_id,
        startedAt: g.started_at,
        map: g.map,
        duration: g.duration ?? null,
        result,
        civ: me.civilization,
        ratingDiff: me.rating_diff ?? null,
        rating: me.rating ?? null,
        opponents: g.teams
          .filter((team) => team !== myTeam)
          .flat()
          .map(({ player: p }) => ({ profileId: p.profile_id, name: p.name, civ: p.civilization, rating: p.rating ?? null })),
      },
    ];
  });
}

export interface MapRecord {
  map: string;
  games: number;
  wins: number;
}

/** Wins and games per map from recent games, most played first. */
export function mapRecords(rows: GameRow[]): MapRecord[] {
  const byMap = new Map<string, MapRecord>();
  for (const r of rows) {
    if (!r.result) continue;
    const rec = byMap.get(r.map) ?? { map: r.map, games: 0, wins: 0 };
    rec.games += 1;
    if (r.result === "win") rec.wins += 1;
    byMap.set(r.map, rec);
  }
  return [...byMap.values()].sort((a, b) => b.games - a.games || a.map.localeCompare(b.map));
}

/** "5m ago", "3h ago", "2d ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** 997 -> "16:37". */
export function clock(seconds: number | null): string {
  if (seconds === null) return "";
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
