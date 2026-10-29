import { describe, expect, it } from "vitest";
import { gamePlans, getGamePlan } from "./gamePlans";
import { assignVillagers, buildingsIn, buildPlayback, frameAt, landmarkStart, villagerAt, villagerMoves, type Villager } from "./playback";

const where = (vils: Villager[]) => vils.map((v) => v.at);

describe("assignVillagers", () => {
  it("adds new villagers to the shortfall", () => {
    const six = assignVillagers([], [6, 0, 0, 0], 0);
    expect(where(six)).toEqual(Array(6).fill("food"));
    const eight = assignVillagers(six, [6, 0, 2, 0], 0);
    expect(eight.slice(0, 6)).toEqual(six);
    expect(where(eight.slice(6))).toEqual(["gold", "gold"]);
  });

  it("moves only the villagers it has to", () => {
    const start = assignVillagers([], [8, 0, 2, 0], 0);
    const next = assignVillagers(start, [6, 2, 0, 0], 4);
    const moved = next.filter((v, i) => start[i] && start[i].at !== v.at);
    // 2 gold go to wood, 2 food go to building; 2 new builders arrive.
    expect(moved).toHaveLength(4);
    expect(next.filter((v) => v.at === "build")).toHaveLength(4);
    expect(new Set(next.map((v) => v.id)).size).toBe(next.length);
  });

  it("keeps ids stable when the count drops", () => {
    const start = assignVillagers([], [5, 5, 0, 0], 0);
    const fewer = assignVillagers(start, [5, 3, 0, 0], 0);
    expect(fewer).toHaveLength(8);
    expect(fewer.every((v) => start.some((s) => s.id === v.id))).toBe(true);
  });
});

describe("buildingsIn", () => {
  it("reads buildings from step text", () => {
    expect(buildingsIn("Barracks and a house with age-up builders")).toEqual(["house", "barracks"]);
    expect(buildingsIn("Next 2 to gold, mining camp")).toEqual(["mining"]);
    expect(buildingsIn("Second TC, then farms")).toEqual(["farm", "townCenter"]);
  });

  it("doesn't mistake landmarks or verbs for buildings", () => {
    expect(buildingsIn("Stop units, age up with The White Tower")).toEqual([]);
    expect(buildingsIn("Keep making villagers")).toEqual([]);
    expect(buildingsIn("Rally new villagers to the TC")).toEqual([]);
  });
});

describe("playback", () => {
  const plan = getGamePlan("english")!;
  const path = { feudal: plan.feudal[0], castle: plan.feudal[0].castle[0] };
  const pb = buildPlayback(plan, path);

  it("runs past the Castle age-up", () => {
    expect(pb.end).toBeGreaterThan(pb.castleAt);
    expect(pb.events[0].seconds).toBe(0);
  });

  it("gives the state at any moment", () => {
    const start = frameAt(pb, 0);
    expect(start.age).toBe(1);
    expect(start.villagers).toHaveLength(6);
    expect(start.nextAgeAt).toBe(pb.feudalAt);

    const feudal = frameAt(pb, pb.feudalAt);
    expect(feudal.age).toBe(2);
    expect(feudal.buildings.map((b) => b.kind)).toContain("barracks");

    const castle = frameAt(pb, pb.end);
    expect(castle.age).toBe(3);
    expect(castle.ageProgress).toBe(1);
    expect(castle.next).toBeUndefined();
  });

  it("keeps landmark builders on the landmark until the age-up", () => {
    const building = frameAt(pb, pb.feudalAt - 1);
    expect(building.villagers.filter((v) => v.at === "build").length).toBeGreaterThan(0);
    expect(frameAt(pb, pb.feudalAt).villagers.filter((v) => v.at === "build")).toHaveLength(0);
  });

  it("plays every path of every civ", () => {
    for (const p of gamePlans) {
      for (const f of p.feudal) {
        for (const c of f.castle) {
          const run = buildPlayback(p, { feudal: f, castle: c });
          expect(run.events.length, `${p.civ} ${f.id}/${c.id}`).toBeGreaterThan(3);
          for (const e of run.events) {
            const total = e.split.reduce((a, b) => a + b, 0) + e.builders;
            expect(e.villagers.length, `${p.civ} ${e.step.t}`).toBe(total);
          }
        }
      }
    }
  });
});

describe("villager moves", () => {
  const plan = getGamePlan("english")!;
  const pb = buildPlayback(plan, { feudal: plan.feudal[0], castle: plan.feudal[0].castle[0] });
  const moves = villagerMoves(pb);

  it("starts every villager at the Town Center", () => {
    const first = villagerAt(moves.get(0), 0);
    expect(first).toEqual({ from: "tc", to: "food", since: 0 });
  });

  it("tracks a villager pulled to another resource", () => {
    const moved = [...moves.values()].find((m) => m.length > 1)!;
    const later = villagerAt(moved, moved[1].t);
    expect(later?.from).toBe(moved[0].at);
    expect(later?.to).toBe(moved[1].at);
    expect(villagerAt(moved, -1)).toBeUndefined();
  });

  it("finds when the landmark goes up", () => {
    expect(landmarkStart(pb, 2)).toBe(130);
  });
});
