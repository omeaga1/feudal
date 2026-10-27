import { describe, expect, it } from "vitest";
import { civs } from "./gameData";
import { getPlaybook, isStale, playbooks } from "./playbooks";

describe("playbooks", () => {
  it("covers every civ", () => {
    const missing = civs.filter((c) => !getPlaybook(c.id)).map((c) => c.id);
    expect(missing).toEqual([]);
  });

  it("only names known civs", () => {
    const ids = new Set(civs.map((c) => c.id));
    for (const p of playbooks) expect(ids.has(p.civ)).toBe(true);
  });

  it("gives each civ advice, scouting signs, pairings and a dated source", () => {
    for (const p of playbooks) {
      expect(p.summary.length, p.civ).toBeGreaterThan(0);
      expect(p.spikes.length, p.civ).toBeGreaterThan(0);
      for (const s of p.spikes) expect([1, 2, 3, 4], p.civ).toContain(s.age);
      expect(p.scout?.length, p.civ).toBeGreaterThan(0);
      expect(p.pairings?.length, p.civ).toBeGreaterThan(0);
      expect(p.winConditions?.length, p.civ).toBeGreaterThan(0);
      for (const src of p.sources ?? []) expect(src.date, p.civ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.sources?.length, p.civ).toBeGreaterThan(0);
    }
  });

  it("flags a playbook written for an older build", () => {
    const p = getPlaybook("english")!;
    expect(isStale({ ...p, draftedForBuild: 11308 }, 11400)).toBe(true);
    expect(isStale({ ...p, draftedForBuild: 11308 }, 11308)).toBe(false);
    expect(isStale({ ...p, draftedForBuild: 11308 }, undefined)).toBe(false);
  });
});
