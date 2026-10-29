import { describe, expect, it } from "vitest";
import { civColor } from "./civColors";
import { civs } from "./gameData";

describe("civColor", () => {
  it("has a banner color for every civ", () => {
    for (const c of civs) expect(civColor(c.id), c.id).not.toBe("#d9a74a");
  });
});
