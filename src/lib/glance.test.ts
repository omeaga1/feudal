import { describe, expect, it } from "vitest";
import { buildBrief } from "./brief";
import { dangerWindows } from "./dangerWindows";
import { elapsedSeconds, firstSentence, glanceThreats, windowAt } from "./glance";

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
