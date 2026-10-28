import { describe, expect, it } from "vitest";
import { civs, getCiv } from "./gameData";
import { clock, findUnit, gamePlans, getGamePlan, pathSteps, villagerTimeline } from "./gamePlans";
import { landmarks } from "./scouting";

describe("game plans", () => {
  it("covers every civ", () => {
    const missing = civs.filter((c) => !getGamePlan(c.id)).map((c) => c.id);
    expect(missing).toEqual([]);
  });

  for (const plan of gamePlans) {
    describe(plan.civ, () => {
      const civ = getCiv(plan.civ);

      it("is a known civ with two Feudal paths of two Castle paths each", () => {
        expect(civ).toBeDefined();
        expect(plan.feudal).toHaveLength(2);
        for (const f of plan.feudal) expect(f.castle).toHaveLength(2);
        expect(plan.sources.length).toBeGreaterThan(0);
      });

      it("has valid clocks in order, with Castle after Feudal", () => {
        expect(clock(plan.opening.decideAt)).not.toBeNaN();
        for (const f of plan.feudal) {
          for (const c of f.castle) {
            expect(clock(c.ageUp), `${f.id}/${c.id}`).toBeGreaterThan(clock(f.ageUp));
            const times = pathSteps(plan, { feudal: f, castle: c }).map(({ step }) => clock(step.t));
            expect(times.every((t) => !Number.isNaN(t)), `${f.id}/${c.id} clocks`).toBe(true);
            expect(times, `${f.id}/${c.id} order`).toEqual([...times].sort((a, b) => a - b));
            expect(villagerTimeline(plan, { feudal: f, castle: c }).length).toBeGreaterThanOrEqual(3);
          }
        }
      });

      it("names units the civ can field", () => {
        const nodes = plan.feudal.flatMap((f) => [f, ...f.castle]);
        const unknown = nodes.flatMap((n) => (n.army ?? []).filter((u) => !findUnit(u, civ?.abbr)?.civs.includes(civ!.abbr)));
        expect(unknown).toEqual([]);
      });

      it("names the civ's own landmarks, where AoE4 World lists them", () => {
        const own = landmarks.filter((l) => l.civs.includes(civ!.abbr)).map((l) => l.name);
        if (own.length === 0) return;
        const nodes = plan.feudal.flatMap((f) => [f, ...f.castle]);
        const unknown = nodes.map((n) => n.landmark).filter((l): l is string => !!l && !own.includes(l));
        expect(unknown).toEqual([]);
      });
    });
  }
});
