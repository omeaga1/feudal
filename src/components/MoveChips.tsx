import { resourceIcon } from "../lib/assets";
import type { Move } from "../lib/playback";
import { Tip } from "./ui";

const SLOT_NAMES = { tc: "New", food: "Food", wood: "Wood", gold: "Gold", stone: "Stone", build: "Build" } as const;

function SlotIcon({ slot }: { slot: Move["from"] }) {
  if (slot === "build") return <span className="move-hammer" aria-label="builders">⚒</span>;
  return <img src={resourceIcon(slot === "tc" ? "villager" : slot)} alt={SLOT_NAMES[slot]} />;
}

/** A step's villager moves as chips: "4 [sheep] → [hammer]". New villagers come from the Town Center. */
export function MoveChips({ moves }: { moves: Move[] }) {
  return (
    <span className="move-chips">
      {moves.map((m, i) => (
        <Tip key={i} label={`${m.n} ${m.from === "tc" ? "new villager" + (m.n > 1 ? "s" : "") : `from ${SLOT_NAMES[m.from].toLowerCase()}`} to ${SLOT_NAMES[m.to].toLowerCase()}`}>
          <span className={`move-chip from-${m.from} to-${m.to}`}>
            <b>{m.n}</b>
            <SlotIcon slot={m.from} />
            <span className="move-arrow" aria-hidden="true">→</span>
            <SlotIcon slot={m.to} />
          </span>
        </Tip>
      ))}
    </span>
  );
}
