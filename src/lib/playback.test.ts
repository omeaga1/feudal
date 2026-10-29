import { describe, expect, it } from "vitest";
import { gamePlans, getGamePlan } from "./gamePlans";
import { assignVillagers, bornAt, planOff, buildingsIn, buildPlayback, buildTime, frameAt, landmarkStart, production, stepHints, trainedBy, villagerAt, villagerMoves, type Villager } from "./playback";

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
            expect(e.planned.length, `${p.civ} ${e.step.t}`).toBe(total);
          }
        }
      }
    }
  });
});

describe("villager production", () => {
  it("trains one villager per the civ's train time from each Town Center", () => {
    const en = production("english", [], 300);
    expect(en.trainTime).toBe(20);
    expect(trainedBy(en, 0)).toBe(6);
    expect(trainedBy(en, 19)).toBe(6);
    expect(trainedBy(en, 20)).toBe(7);
    expect(trainedBy(en, 200)).toBe(16);
    expect(production("french", [], 300).trainTime).toBe(19);
    expect(production("vikings", [], 300).trainTime).toBe(22);
  });

  it("trains Golden Horde villagers two at a time, from five", () => {
    const gh = production("golden_horde", [], 300);
    expect(trainedBy(gh, 36)).toBe(5);
    expect(trainedBy(gh, 37)).toBe(7);
  });

  it("starts Dragon and Zhu Xi with five villagers", () => {
    expect(trainedBy(production("order_of_the_dragon", [], 300), 0)).toBe(5);
    expect(trainedBy(production("order_of_the_dragon", [], 300), 23)).toBe(6);
    expect(trainedBy(production("zhu_xis_legacy", [], 300), 0)).toBe(5);
  });

  it("trains Jin Mounted Villagers up to their limit, then villagers", () => {
    const jin = production("jin_dynasty", [], 1200);
    expect(jin.limited).toMatchObject({ name: "Mounted Villager", trainTime: 35, limit: 20 });
    expect(trainedBy(jin, 0)).toBe(3);
    expect(trainedBy(jin, 34)).toBe(3);
    expect(trainedBy(jin, 35)).toBe(4);
    // 17 more Mounted Villagers reach the limit of 20 at 9:55, then one every 20s.
    expect(trainedBy(jin, 595)).toBe(20);
    expect(trainedBy(jin, 614)).toBe(20);
    expect(trainedBy(jin, 615)).toBe(21);
  });

  it("stops the Town Center while Knights Templar click up", () => {
    const kt = production("knights_templar", [], 600, [], [{ age: 2, at: 200 }]);
    expect(kt.producers[0].paused).toEqual([{ from: 140, until: 200 }]);
    expect(trainedBy(kt, 140)).toBe(13);
    expect(trainedBy(kt, 219)).toBe(13);
    expect(trainedBy(kt, 220)).toBe(14);
    expect(production("english", [], 600, [], [{ age: 2, at: 200 }]).producers[0].paused).toBeUndefined();
  });

  it("adds a second Town Center once it's built", () => {
    const two = production("english", [{ seconds: 300, text: "Build a 2nd TC with 4 wood villagers" }], 900);
    expect(two.producers.map((p) => p.from)).toEqual([0, 465]);
    expect(trainedBy(two, 485) - trainedBy(production("english", [], 900), 485)).toBe(1);
    expect(production("chinese", [{ seconds: 300, text: "Second TC" }], 900).producers.map((p) => p.from)).toEqual([0, 382.5]);
    expect(production("english", [{ seconds: 300, text: "2nd TC done" }], 900).producers.map((p) => p.from)).toEqual([0, 300]);
  });

  it("reads extra Town Centers the way plans write them", () => {
    const from = (text: string) => production("english", [{ seconds: 300, text }], 900).producers.map((p) => p.from);
    expect(from("8 stone villagers build TC 2")).toEqual([0, 465]);
    expect(from("Castle once two TCs are running")).toEqual([0, 300]);
    expect(from("Stone for a second TC")).toEqual([0]);
    expect(from("Battering rams or a second TC")).toEqual([0]);
    expect(from("Farms around the TC")).toEqual([0]);
  });

  it("counts a landmark that trains villagers", () => {
    const palace = production("english", [], 900, [{ name: "King's Palace", at: 300 }, { name: "Council Hall", at: 200 }]);
    expect(palace.producers).toEqual([
      { label: "Town Center", from: 0, speed: 1 },
      { label: "King's Palace", from: 300, speed: 1.1 },
    ]);
    // Palace of Swabia trains villagers 3x as fast.
    const swabia = production("holy_roman_empire", [], 900, [{ name: "Palace of Swabia", at: 600 }]);
    expect(swabia.producers[1]).toEqual({ label: "Palace of Swabia", from: 600, speed: 3 });
    expect(trainedBy(swabia, 620) - trainedBy(production("holy_roman_empire", [], 900), 620)).toBe(3);
  });

  it("builds a Town Center faster with more builders", () => {
    expect(buildTime(165)).toBe(165);
    expect(buildTime(165, 2)).toBeCloseTo(123.75);
    expect(buildTime(165, 8)).toBeCloseTo(49.5);
    expect(production("english", [{ seconds: 300, text: "8 build TC 2", builders: 8 }], 900).producers.map((p) => p.from)).toEqual([0, 349.5]);
  });

  it("matches every plan step's villager count to production", () => {
    for (const p of gamePlans) {
      for (const f of p.feudal) {
        for (const c of f.castle) {
          const run = buildPlayback(p, { feudal: f, castle: c });
          run.events.forEach((e, i) => {
            if (e.step.v) expect(planOff(run, i), `${p.civ} ${f.id}/${c.id} at ${e.step.t}: ${e.step.do}`).toBe(0);
          });
        }
      }
    }
  });

  it("only shows villagers the Town Centers have trained", () => {
    for (const p of gamePlans) {
      for (const f of p.feudal) {
        for (const c of f.castle) {
          const run = buildPlayback(p, { feudal: f, castle: c });
          for (const t of [0, 45, 130, run.feudalAt + 10, run.end]) {
            const vils = frameAt(run, t).villagers;
            expect(vils.length, `${p.civ} ${f.id}/${c.id} at ${t}`).toBe(trainedBy(run.production, t));
            expect(new Set(vils.map((v) => v.id)).size).toBe(vils.length);
          }
        }
      }
    }
  });

  it("treats a step's split as what it builds up to", () => {
    const plan = getGamePlan("english")!;
    const run = buildPlayback(plan, { feudal: plan.feudal[0], castle: plan.feudal[0].castle[0] });
    // "Next 2 to gold" at 0:20 counts 8: one is out at 0:20, the second by 0:40.
    const i = run.events.findIndex((e) => e.step.t === "0:20");
    expect(run.events[i].planned).toHaveLength(8);
    expect(run.events[i].villagers).toHaveLength(7);
    expect(planOff(run, i)).toBe(0);
  });

  it("walks each new villager out when it's trained", () => {
    const plan = getGamePlan("english")!;
    const run = buildPlayback(plan, { feudal: plan.feudal[0], castle: plan.feudal[0].castle[0] });
    const arrivals = [...villagerMoves(run).values()].map((m) => m[0].t).sort((a, b) => a - b);
    expect(arrivals.slice(0, 9)).toEqual([0, 0, 0, 0, 0, 0, 20, 40, 60]);
    expect(bornAt(run.production, 6)).toBe(20);
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

describe("step hints", () => {
  it("reads pulls, builders and rally points", () => {
    expect(stepHints("Pull gold to wood, 4 sheep build Council Hall")).toEqual({
      pulls: [
        { from: "food", to: "build" },
        { from: "gold", to: "wood" },
      ],
      rally: undefined,
    });
    expect(stepHints("Builders to food and gold; Specialized Pick").pulls).toEqual([
      { from: "build", to: "food" },
      { from: "build", to: "gold" },
    ]);
    expect(stepHints("Rally back to sheep until you age up").rally).toBe("food");
    expect(stepHints("Rally 2 or 3 to gold with a camp").rally).toBe("gold");
    expect(stepHints("Next 2 to gold, mining camp").rally).toBe("gold");
    expect(stepHints("Builders to gold; TC 2 rallies wood").rally).toBe("wood");
    expect(stepHints("Barracks and a house").pulls).toEqual([]);
  });

  it("pulls builders off sheep and sends gold to wood, as the English plan says", () => {
    const plan = getGamePlan("english")!;
    const pb = buildPlayback(plan, { feudal: plan.feudal[0], castle: plan.feudal[0].castle[0] });
    const step = pb.events.find((e) => e.step.t === "2:10")!;
    // "Pull gold to wood, 4 sheep build Council Hall": the villagers trained
    // since the last step are already on sheep, so all four builders come off sheep.
    expect(step.moves).toEqual(
      expect.arrayContaining([
        { from: "food", to: "build", n: 4 },
        { from: "gold", to: "wood", n: 2 },
      ]),
    );
    expect(pb.events[0].rally).toBe("food");
    expect(pb.events.find((e) => e.step.t === "0:20")!.rally).toBe("gold");
  });
});
