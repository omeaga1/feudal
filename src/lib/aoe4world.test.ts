import { describe, expect, it } from "vitest";
import { fetchLastGame, fetchMatchupStat, parseMatch, type ApiGame, type FetchFn } from "./aoe4world";

const game: ApiGame = {
  game_id: 257661876,
  started_at: "2026-10-27T15:41:05.000Z",
  map: "Dry Arabia",
  kind: "rm_1v1",
  leaderboard: "rm_solo",
  patch: 11308,
  ongoing: true,
  just_finished: false,
  teams: [
    [{ player: { profile_id: 1, name: "Me", civilization: "english", rating: 1200 } }],
    [{ player: { profile_id: 2, name: "Them", civilization: "holy_roman_empire", rating: null } }],
  ],
};

const jsonFetch =
  (body: unknown, seen: string[] = []): FetchFn =>
  async (url) => {
    seen.push(url);
    return new Response(JSON.stringify(body), { status: 200 });
  };

describe("parseMatch", () => {
  it("separates the player from their opponents", () => {
    const match = parseMatch(game, 1)!;
    expect(match.me.civ).toBe("english");
    expect(match.opponents.map((o) => o.civ)).toEqual(["holy_roman_empire"]);
    expect(match.allies).toEqual([]);
    expect(match.ongoing).toBe(true);
  });

  it("works from the other side too", () => {
    expect(parseMatch(game, 2)!.opponents[0].name).toBe("Me");
  });

  it("returns null when the player is not in the game", () => {
    expect(parseMatch(game, 999)).toBeNull();
  });
});

describe("API calls", () => {
  it("polls the player's last game", async () => {
    const seen: string[] = [];
    const match = await fetchLastGame(jsonFetch(game, seen), 1);
    expect(seen[0]).toBe("https://aoe4world.com/api/v0/players/1/games/last");
    expect(match?.gameId).toBe(257661876);
  });

  it("throws on HTTP errors", async () => {
    const failing: FetchFn = async () => new Response("", { status: 503 });
    await expect(fetchLastGame(failing, 1)).rejects.toThrow("503");
  });

  it("finds a matchup row in either response shape", async () => {
    const row = {
      civilization: "english",
      other_civilization: "french",
      win_rate: 49.2,
      games_count: 100,
      duration_median: 1300,
    };
    expect(await fetchMatchupStat(jsonFetch([row]), "english", "french")).toEqual(row);
    expect(await fetchMatchupStat(jsonFetch({ data: [row] }), "english", "french")).toEqual(row);
    expect(await fetchMatchupStat(jsonFetch([row]), "french", "english")).toBeNull();
  });
});
