// Client for the public AoE4 World API (https://aoe4world.com/api).
// This is the only live source Feudal uses: it never reads the game's
// memory, files, network traffic or screen.

export const API_BASE = "https://aoe4world.com/api/v0";
export const USER_AGENT = "Feudal desktop companion (https://github.com/omeaga1/feudal)";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface ApiPlayer {
  profile_id: number;
  name: string;
  civilization: string;
  civilization_randomized?: boolean;
  rating?: number | null;
  mmr?: number | null;
  result?: string | null;
}

export interface ApiGame {
  game_id: number;
  started_at: string;
  /** Seconds; null while the game is running. */
  duration?: number | null;
  map: string;
  kind: string;
  leaderboard: string;
  patch: number;
  ongoing: boolean;
  just_finished: boolean;
  teams: { player: ApiPlayer }[][];
}

/**
 * The API is not consistent about team entries: `/games` wraps each player as
 * `{ player: {...} }`, but `/games/last` lists the player objects directly.
 */
type RawTeamEntry = { player: ApiPlayer } | ApiPlayer;
type RawApiGame = Omit<ApiGame, "teams"> & { teams: RawTeamEntry[][] };

/** Brings either team shape to the wrapped `{ player }` form the rest of the app uses. */
export function normalizeGame(game: RawApiGame): ApiGame {
  return {
    ...game,
    teams: game.teams.map((team) => team.map((entry) => ("player" in entry ? entry : { player: entry }))),
  };
}

export interface MatchPlayer {
  profileId: number;
  name: string;
  civ: string;
  rating: number | null;
}

export interface Match {
  gameId: number;
  ongoing: boolean;
  map: string;
  kind: string;
  leaderboard: string;
  patch: number;
  startedAt: string;
  me: MatchPlayer;
  allies: MatchPlayer[];
  opponents: MatchPlayer[];
}

function toPlayer(p: ApiPlayer): MatchPlayer {
  return { profileId: p.profile_id, name: p.name, civ: p.civilization, rating: p.rating ?? null };
}

/** Splits a game into the given player, their allies and their opponents. */
export function parseMatch(game: ApiGame, profileId: number): Match | null {
  const myTeam = game.teams.find((team) => team.some((t) => t.player.profile_id === profileId));
  if (!myTeam) return null;
  const me = myTeam.find((t) => t.player.profile_id === profileId)!.player;
  return {
    gameId: game.game_id,
    ongoing: game.ongoing,
    map: game.map,
    kind: game.kind,
    leaderboard: game.leaderboard,
    patch: game.patch,
    startedAt: game.started_at,
    me: toPlayer(me),
    allies: myTeam.filter((t) => t.player.profile_id !== profileId).map((t) => toPlayer(t.player)),
    opponents: game.teams.filter((team) => team !== myTeam).flat().map((t) => toPlayer(t.player)),
  };
}

async function getJson<T>(fetchFn: FetchFn, path: string): Promise<T> {
  const res = await fetchFn(`${API_BASE}${path}`, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`AoE4 World returned HTTP ${res.status} for ${path}`);
  return (await res.json()) as T;
}

/** The player's most recent game. AoE4 World caches this endpoint for polling. */
export async function fetchLastGame(fetchFn: FetchFn, profileId: number): Promise<Match | null> {
  const game = await getJson<RawApiGame>(fetchFn, `/players/${profileId}/games/last`);
  return parseMatch(normalizeGame(game), profileId);
}

/** A player's most recent finished and ongoing games, newest first. */
export async function fetchRecentGames(
  fetchFn: FetchFn,
  profileId: number,
  leaderboard = "rm_solo",
  limit = 50,
): Promise<ApiGame[]> {
  const body = await getJson<{ games: RawApiGame[] }>(
    fetchFn,
    `/players/${profileId}/games?leaderboard=${leaderboard}&limit=${limit}`,
  );
  return body.games.map(normalizeGame);
}

export interface CivStat {
  civilization: string;
  win_rate: number;
  pick_rate: number;
  games_count: number;
  duration_median: number;
}

/** Ranked 1v1 win rate, pick rate and median game length for every civ. */
export async function fetchCivStats(fetchFn: FetchFn): Promise<CivStat[]> {
  const body = await getJson<CivStat[] | { data: CivStat[] }>(fetchFn, "/stats/rm_solo/civilizations");
  return Array.isArray(body) ? body : body.data;
}

export interface MatchupStat {
  civilization: string;
  other_civilization: string;
  win_rate: number;
  games_count: number;
  duration_median: number;
}

/** Ranked 1v1 win rate and median game length for one civ pairing, if AoE4 World has it. */
export async function fetchMatchupStat(
  fetchFn: FetchFn,
  civ: string,
  otherCiv: string,
): Promise<MatchupStat | null> {
  const body = await getJson<MatchupStat[] | { data: MatchupStat[] }>(fetchFn, "/stats/rm_solo/matchups");
  const rows = Array.isArray(body) ? body : body.data;
  return rows.find((r) => r.civilization === civ && r.other_civilization === otherCiv) ?? null;
}
