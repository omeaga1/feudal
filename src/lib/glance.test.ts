import { describe, expect, it } from "vitest";
import { buildBrief } from "./brief";
import { dangerWindows } from "./dangerWindows";
import { elapsedSeconds, firstSentence, glanceThreats, stepWindow, windowAt } from "./glance";

describe("glanceThreats", () => {
  it("keeps at most three threats per age with two answers each", () => {
    const brief = buildBrief("english", "holy_roman_empire")!;
    const ages = glanceThreats(brief);
    expect(ages.length).toBeGreaterThan(0);
    for (const a of ages) {
      expect(a.threats.length).toBeLessThanOrEqual(3);
      for (const t of a.threats) expect(t.answers.length).toBeLessThanOrEqual(2);
    }
  });
});

describe("firstSentence", () => {
  it("cuts at the first full stop", () => {
    expect(firstSentence("Go full archers with a few spears. Don't answer longbows with cavalry.")).toBe(
      "Go full archers with a few spears.",
    );
  });
  it("keeps decimals and text with no stop", () => {
    expect(firstSentence("Wall at 4.5 minutes")).toBe("Wall at 4.5 minutes");
  });
});

describe("elapsedSeconds", () => {
  it("counts from the start and never goes negative", () => {
    const start = "2026-10-29T17:00:00Z";
    expect(elapsedSeconds(start, Date.parse(start) + 125_000)).toBe(125);
    expect(elapsedSeconds(start, Date.parse(start) - 5_000)).toBe(0);
    expect(elapsedSeconds("not a date", 0)).toBeNull();
  });
});

describe("windowAt", () => {
  it("finds the window a game time falls in, including the open-ended last one", () => {
    const result = dangerWindows("english", "french")!;
    const { windows } = result;
    expect(windowAt(windows, 0)).toBe(0);
    expect(windowAt(windows, 10 * 3600)).toBe(windows.length - 1);
    const second = windows[1];
    expect(windowAt(windows, second.from)).toBe(1);
  });
});

describe("stepWindow", () => {
  const steps = ["0:00", "1:00", "2:00", "3:00", "4:00", "5:00", "6:00", "7:00"].map((t) => ({ step: { t } }));
  it("starts at the first step before the clock is known", () => {
    const w = stepWindow(steps, null);
    expect(w.current).toBe(0);
    expect(w.items.map((s) => s.step.t)).toEqual(["0:00", "1:00", "2:00", "3:00", "4:00"]);
  });
  it("keeps one step behind and three ahead of the current one", () => {
    const w = stepWindow(steps, 190);
    expect(w.current).toBe(3);
    expect(w.items.map((s) => s.step.t)).toEqual(["2:00", "3:00", "4:00", "5:00", "6:00"]);
  });
  it("stops at the end of the plan", () => {
    const w = stepWindow(steps, 3600);
    expect(w.current).toBe(7);
    expect(w.items.map((s) => s.step.t)).toEqual(["3:00", "4:00", "5:00", "6:00", "7:00"]);
  });
});
