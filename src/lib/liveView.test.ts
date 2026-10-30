import { describe, expect, it } from "vitest";
import { dangerWindows } from "./dangerWindows";
import { clock, gamePlans, getGamePlan } from "./gamePlans";
import { chartSpan, enemyTimings, gameSeconds, LOADING_SECONDS, timingState, VILLAGER_CAP, villagersAt, villagerTargets } from "./liveView";
import { getPlaybook } from "./playbooks";

describe("gameSeconds", () => {
  const start = "2026-10-29T17:00:00Z";
  it("takes the loading screen off AoE4 World's clock", () => {
    expect(gameSeconds(start, Date.parse(start) + 125_000)).toBe(125 - LOADING_SECONDS);
    expect(gameSeconds(start, Date.parse(start) + 125_000, 0)).toBe(125);
  });
  it("never goes negative and needs a real date", () => {
    expect(gameSeconds(start, Date.parse(start) + 5_000)).toBe(0);
    expect(gameSeconds("not a date", 0)).toBeNull();
  });
});

describe("enemyTimings", () => {
  it("finds a rush, a weak window and a Castle spike for every civ, in time order", () => {
    for (const plan of gamePlans) {
      const timings = enemyTimings(plan, getPlaybook(plan.civ), null);
      expect(timings.length, plan.civ).toBeGreaterThan(0);
      expect(
        timings.some((t) => t.kind === "spike"),
        plan.civ,
      ).toBe(true);
      expect(
        timings.some((t) => t.kind === "weak"),
        plan.civ,
      ).toBe(true);
      for (let i = 1; i < timings.length; i++) expect(timings[i].from).toBeGreaterThanOrEqual(timings[i - 1].from);
      for (const t of timings) expect(t.to === null || t.to > t.from, `${plan.civ} ${t.title}`).toBe(true);
    }
  });
  it("starts English's longbow rush at their Feudal age-up", () => {
    const plan = getGamePlan("english")!;
    const rush = enemyTimings(plan, getPlaybook("english"), null).find((t) => t.kind === "rush")!;
    expect(rush.from).toBe(clock(plan.feudal[0].ageUp));
    expect(rush.tip).toBe("Go full archers with a few spears.");
  });
  it("adds the stretches each side wins from the stats", () => {
    const danger = dangerWindows("english", "french");
    const kinds = enemyTimings(undefined, undefined, danger).map((t) => t.kind);
    for (const k of kinds) expect(["yours", "theirs"]).toContain(k);
  });
});

describe("timingState", () => {
  const t = { kind: "rush" as const, from: 240, to: 390, title: "", tip: "" };
  it("reads before, during and after", () => {
    expect(timingState(t, null)).toBe("later");
    expect(timingState(t, 100)).toBe("later");
    expect(timingState(t, 300)).toBe("now");
    expect(timingState(t, 390)).toBe("past");
    expect(timingState({ ...t, to: null }, 9999)).toBe("now");
  });
});

describe("villagerTargets", () => {
  it("starts at the civ's opening villagers and keeps climbing to the cap", () => {
    for (const plan of gamePlans) {
      const path = { feudal: plan.feudal[0], castle: plan.feudal[0].castle[0] };
      const prod = villagerTargets(plan, path, 40 * 60);
      expect(villagersAt(prod, 0), plan.civ).toBe(prod.start);
      const five = villagersAt(prod, 300);
      const ten = villagersAt(prod, 600);
      expect(ten, plan.civ).toBeGreaterThan(five);
      expect(villagersAt(prod, 40 * 60), plan.civ).toBeLessThanOrEqual(VILLAGER_CAP);
    }
  });
  it("gives one Town Center a villager every 20 seconds", () => {
    const plan = getGamePlan("english")!;
    const prod = villagerTargets(plan, { feudal: plan.feudal[0], castle: plan.feudal[0].castle[0] }, 600);
    expect(villagersAt(prod, 100)).toBe(prod.start + 5);
  });
});

describe("chartSpan", () => {
  it("shows the first 15 minutes, then slides with the game", () => {
    expect(chartSpan(null, 600)).toEqual({ from: 0, to: 900 });
    expect(chartSpan(300, 600)).toEqual({ from: 0, to: 900 });
    expect(chartSpan(1200, 600)).toEqual({ from: 480, to: 1380 });
  });
  it("widens for a late Castle", () => {
    expect(chartSpan(0, 840).to).toBe(1020);
  });
});

describe("rush advice", () => {
  it("doesn't hand a boom answer to a rush", () => {
    const rush = enemyTimings(getGamePlan("abbasid_dynasty"), getPlaybook("abbasid_dynasty"), null).find((t) => t.kind === "rush");
    if (rush) expect(rush.tip).not.toMatch(/Town Center/);
  });
});
