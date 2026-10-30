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
  /** Last modified time in ms, when known. The newest profile is most likely the one in use. */
  modified?: number;
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
  Backspace: "Back",
  CapsLock: "Caps",
  Capslock: "Caps",
  Return: "Enter",
  Spacebar: "Space",
  MouseX1: "Mouse4",
  MouseX2: "Mouse5",
  XButton1: "Mouse4",
  XButton2: "Mouse5",
  MouseButton4: "Mouse4",
  MouseButton5: "Mouse5",
  Mouse4: "Mouse4",
  Mouse5: "Mouse5",
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

// ---------- Essentials ----------
// The Keys screen shows a short list of the hotkeys players use every game,
// read from the player's own profile. Command names come from real AoE4
// profiles. Defaults fill in when there's no profile, or when the profile
// doesn't list a command (only for keys we're sure are AoE4's defaults).

export type EssentialGroup = "villagers" | "military" | "main" | "groups" | "camera" | "qol";

export const ESSENTIAL_GROUPS: { id: EssentialGroup; name: string }[] = [
  { id: "villagers", name: "Villagers" },
  { id: "military", name: "Military" },
  { id: "main", name: "Buildings" },
  { id: "groups", name: "Control groups" },
  { id: "camera", name: "Camera" },
  { id: "qol", name: "Selection" },
];

interface Essential {
  label: string;
  group: EssentialGroup;
  /** Command names to look for, first match wins. */
  commands: string[];
  /** For commands added in later patches whose exact name varies. */
  match?: RegExp;
  /** Control group series: hkgroup_set1..9 shown as one row. */
  series?: string;
  defaults?: string[];
}

const ESSENTIALS: Essential[] = [
  { label: "Next idle villager", group: "villagers", commands: ["pick_next_idle_worker"], defaults: ["Period"] },
  { label: "All idle villagers", group: "villagers", commands: ["pick_all_idle_villagers"], defaults: ["Control+Period"] },
  { label: "Idle villagers nearby", group: "villagers", commands: ["pick_all_idle_villagers_in_radius"] },
  { label: "All villagers", group: "villagers", commands: ["pick_all_villagers"], defaults: ["Control+Shift+V"] },
  { label: "Back to work", group: "villagers", commands: ["return_villagers_to_work"], defaults: ["Control+Shift+R"] },
  { label: "Next scout", group: "villagers", commands: ["pick_next_scout"] },

  { label: "All military", group: "military", commands: ["pick_all_military"] },
  { label: "Idle military", group: "military", commands: ["pick_all_idle_military"], defaults: ["Control+Comma"] },
  { label: "Next idle military", group: "military", commands: ["pick_next_idle_military"], defaults: ["Comma"] },
  { label: "All infantry", group: "military", commands: ["pick_all_infantry", "pick_all_military_infantry"], match: /^(pick|select)_all_\w*infantry/ },
  { label: "All ranged", group: "military", commands: ["pick_all_ranged", "pick_all_military_ranged"], match: /^(pick|select)_all_\w*ranged/ },
  { label: "All cavalry", group: "military", commands: ["pick_all_cavalry", "pick_all_military_cavalry"], match: /^(pick|select)_all_\w*cavalry/ },
  { label: "All siege", group: "military", commands: ["pick_all_siege", "pick_all_military_siege"], match: /^(pick|select)_all_\w*siege(?!_workshop)/ },
  { label: "All units on screen", group: "military", commands: ["select_all_special"], defaults: ["Control+A"] },

  { label: "Town centers", group: "main", commands: ["select_all_town_centers"], defaults: ["H"] },
  { label: "Next town center", group: "main", commands: ["pick_next_town"] },
  { label: "Military buildings", group: "main", commands: ["pick_all_military_buildings"] },
  { label: "Economy buildings", group: "main", commands: ["pick_all_economy_buildings"] },
  { label: "Tech buildings", group: "main", commands: ["pick_all_research_buildings"] },
  { label: "Barracks", group: "main", commands: ["pick_all_barracks"] },
  { label: "Archery ranges", group: "main", commands: ["pick_all_archery_range"] },
  { label: "Stables", group: "main", commands: ["pick_all_stables"] },
  { label: "Siege workshops", group: "main", commands: ["pick_all_siege_workshop"] },

  { label: "Select group", group: "groups", commands: [], series: "hkgroup_select", defaults: ["1-9"] },
  { label: "Set group", group: "groups", commands: [], series: "hkgroup_set", defaults: ["Control+1-9"] },
  { label: "Add to group", group: "groups", commands: [], series: "hkgroup_add", defaults: ["Shift+1-9"] },

  { label: "Last alert", group: "camera", commands: ["focus_event_cue"], match: /(last|latest)_(event|alert|attack)/ },
  { label: "Follow selected", group: "camera", commands: ["follow_selected"] },
  { label: "Center on selected", group: "camera", commands: ["focus_selected"] },
  { label: "Reset camera", group: "camera", commands: ["default"], defaults: ["Backspace"] },

  { label: "Cycle selection", group: "qol", commands: ["subselect_next"], defaults: ["Tab"] },
  { label: "Cancel last queued", group: "qol", commands: ["cancel_last_production_item"] },
];

export interface EssentialBind {
  label: string;
  group: EssentialGroup;
  combos: string[];
  /** Where the keys came from: the player's profile or AoE4's defaults. */
  source: "profile" | "default";
}

/** Folds hkgroup_select1..9 into one combo such as "Control+1-9", or "Control+1-8" when group 9 is bound elsewhere. */
function seriesCombos(byCommand: Map<string, Keybind>, series: string): string[] | null {
  const groups = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => byCommand.get(`${series}${n}`));
  if (groups.every((g) => !g)) return null;
  const prefixOf = (n: number) => groups[n - 1]?.combos.find((c) => c.endsWith(String(n)))?.slice(0, -1);
  const prefix = prefixOf(1);
  let run = 0;
  while (prefix !== undefined && run < 9 && prefixOf(run + 1) === prefix) run++;
  if (run >= 3) return [`${prefix}1-${run}`];
  // Custom layout: list group 1's keys and let search show the rest.
  return groups[0]?.combos ?? [];
}

/** The essential hotkeys, read from a parsed profile (or AoE4's defaults when there is none). Unbound ones are left out. */
export function resolveEssentials(binds: Keybind[] | null): EssentialBind[] {
  const byCommand = new Map((binds ?? []).map((b) => [b.command, b]));
  const out: EssentialBind[] = [];
  for (const e of ESSENTIALS) {
    let found: string[] | null = null;
    if (e.series) {
      found = seriesCombos(byCommand, e.series);
    } else {
      const bind = e.commands.map((c) => byCommand.get(c)).find(Boolean) ?? (e.match ? binds?.find((b) => e.match!.test(b.command)) : undefined);
      if (bind) found = bind.combos;
    }
    if (found) {
      if (found.length) out.push({ label: e.label, group: e.group, combos: found, source: "profile" });
    } else if (e.defaults) {
      out.push({ label: e.label, group: e.group, combos: e.defaults, source: "default" });
    }
  }
  return out;
}
