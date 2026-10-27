import { describe, expect, it } from "vitest";
import type { ApiGame, CivStat } from "./aoe4world";
import { getCiv } from "./gameData";
import { summarizePlayer } from "./opponent";
import { landmarkChoices } from "./scouting";
import { civTempo } from "./tempo";

function game(id: number, civ: string, result: "win" | "loss", duration: number | null, ongoing = false): ApiGame {
  return {
    game_id: id,
    started_at: "2026-10-27T12:00:00Z",
    duration,
    map: "Dry Arabia",
    kind: "rm_1v1",
    leaderboard: "rm_solo",
    patch: 1,
    ongoing,
    just_finished: false,
    teams: [
      [{ player: { profile_id: 7, name: "Them", civilization: civ, result } }],
      [{ player: { profile_id: 8, name: "Other", civilization: "english", result: result === "win" ? "loss" : "win" } }],
    ],
  };
}

describe("summarizePlayer", () => {
  const games = [
    game(1, "french", "win", 600),
    game(2, "french", "win", 700),
    game(3, "french", "loss", 1500),
    game(4, "english", "loss", 2000),
    game(5, "french", "win", null, true),
  ];

  it("summarizes civ picks, win rate and early games", () => {
    const profile = summarizePlayer(games, 7)!;
    expect(profile.games).toBe(4);
    expect(profile.winRate).toBe(0.5);
    expect(profile.civs[0]).toMatchObject({ civ: "french", games: 3 });
    expect(profile.shortGameShare).toBe(0.5);
    expect(profile.shortGameWinRate).toBe(1);
    expect(profile.medianDuration).toBe(1100);
  });

  it("ignores ongoing games and returns null with no finished games", () => {
    expect(summarizePlayer([games[4]], 7)).toBeNull();
  });
});

describe("civTempo", () => {
  const stats: CivStat[] = [
    { civilization: "french", win_rate: 52, pick_rate: 8, games_count: 1, duration_median: 1100 },
    { civilization: "english", win_rate: 50, pick_rate: 9, games_count: 1, duration_median: 1300 },
    { civilization: "chinese", win_rate: 49, pick_rate: 5, games_count: 1, duration_median: 1500 },
  ];

  it("flags civs whose games run short or long", () => {
    expect(civTempo("french", stats)?.tempo).toBe("early-pressure");
    expect(civTempo("english", stats)?.tempo).toBe("balanced");
    expect(civTempo("chinese", stats)?.tempo).toBe("long-game");
  });

  it("returns null for a civ with no stats", () => {
    expect(civTempo("rus", stats)).toBeNull();
  });
});

describe("landmarkChoices", () => {
  it("lists HRE's two landmark options at each age-up", () => {
    const choices = landmarkChoices(getCiv("holy_roman_empire")!);
    expect(choices.map((c) => c.advancingTo)).toEqual([2, 3, 4]);
    expect(choices[0].options.map((l) => l.name).sort()).toEqual(["Aachen Chapel", "Meinwerk Palace"]);
  });
});
