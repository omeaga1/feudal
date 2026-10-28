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
