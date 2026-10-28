import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module shared with the build-watch script
import { buildReport, freshGuides, GUIDE_CIV_CODES, issueBody, newestBuild, watchUrl } from "../../scripts/build-watch-lib.mjs";
import { planIsStale, type BuildWatch } from "./buildWatch";
import { civs } from "./gameData";

const plan = {
  civ: "english",
  checkedBuild: 11308,
  updated: "2026-10-28",
  sources: [{ title: "Known", url: "https://aoe4guides.com/builds/known1" }],
};

const at = (iso: string) => ({ _seconds: Date.parse(iso) / 1000, _nanoseconds: 0 });

function guide(id: string, updated: string, score: number, extra = {}) {
  return { id, title: `Guide ${id}`, author: "Pro", video: "", isDraft: false, score, timeUpdated: at(updated), ...extra };
}

describe("build watch", () => {
  it("maps every civ to an aoe4guides code", () => {
    expect(civs.filter((c) => !GUIDE_CIV_CODES[c.id]).map((c) => c.id)).toEqual([]);
  });

  it("finds the newest sampled build", () => {
    expect(newestBuild({ patches: { "11200": {}, "11308": {} } })).toBe(11308);
    expect(newestBuild({ patches: {} })).toBeNull();
  });

  it("turns embed links into watch links", () => {
    expect(watchUrl("https://www.youtube.com/embed/abc-123")).toBe("https://www.youtube.com/watch?v=abc-123");
    expect(watchUrl("")).toBeUndefined();
  });

  it("lists only newer, unknown, published guides, best first", () => {
    const fresh = freshGuides(plan, [
      guide("old", "2026-10-01T00:00:00Z", 9),
      guide("known1", "2026-11-02T00:00:00Z", 9),
      guide("draft", "2026-11-02T00:00:00Z", 9, { isDraft: true }),
      guide("a", "2026-11-01T00:00:00Z", 2),
      guide("b", "2026-11-03T00:00:00Z", 5, { video: "https://www.youtube.com/embed/xyz" }),
    ]);
    expect(fresh.map((g: { url: string }) => g.url.split("/").pop())).toEqual(["b", "a"]);
    expect(fresh[0]).toMatchObject({ video: "https://www.youtube.com/watch?v=xyz", updated: "2026-11-03" });
  });

  it("flags stale plans and keeps old guides when a fetch failed", () => {
    const previous = { civs: { english: { fresh: [{ title: "Kept" }] } } };
    const report = buildReport({ plans: [plan], latestBuild: 11400, guides: {}, previous, now: "x" });
    expect(report.civs.english).toEqual({ checkedBuild: 11308, stale: true, fresh: [{ title: "Kept" }] });
    expect(issueBody(report)).toContain("**english** (checked on 11308)");
  });

  it("prefers the build being played over the newest sampled one", () => {
    const watch: BuildWatch = { latestBuild: 11400, checkedAt: null, civs: {} };
    expect(planIsStale(11308, watch)).toBe(true);
    expect(planIsStale(11308, watch, 11308)).toBe(false);
    expect(planIsStale(11308, { ...watch, latestBuild: null })).toBe(false);
  });
});
