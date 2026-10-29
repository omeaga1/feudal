import { describe, expect, it } from "vitest";
import { costEfficiency, damagePerHit, matchesTarget, rankCounters } from "./counters";
import { getCiv, rosterAt, units } from "./gameData";

const unit = (id: string, civ: string) => {
  const found = units.find((u) => u.id === id && u.civs.includes(civ));
  if (!found) throw new Error(`missing ${id} for ${civ}`);
  return found;
};

describe("matchesTarget", () => {
  it("matches a joined class name", () => {
    expect(matchesTarget(["war", "elephant"], new Set(["war_elephant"]))).toBe(true);
  });

  it("matches when every word is its own class", () => {
    expect(matchesTarget(["melee", "infantry"], new Set(["melee", "infantry", "human"]))).toBe(true);
  });

  it("does not match a partial set", () => {
    expect(matchesTarget(["heavy", "infantry"], new Set(["infantry"]))).toBe(false);
  });
});

describe("counter math", () => {
  const spearman = unit("spearman-2", "hr");
  const horseman = unit("horseman-2", "hr");

  it("applies bonus damage against cavalry", () => {
    expect(damagePerHit(spearman.weapons[0], horseman)).toBeGreaterThan(spearman.weapons[0].damage);
  });

  it("rates spearmen as a counter to horsemen, and not the reverse", () => {
    expect(costEfficiency(spearman, horseman)).toBeGreaterThan(1);
    expect(costEfficiency(horseman, spearman)).toBeLessThan(1);
  });

  it("suggests spearmen against knights", () => {
    const english = getCiv("english")!;
    const knight = unit("knight-3", "hr");
    const picks = rankCounters(knight, rosterAt(english, 3)).map((p) => p.unit.baseId);
    expect(picks).toContain("spearman");
  });

  it("suggests spearmen against lance cavalry, ignoring the one-off charge", () => {
    const english = getCiv("english")!;
    const jylland = unit("jylland-knight-3", "vik");
    const picks = rankCounters(jylland, rosterAt(english, 3)).map((p) => p.unit.baseId);
    expect(picks).toContain("spearman");
  });

  it("answers siege with melee cavalry", () => {
    const english = getCiv("english")!;
    const mangonel = unit("mangonel-3", "hr");
    const picks = rankCounters(mangonel, rosterAt(english, 3));
    expect(picks.length).toBeGreaterThan(0);
    for (const pick of picks) expect(pick.unit.classes).toContain("cavalry");
  });

  it("never recommends siege or heroes", () => {
    const english = getCiv("english")!;
    const archer = unit("archer-2", "hr");
    const picks = rankCounters(archer, rosterAt(english, 4)).map((p) => p.unit.classes);
    for (const classes of picks) {
      expect(classes).not.toContain("siege");
      expect(classes).not.toContain("hero");
    }
  });
});
