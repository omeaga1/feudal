import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { civs, getCiv } from "../lib/gameData";
import { Flag } from "./Flag";

const sortedCivs = [...civs].sort((a, b) => a.name.localeCompare(b.name));

/** Every civ as a flag tile. Typing filters the grid. */
export function FlagGrid({ value, onPick, autoFocus }: { value?: string; onPick: (civ: string) => void; autoFocus?: boolean }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? sortedCivs.filter((c) => c.name.toLowerCase().includes(q)) : sortedCivs;
  return (
    <div className="flag-grid-wrap">
      <input
        className="flag-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && shown[0] && onPick(shown[0].id)}
        placeholder="Type to filter civs"
        autoFocus={autoFocus}
      />
      <div className="flag-grid">
        {shown.map((c, i) => (
          <motion.button
            key={c.id}
            type="button"
            className={c.id === value ? "flag-tile active" : "flag-tile"}
            onClick={() => onPick(c.id)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 20) * 0.012 }}
            whileHover={{ y: -2 }}
          >
            <Flag civ={c.id} size="md" />
            <span>{c.name}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function Side({
  label,
  civ,
  player,
  editable,
  align,
  onChange,
}: {
  label: string;
  civ: string;
  player?: string;
  editable: boolean;
  align: "left" | "right";
  onChange?: (civ: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const civInfo = getCiv(civ);
  const content = (
    <>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={civ}
          className="versus-flag"
          initial={{ opacity: 0, scale: 0.8, rotate: align === "left" ? -6 : 6 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", stiffness: 380, damping: 26 }}
        >
          <Flag civ={civ} size="xl" />
        </motion.span>
      </AnimatePresence>
      <span className="versus-text">
        <span className="versus-label">{label}</span>
        <span className="versus-name">{civInfo?.name ?? civ}</span>
        {player && <span className="versus-player">{player}</span>}
        {!player && civInfo && <span className="versus-player">{civInfo.classes}</span>}
      </span>
    </>
  );

  return (
    <div className={`versus-side ${align}`} ref={ref}>
      {editable ? (
        <button type="button" className="versus-button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {content}
          <span className="versus-caret" aria-hidden="true">
            ▾
          </span>
        </button>
      ) : (
        <div className="versus-button static">{content}</div>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            className={`flag-popover ${align}`}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
          >
            <FlagGrid
              value={civ}
              autoFocus
              onPick={(c) => {
                onChange?.(c);
                setOpen(false);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface VersusProps {
  me: string;
  them: string;
  myName?: string;
  theirName?: string;
  editable?: boolean;
  onChange?: (me: string, them: string) => void;
}

/** "You vs Them" with big flags. Click a side to pick a different civ. */
export function VersusBar({ me, them, myName, theirName, editable = false, onChange }: VersusProps) {
  return (
    <section className="versus">
      <Side label="You" civ={me} player={myName} editable={editable} align="left" onChange={(c) => onChange?.(c, them)} />
      {editable ? (
        <motion.button
          type="button"
          className="versus-vs"
          title="Swap sides"
          whileHover={{ rotate: 180 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          onClick={() => onChange?.(them, me)}
        >
          VS
        </motion.button>
      ) : (
        <span className="versus-vs">VS</span>
      )}
      <Side label="Them" civ={them} player={theirName} editable={editable} align="right" onChange={(c) => onChange?.(me, c)} />
    </section>
  );
}

/** Search box for civs: type a name or a trait ("cavalry", "defense"), arrow keys to move, Enter to pick. Press / anywhere to focus it. */
export function CivSearch({ onPick }: { onPick: (civ: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  const results = q ? sortedCivs.filter((c) => c.name.toLowerCase().includes(q) || c.classes.toLowerCase().includes(q)).slice(0, 8) : [];

  useEffect(() => {
    const focus = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", focus);
    return () => document.removeEventListener("keydown", focus);
  }, []);

  const pick = (id: string) => {
    onPick(id);
    setQuery("");
    setOpen(false);
    input.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") setActive((i) => Math.min(i + 1, results.length - 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(i - 1, 0));
    else if (e.key === "Enter" && results[active]) pick(results[active].id);
    else if (e.key === "Escape") {
      setQuery("");
      input.current?.blur();
    }
  };

  return (
    <div className="civ-search">
      <input
        ref={input}
        className="search-input"
        value={query}
        placeholder="Search civs"
        aria-label="Search civs"
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <kbd className="civ-search-hint">/</kbd>
      <AnimatePresence>
        {open && q && (
          <motion.ul
            className="civ-search-results"
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
          >
            {results.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={i === active ? "active" : undefined}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(c.id)}
                >
                  <Flag civ={c.id} size="sm" />
                  <span className="civ-search-name">{c.name}</span>
                  <span className="civ-search-classes">{c.classes}</span>
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="civ-search-empty">No civ matches "{query}"</li>}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
