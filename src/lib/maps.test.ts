import { describe, expect, it } from "vitest";
import type { FetchFn } from "./aoe4world";
import { fetchMapStats, getMapInfo, maps } from "./maps";

describe("maps", () => {
  it("finds notes regardless of case and punctuation", () => {
    expect(getMapInfo("dry arabia")?.name).toBe("Dry Arabia");
    expect(getMapInfo("King Of The Hill")?.features).toContain("Elevation");
    expect(getMapInfo("Nowhere")).toBeUndefined();
  });

  it("has a summary and at least one tip for every map", () => {
    for (const m of maps) {
      expect(m.summary.length, m.name).toBeGreaterThan(10);
      expect(m.tips.length, m.name).toBeGreaterThan(0);
    }
  });

  it("looks up a map's id, then its civ stats", async () => {
    const calls: string[] = [];
    const fetchFn: FetchFn = async (url) => {
      calls.push(url);
      const body = url.endsWith("/maps")
        ? { data: [{ map_id: 7, map: "Dry Arabia", games_count: 100, duration_median: 1400 }] }
        : { data: [{ civilization: "english", win_rate: 51, games_count: 40 }] };
      return new Response(JSON.stringify(body));
    };
    const stats = await fetchMapStats(fetchFn, "Dry Arabia");
    expect(calls[1]).toMatch(/\/stats\/rm_solo\/maps\/7$/);
    expect(stats?.civs[0].civilization).toBe("english");
    expect(await fetchMapStats(fetchFn, "Atlantis")).toBeNull();
  });
});
