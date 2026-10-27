import type { ApiGame, ApiPlayer } from "./aoe4world";

/** Games shorter than this count as decided by early aggression. */
export const SHORT_GAME_SECONDS = 15 * 60;

export interface CivHabit {
  civ: string;
  games: number;
  share: number;
  winRate: number;
}

export interface PlayerProfile {
  games: number;
  winRate: number;
  /** Most played civs first. */
  civs: CivHabit[];
  medianDuration: number | null;
  /** Share of finished games that ended before SHORT_GAME_SECONDS. */
  shortGameShare: number;
  shortGameWinRate: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function findPlayer(game: ApiGame, profileId: number): ApiPlayer | undefined {
  return game.teams.flat().find((t) => t.player.profile_id === profileId)?.player;
}

/**
 * Sums up a player's habits from their recent finished games: which civs they
 * pick, how often they win, and how often their games end early.
 */
export function summarizePlayer(games: ApiGame[], profileId: number): PlayerProfile | null {
  const finished = games
    .filter((g) => !g.ongoing && g.duration)
    .map((g) => ({ game: g, player: findPlayer(g, profileId) }))
    .filter((r): r is { game: ApiGame; player: ApiPlayer } => r.player?.result === "win" || r.player?.result === "loss");
  if (finished.length === 0) return null;

  const wins = (rows: typeof finished) => rows.filter((r) => r.player.result === "win").length;

  const byCiv = new Map<string, typeof finished>();
  for (const row of finished) byCiv.set(row.player.civilization, [...(byCiv.get(row.player.civilization) ?? []), row]);
  const civs = [...byCiv.entries()]
    .map(([civ, rows]) => ({ civ, games: rows.length, share: rows.length / finished.length, winRate: wins(rows) / rows.length }))
    .sort((a, b) => b.games - a.games);

  const short = finished.filter((r) => r.game.duration! < SHORT_GAME_SECONDS);

  return {
    games: finished.length,
    winRate: wins(finished) / finished.length,
    civs,
    medianDuration: median(finished.map((r) => r.game.duration!)),
    shortGameShare: short.length / finished.length,
    shortGameWinRate: short.length > 0 ? wins(short) / short.length : null,
  };
}
