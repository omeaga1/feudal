import { describe, expect, it } from "vitest";
import { buildBrief } from "./brief";
import { nextStatus } from "./liveMatch";
import { parseProfileInput } from "./profile";
import { civs } from "./gameData";

describe("buildBrief", () => {
  it("lists HRE's Feudal Age men-at-arms with counters", () => {
    const brief = buildBrief("english", "holy_roman_empire")!;
    const feudal = brief.ages.find((a) => a.age === 2)!;
    const maa = feudal.threats.find((t) => t.enemy.baseId === "man-at-arms");
    expect(maa).toBeDefined();
    expect(brief.enemyPlaybook?.civ).toBe("holy_roman_empire");
  });

  it("shows Dark Age unique units like Berserkers in the Feudal section", () => {
    const feudal = buildBrief("english", "vikings")!.ages.find((a) => a.age === 2)!;
    expect(feudal.threats.map((t) => t.enemy.baseId)).toContain("berserker");
  });

  it("only recommends counters that win on equal resources", () => {
    const brief = buildBrief("french", "english")!;
    for (const age of brief.ages) {
      for (const threat of age.threats) {
        for (const pick of threat.counters) expect(pick.score).toBeGreaterThan(1);
      }
    }
  });

  it("builds a brief for every pairing of civs", () => {
    for (const me of civs) {
      for (const enemy of civs) expect(buildBrief(me.id, enemy.id)).not.toBeNull();
    }
  });

  it("returns null for unknown civs", () => {
    expect(buildBrief("english", "atlanteans")).toBeNull();
  });
});

describe("nextStatus", () => {
  it("shows the brief only while a game is ongoing", () => {
    expect(nextStatus(null).kind).toBe("waiting");
  });
});

describe("parseProfileInput", () => {
  it("reads ids from profile links and plain numbers", () => {
    expect(parseProfileInput("https://aoe4world.com/players/1234567-SomeName")).toBe(1234567);
    expect(parseProfileInput(" 7654321 ")).toBe(7654321);
    expect(parseProfileInput("aoe4world")).toBeNull();
  });
});
