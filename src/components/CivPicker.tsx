import { Command } from "cmdk";
import { ArrowLeftRight, ChevronDown, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Popover } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { civs, getCiv } from "../lib/gameData";
import { Flag } from "./Flag";
import { Tip } from "./ui";

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

  if (!editable) {
    return (
      <div className={`versus-side ${align}`}>
        <div className="versus-button static">{content}</div>
      </div>
    );
  }
  return (
    <div className={`versus-side ${align}`}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button type="button" className="versus-button">
            {content}
            <ChevronDown className="versus-caret" size={18} aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="flag-popover" align={align === "left" ? "start" : "end"} sideOffset={8} collisionPadding={12}>
            <FlagGrid
              value={civ}
              autoFocus
              onPick={(c) => {
                onChange?.(c);
                setOpen(false);
              }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
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
        <Tip label="Swap sides">
          <motion.button
            type="button"
            className="versus-vs swap"
            aria-label="Swap sides"
            whileHover={{ scale: 1.06 }}
            whileTap={{ rotate: 180 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            onClick={() => onChange?.(them, me)}
          >
            <span className="vs-text">VS</span>
            <ArrowLeftRight className="vs-swap" size={20} aria-hidden="true" />
          </motion.button>
        </Tip>
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
  const input = useRef<HTMLInputElement>(null);

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

  return (
    <Command className="civ-search" label="Search civs" loop>
      <Search className="civ-search-icon" size={16} aria-hidden="true" />
      <Command.Input
        ref={input}
        className="search-input"
        value={query}
        placeholder="Search civs or traits"
        onValueChange={(v) => {
          setQuery(v);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQuery("");
            input.current?.blur();
          }
        }}
      />
      <kbd className="civ-search-hint">/</kbd>
      <AnimatePresence>
        {open && query.trim() && (
          <motion.div
            className="civ-search-results"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
          >
            <Command.List>
              <Command.Empty className="civ-search-empty">No civ matches "{query}"</Command.Empty>
              {sortedCivs.map((c) => (
                <Command.Item
                  key={c.id}
                  value={c.name}
                  keywords={c.classes.split(",").map((k) => k.trim())}
                  onMouseDown={(e) => e.preventDefault()}
                  onSelect={() => pick(c.id)}
                  className="civ-search-item"
                >
                  <Flag civ={c.id} size="sm" />
                  <span className="civ-search-name">{c.name}</span>
                  <span className="civ-search-classes">{c.classes}</span>
                </Command.Item>
              ))}
            </Command.List>
          </motion.div>
        )}
      </AnimatePresence>
    </Command>
  );
}
