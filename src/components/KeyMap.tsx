import { motion } from "motion/react";
import { ToggleGroup } from "radix-ui";
import { useMemo, useState } from "react";
import essentials from "../data/essentials.json";
import { findUnit } from "../lib/gamePlans";
import { CounterRow, type CounterUnit } from "./CounterRow";

interface Bind {
  keys: string[];
  action: string;
  group: string;
}

const groups = essentials.groups;
const allBinds: Bind[] = groups.flatMap((g) => g.binds.map((b) => ({ ...b, group: g.id })));

// Keyboard rows: [label, width in key units]. Labels match the keys used in essentials.json.
const ROWS: [string, number][][] = [
  [["Esc", 1], ["F1", 1], ["F2", 1], ["F3", 1], ["F4", 1], ["F5", 1], ["F6", 1], ["F7", 1], ["F8", 1], ["F9", 1], ["F10", 1], ["F11", 1], ["F12", 1]],
  [["`", 1], ["1", 1], ["2", 1], ["3", 1], ["4", 1], ["5", 1], ["6", 1], ["7", 1], ["8", 1], ["9", 1], ["0", 1], ["-", 1], ["=", 1], ["Back", 2]],
  [["Tab", 1.5], ["Q", 1], ["W", 1], ["E", 1], ["R", 1], ["T", 1], ["Y", 1], ["U", 1], ["I", 1], ["O", 1], ["P", 1], ["[", 1], ["]", 1], ["\\", 1.5]],
  [["Caps", 1.75], ["A", 1], ["S", 1], ["D", 1], ["F", 1], ["G", 1], ["H", 1], ["J", 1], ["K", 1], ["L", 1], [";", 1], ["'", 1], ["Enter", 2.25]],
  [["Shift", 2.25], ["Z", 1], ["X", 1], ["C", 1], ["V", 1], ["B", 1], ["N", 1], ["M", 1], [",", 1], [".", 1], ["/", 1], ["RShift", 2.75]],
  [["Ctrl", 1.5], ["Win", 1.25], ["Alt", 1.25], ["Space", 6.25], ["RAlt", 1.25], ["Menu", 1.25], ["RCtrl", 1.5]],
];
const MODIFIERS = new Set(["Ctrl", "Shift", "Alt"]);
const G_KEYS = ["G1", "G2", "G3", "G4", "G5", "G6", "G7"];

/** The physical keys a bind touches; "1-9" lights the number row. */
function physicalKeys(bind: Bind): string[] {
  return bind.keys.flatMap((k) => (k === "1-9" ? ["1", "2", "3", "4", "5", "6", "7", "8", "9"] : [k]));
}

function KeyCap({
  label,
  width,
  binds,
  focus,
  onHover,
}: {
  label: string;
  width?: number;
  binds: Bind[];
  focus: string | null;
  onHover: (key: string | null) => void;
}) {
  const main = binds.find((b) => !b.keys.every((k) => MODIFIERS.has(k)) && physicalKeys(b).includes(label) && !MODIFIERS.has(label));
  const group = main?.group ?? (binds.length ? "modifier" : null);
  const lit = group !== null && (focus === null || binds.some((b) => b.group === focus));
  const display = label === "RShift" ? "Shift" : label === "RCtrl" ? "Ctrl" : label === "RAlt" ? "Alt" : label;
  return (
    <span
      className={`keycap${group ? ` g-${group}` : ""}${lit ? " lit" : ""}${focus && !lit ? " dim" : ""}`}
      style={{ flexGrow: width ?? 1, flexBasis: 0 }}
      onMouseEnter={() => binds.length && onHover(label)}
      onMouseLeave={() => onHover(null)}
    >
      {display}
    </span>
  );
}

/** A lit-up keyboard, mouse and G-key pad for the hotkeys that matter most, colored by group. */
export function KeyMap() {
  const [focus, setFocus] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const bindsByKey = useMemo(() => {
    const map = new Map<string, Bind[]>();
    for (const b of allBinds) for (const k of physicalKeys(b)) map.set(k, [...(map.get(k) ?? []), b]);
    return map;
  }, []);
  const binds = (k: string) => bindsByKey.get(k) ?? [];
  const hovered = hoverKey ? binds(hoverKey).filter((b) => !b.keys.every((k) => MODIFIERS.has(k))) : [];

  return (
    <section className="panel keymap">
      <div className="panel-head">
        <h3>Essential hotkeys</h3>
        <span className="muted small">From your keybind sheet. Hover a key or a group.</span>
      </div>
      <div className="group-legend">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`legend-chip g-${g.id}${focus === g.id ? " active" : ""}`}
            onMouseEnter={() => setFocus(g.id)}
            onMouseLeave={() => setFocus(null)}
            onFocus={() => setFocus(g.id)}
            onBlur={() => setFocus(null)}
          >
            <span className="dot" />
            {g.name}
          </button>
        ))}
      </div>
      <div className="keymap-body">
        <div className="keyboard">
          {ROWS.map((row, i) => (
            <div key={i} className="key-row">
              {row.map(([label, width]) => (
                <KeyCap key={label} label={label} width={width} binds={binds(label === "RShift" ? "Shift" : label === "RCtrl" ? "Ctrl" : label)} focus={focus} onHover={setHoverKey} />
              ))}
            </div>
          ))}
        </div>
        <div className="mouse-and-pad">
          <div className="mouse" aria-label="Mouse side buttons">
            <div className="mouse-shell">
              <span className="mouse-split" />
              {["Mouse5", "Mouse4"].map((m) => (
                <span
                  key={m}
                  className={`mouse-btn ${m === "Mouse4" ? "m4" : "m5"}${binds(m).length ? ` g-${binds(m)[0].group} lit` : ""}${focus && !binds(m).some((b) => b.group === focus) ? " dim" : ""}`}
                  onMouseEnter={() => setHoverKey(m)}
                  onMouseLeave={() => setHoverKey(null)}
                >
                  {m === "Mouse4" ? "M4" : "M5"}
                </span>
              ))}
            </div>
          </div>
          <div className="gpad" aria-label="G keys">
            {G_KEYS.map((g) => (
              <span
                key={g}
                className={`keycap gkey${binds(g).length ? ` g-${binds(g)[0].group} lit` : ""}${focus && !binds(g).some((b) => b.group === focus) ? " dim" : ""}`}
                onMouseEnter={() => setHoverKey(g)}
                onMouseLeave={() => setHoverKey(null)}
              >
                {g}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="keymap-readout">
        {hovered.length > 0 ? (
          hovered.map((b) => (
            <motion.span key={b.action} className={`readout g-${b.group}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
              <Combo keys={b.keys} /> {b.action}
            </motion.span>
          ))
        ) : (
          <span className="muted small">
            {focus ? groups.find((g) => g.id === focus)?.binds.map((b) => b.action).join(" · ") : "Hover a lit key to see what it does."}
          </span>
        )}
      </div>
      <div className="group-cards">
        {groups.map((g) => (
          <div key={g.id} className={`group-card g-${g.id}${focus && focus !== g.id ? " dim" : ""}`} onMouseEnter={() => setFocus(g.id)} onMouseLeave={() => setFocus(null)}>
            <div className="group-card-name">{g.name}</div>
            {g.binds.map((b) => (
              <div key={b.action} className="group-bind">
                <Combo keys={b.keys} />
                <span>{b.action}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function Combo({ keys }: { keys: string[] }) {
  const sep = keys.length === 2 && keys[0] === "." ? "then" : "+";
  return (
    <span className="combo">
      {keys.map((k, i) => (
        <span key={k}>
          {i > 0 && <span className="combo-sep">{sep}</span>}
          <kbd>{k.replace("Mouse", "M")}</kbd>
        </span>
      ))}
    </span>
  );
}

const ALIASES: Record<string, string> = { Trebuchet: "Counterweight Trebuchet" };
const CATEGORY_NAMES: Record<string, string> = { Barracks: "Infantry", "Archery Range": "Ranged", Stable: "Cavalry" };
const CATEGORIES = ["All", ...new Set(essentials.counters.map((c) => c.building))];

function unitOf(name: string): CounterUnit {
  const unit = name === "Buildings" ? undefined : findUnit(ALIASES[name] ?? name);
  return { name, icon: unit?.icon, unit };
}

/** The counter cheat sheet: find their unit, build what's next to it. */
export function CounterChart() {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = (name: string) => name.toLowerCase().includes(q);
  const rows = essentials.counters.filter((c) => (category === "All" || c.building === category) && (!q || matches(c.unit) || c.losesTo.some(matches)));
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Counters</h3>
        <span className="muted small">Find their unit, build what's next to it.</span>
      </div>
      <div className="counter-tools">
        <ToggleGroup.Root className="segmented" type="single" value={category} onValueChange={(v) => v && setCategory(v)} aria-label="Unit type">
          {CATEGORIES.map((c) => (
            <ToggleGroup.Item key={c} value={c} className="segmented-item">
              {c === category && <motion.span layoutId="counter-seg" className="segmented-thumb" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span>{CATEGORY_NAMES[c] ?? c}</span>
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
        <input className="search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a unit" aria-label="Search a unit" />
      </div>
      <div className="counter-list">
        {rows.map((c) => (
          <CounterRow key={c.unit} enemy={unitOf(c.unit)} answers={c.losesTo.map(unitOf)} note={`Weak: ${c.weakness.toLowerCase()}`} />
        ))}
        {rows.length === 0 && <p className="muted">No unit matches "{query}".</p>}
      </div>
    </section>
  );
}
