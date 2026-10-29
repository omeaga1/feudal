import { describe, expect, it } from "vitest";
import type { ApiGame } from "./aoe4world";
import { clock, gameRows, mapRecords, parseLeague, playedModes, ratingSeries, timeAgo, type PlayerDetails } from "./playerStats";

const game = (id: number, map: string, result: string, civ = "english"): ApiGame => ({
  game_id: id,
  started_at: "2026-10-28T10:00:00.000Z",
  duration: 997,
  map,
  kind: "rm_1v1",
  leaderboard: "rm_solo",
  patch: 11308,
  ongoing: false,
  just_finished: false,
  teams: [
    [{ player: { profile_id: 1, name: "Me", civilization: civ, rating: 1200, result, rating_diff: result === "win" ? 12 : -11 } as never }],
    [{ player: { profile_id: 2, name: "Them", civilization: "french", rating: 1210, result: result === "win" ? "loss" : "win" } }],
  ],
});

describe("player stats", () => {
  it("names leagues", () => {
    expect(parseLeague("conqueror_3")).toEqual({ league: "conqueror", name: "Conqueror", tier: 3 });
    expect(parseLeague("unranked").league).toBe("unranked");
    expect(parseLeague(null).name).toBe("Unranked");
  });

  it("orders rating history oldest first", () => {
    expect(ratingSeries({ games_count: 2, wins_count: 1, losses_count: 1, rating_history: { "200": { rating: 900 }, "100": { rating: 850 } } })).toEqual([
      { t: 100, rating: 850 },
      { t: 200, rating: 900 },
    ]);
  });

  it("reads games from the player's side and totals maps", () => {
    const rows = gameRows([game(1, "Dry Arabia", "win"), game(2, "Dry Arabia", "loss"), game(3, "Lipany", "win")], 1);
    expect(rows[0]).toMatchObject({ result: "win", civ: "english", ratingDiff: 12, opponents: [{ name: "Them", civ: "french" }] });
    expect(mapRecords(rows)).toEqual([
      { map: "Dry Arabia", games: 2, wins: 1 },
      { map: "Lipany", games: 1, wins: 1 },
    ]);
    expect(gameRows([game(4, "x", "win")], 99)).toEqual([]);
  });

  it("lists only modes with games", () => {
    const player = { profile_id: 1, name: "Me", modes: { rm_solo: { games_count: 3, wins_count: 2, losses_count: 1 }, rm_team: null, qm_1v1: { games_count: 0, wins_count: 0, losses_count: 0 } } } as PlayerDetails;
    expect(playedModes(player).map((m) => m.id)).toEqual(["rm_solo"]);
  });

  it("formats times", () => {
    expect(clock(997)).toBe("16:37");
    const now = Date.parse("2026-10-28T12:00:00Z");
    expect(timeAgo("2026-10-28T11:55:00Z", now)).toBe("5m ago");
    expect(timeAgo("2026-10-28T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-10-25T12:00:00Z", now)).toBe("3d ago");
  });
});
