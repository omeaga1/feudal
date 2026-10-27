// Reads AoE4 keybinding profiles (.rkp files in
// Documents\My Games\Age of Empires IV\keyBindingProfiles). Feudal only reads
// these text files to show your hotkeys; it never writes them.
//
// The format is a Lua-style table. Each binding looks like:
//   { command = "pick_next_idle_worker", keycombos = { { combo = "Period", repeatCount = -1, }, }, },
// We scan for `command = "..."` and collect the `combo = "..."` values that
// follow it, so unknown extra fields or nesting don't break parsing.

export interface Keybind {
  command: string;
  /** The profile section the binding sits in, when the file names one. */
  section: string | null;
  combos: string[];
}

export interface KeybindProfile {
  name: string;
  contents: string;
}

const TOKEN = /(\w+)\s*=\s*(?:"([^"]*)"|\{)/g;

/** Parses an .rkp file into its bindings, in file order. Bindings with no keys are kept with an empty combo list. */
export function parseRkp(text: string): Keybind[] {
  const binds: Keybind[] = [];
  let current: Keybind | null = null;
  let section: string | null = null;
  for (const m of text.matchAll(TOKEN)) {
    const [, key, value] = m;
    if (value === undefined) {
      // `name = {` opens a table. Named tables other than keycombos are sections.
      if (key !== "keycombos" && key !== "bindings") section = key;
      continue;
    }
    if (key === "command") {
      current = { command: value, section, combos: [] };
      binds.push(current);
    } else if (key === "combo" && current && value !== "") {
      current.combos.push(value);
    }
  }
  return binds;
}

const KEY_NAMES: Record<string, string> = {
  Control: "Ctrl",
  Period: ".",
  Comma: ",",
  Semicolon: ";",
  Apostrophe: "'",
  Slash: "/",
  Backslash: "\\",
  LBracket: "[",
  RBracket: "]",
  Minus: "-",
  Equal: "=",
  Equals: "=",
  Grave: "`",
  Tilde: "`",
  Escape: "Esc",
  Delete: "Del",
  Insert: "Ins",
  PageUp: "PgUp",
  PageDown: "PgDn",
  MouseLeft: "Left click",
  MouseRight: "Right click",
  MouseMiddle: "Middle click",
  MouseWheelUp: "Wheel up",
  MouseWheelDown: "Wheel down",
  Arrowup: "↑",
  Arrowdown: "↓",
  Arrowleft: "←",
  Arrowright: "→",
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
};

/** Splits a combo such as "Control+Shift+V" into display keys: ["Ctrl", "Shift", "V"]. */
export function comboKeys(combo: string): string[] {
  return combo.split("+").map((k) => {
    if (KEY_NAMES[k]) return KEY_NAMES[k];
    const numpad = k.match(/^Numpad(\d)$/i);
    if (numpad) return `Num ${numpad[1]}`;
    return k.length === 1 ? k.toUpperCase() : k;
  });
}

/** "pick_next_idle_worker" -> "Pick next idle worker". */
export function commandLabel(command: string): string {
  const words = command.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_.]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type KeybindGroup = "Camera" | "Selection" | "Control groups" | "Economy" | "Military" | "Buildings" | "Interface" | "Other";

const GROUP_RULES: [KeybindGroup, RegExp][] = [
  ["Control groups", /group/i],
  ["Camera", /camera|pan|zoom|rotate|focus|jump|scroll/i],
  ["Selection", /select|idle|cycle|pick|next|previous|all_/i],
  ["Economy", /villager|worker|gather|economic|eco|farm|market|trade|relic/i],
  ["Buildings", /build|construct|house|town_?center|landmark|wall|tower|keep|barracks|range|stable|siege_workshop|blacksmith|dock|monastery|university/i],
  ["Military", /attack|stop|halt|patrol|formation|stance|move|retreat|garrison|ungarrison|unload|military|ability|stand|hold|charge/i],
  ["Interface", /menu|chat|score|pause|screenshot|objective|tech|tree|ui|toggle|quick_?save|minimap/i],
];

export function groupOf(command: string): KeybindGroup {
  return GROUP_RULES.find(([, re]) => re.test(command))?.[0] ?? "Other";
}

/** Bindings that have keys, grouped for display, optionally filtered by a search string. */
export function groupKeybinds(binds: Keybind[], query = ""): [KeybindGroup, Keybind[]][] {
  const q = query.trim().toLowerCase();
  const groups = new Map<KeybindGroup, Keybind[]>();
  for (const b of binds) {
    if (b.combos.length === 0) continue;
    if (q && !commandLabel(b.command).toLowerCase().includes(q) && !b.combos.some((c) => c.toLowerCase().includes(q))) continue;
    const g = groupOf(b.command);
    groups.set(g, [...(groups.get(g) ?? []), b]);
  }
  const order: KeybindGroup[] = ["Control groups", "Camera", "Selection", "Economy", "Buildings", "Military", "Interface", "Other"];
  return order.filter((g) => groups.has(g)).map((g) => [g, groups.get(g)!]);
}
