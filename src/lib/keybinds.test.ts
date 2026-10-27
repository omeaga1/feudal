import { describe, expect, it } from "vitest";
import { commandLabel, comboKeys, groupKeybinds, groupOf, parseRkp } from "./keybinds";

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
});
