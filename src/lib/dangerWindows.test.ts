import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module shared with the nightly sync script
import { addGames, bucketOf, emptyStore, prunePatches, usableGame } from "../../scripts/danger-windows-lib.mjs";
import { dangerWindows, summarizeWindows, type DangerData } from "./dangerWindows";

function game(id: number, duration: number, winner: "a" | "b", civA = "english", civB = "french", patch = 11308) {
  return {
    game_id: id,
    updated_at: new Date(Date.UTC(2026, 9, 27, 0, 0, id)).toISOString(),
    duration,
    kind: "rm_1v1",
    patch,
    teams: [
      [{ player: { civilization: civA, result: winner === "a" ? "win" : "loss" } }],
      [{ civilization: civB, result: winner === "b" ? "win" : "loss" }],
    ],
  };
}

describe("danger window sampler", () => {
  it("buckets game lengths", () => {
    expect(bucketOf(300)).toBe(0);
    expect(bucketOf(600)).toBe(1);
    expect(bucketOf(1500)).toBe(3);
    expect(bucketOf(5000)).toBe(5);
  });

  it("skips mirrors, unfinished games and instant resigns", () => {
    expect(usableGame(game(1, 900, "a", "english", "english"))).toBeNull();
    expect(usableGame({ ...game(2, 900, "a"), duration: null })).toBeNull();
    expect(usableGame(game(3, 60, "a"))).toBeNull();
    expect(usableGame(game(4, 900, "a"))).not.toBeNull();
  });

  it("records both sides and never counts a game twice", () => {
    const store = emptyStore();
    expect(addGames(store, [game(1, 500, "a"), game(2, 500, "b"), game(3, 2000, "a")])).toBe(3);
    store.lastUpdatedAt = game(3, 0, "a").updated_at;
    expect(addGames(store, [game(3, 2000, "a")])).toBe(0);
    const m = store.patches["11308"].matchups;
    expect(m.english.french.slice(0, 2)).toEqual([1, 2]);
    expect(m.french.english.slice(0, 2)).toEqual([1, 2]);
    expect(m.english.french.slice(8, 10)).toEqual([1, 1]);
  });

  it("keeps only the newest patches", () => {
    const store = emptyStore();
    addGames(store, [game(1, 900, "a", "english", "french", 1), game(2, 900, "a", "english", "french", 3), game(3, 900, "a", "english", "french", 2)]);
    prunePatches(store, 2);
    expect(Object.keys(store.patches).sort()).toEqual(["2", "3"]);
  });
});

function dataWith(rows: Record<string, Record<string, number[]>>): DangerData {
  return { updatedAt: "2026-10-27", lastUpdatedAt: null, bucketEdges: [600, 900, 1200, 1800, 2400], patches: { "11308": { games: 0, matchups: rows } } };
}

describe("dangerWindows", () => {
  it("flags the stretch where you lose and the one where you win", () => {
    // English vs French: lose early, win late, 100 games per bucket.
    const row = [30, 100, 35, 100, 50, 100, 50, 100, 65, 100, 70, 100];
    const result = dangerWindows("english", "french", dataWith({ english: { french: row } }))!;
    expect(result.basis).toBe("matchup");
    expect(result.windows[0].kind).toBe("danger");
    expect(result.windows[0].label).toBe("Under 10 min");
    expect(result.windows[5].kind).toBe("yours");
    expect(result.windows[5].label).toBe("40+ min");
    expect(summarizeWindows(result)).toContain("under 10 min");
  });

  it("falls back to everyone against the enemy civ when the pairing is thin", () => {
    // French beat everyone early: 80 of 100 short games.
    const french = { rus: [80, 100, 50, 100, 50, 100, 50, 100, 50, 100, 50, 100] };
    const result = dangerWindows("english", "french", dataWith({ french }))!;
    expect(result.basis).toBe("civ");
    expect(result.windows[0].winRate).toBeLessThan(0.3);
    expect(result.windows[0].kind).toBe("danger");
  });

  it("returns null with no data", () => {
    expect(dangerWindows("english", "french", dataWith({}))).toBeNull();
  });

  it("does not call a thin bucket dangerous", () => {
    const row = [0, 5, 100, 200, 100, 200, 100, 200, 0, 0, 0, 0];
    const result = dangerWindows("english", "french", dataWith({ english: { french: row } }))!;
    expect(result.windows[0].thin).toBe(true);
    expect(result.windows[0].kind).toBe("even");
  });
});
