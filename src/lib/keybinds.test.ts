import { describe, expect, it } from "vitest";
import { commandLabel, comboKeys, groupKeybinds, groupOf, parseRkp, resolveEssentials } from "./keybinds";

const SAMPLE = `
bindings =
{
	camera =
	{
		{
			command = "pan",
			keycombos =
			{
				{
					combo = "MouseMiddle",
					repeatCount = -1,
				},
			},
		},
	},
	selection =
	{
		{
			command = "pick_next_idle_worker",
			keycombos =
			{
				{
					combo = "Period",
					repeatCount = -1,
				},
				{
					combo = "Control+Shift+V",
					repeatCount = -1,
				},
			},
		},
		{
			command = "select_all_military",
			keycombos =
			{
				{
					combo = "",
					repeatCount = -1,
				},
			},
		},
	},
}
`;

describe("keybind profiles", () => {
  it("parses commands and their key combos", () => {
    const binds = parseRkp(SAMPLE);
    expect(binds.map((b) => b.command)).toEqual(["pan", "pick_next_idle_worker", "select_all_military"]);
    expect(binds[1].combos).toEqual(["Period", "Control+Shift+V"]);
    expect(binds[1].section).toBe("selection");
    expect(binds[2].combos).toEqual([]);
  });

  it("formats keys and labels", () => {
    expect(comboKeys("Control+Shift+v")).toEqual(["Ctrl", "Shift", "V"]);
    expect(comboKeys("Period")).toEqual(["."]);
    expect(comboKeys("Numpad3")).toEqual(["Num 3"]);
    expect(commandLabel("pick_next_idle_worker")).toBe("Pick next idle worker");
  });

  it("groups and filters bindings, dropping unbound ones", () => {
    const binds = parseRkp(SAMPLE);
    expect(groupOf("pan")).toBe("Camera");
    expect(groupOf("select_control_group_1")).toBe("Control groups");
    const groups = groupKeybinds(binds);
    expect(groups.map(([g]) => g)).toEqual(["Camera", "Selection"]);
    expect(groupKeybinds(binds, "idle")).toHaveLength(1);
  });

  it("reads the essentials from a profile, folding control groups and filling in defaults", () => {
    const groupBind = (series: string, key: (n: number) => string) =>
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ command: `${series}${n}`, section: null, combos: [key(n)] }));
    const binds = [
      { command: "pick_next_idle_worker", section: null, combos: ["F1"] },
      { command: "pick_all_military", section: null, combos: [] },
      { command: "pick_all_military_infantry", section: null, combos: ["Alt+1"] },
      ...groupBind("hkgroup_set", (n) => `Control+${n}`),
      ...groupBind("hkgroup_select", (n) => (n === 9 ? "Tab" : String(n))),
    ];
    const byLabel = new Map(resolveEssentials(binds).map((e) => [e.label, e]));
    expect(byLabel.get("Next idle villager")).toMatchObject({ combos: ["F1"], source: "profile" });
    expect(byLabel.get("All idle villagers")).toMatchObject({ combos: ["Control+Period"], source: "default" });
    expect(byLabel.has("All military")).toBe(false);
    expect(byLabel.get("All infantry")?.combos).toEqual(["Alt+1"]);
    expect(byLabel.get("Set group")?.combos).toEqual(["Control+1-9"]);
    expect(byLabel.get("Select group")?.combos).toEqual(["1-8"]);
    expect(comboKeys("Control+1-9")).toEqual(["Ctrl", "1-9"]);
  });

  it("falls back to AoE4 defaults with no profile and keeps the list short", () => {
    const defaults = resolveEssentials(null);
    expect(defaults.every((e) => e.source === "default")).toBe(true);
    expect(defaults.length).toBeLessThan(20);
  });
});
