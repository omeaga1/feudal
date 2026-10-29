import { HoverCard, Tooltip } from "radix-ui";
import type { ReactElement, ReactNode } from "react";
import { resourceIcon } from "../lib/assets";
import type { Unit } from "../lib/gameData";

/** Wraps the app once so every tooltip shares one quick open delay. */
export function TipProvider({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={120} skipDelayDuration={300}>
      {children}
    </Tooltip.Provider>
  );
}

/** A small dark label on hover or focus. The child must be a single element. */
export function Tip({ label, children, side = "top" }: { label: ReactNode; children: ReactElement; side?: "top" | "right" | "bottom" | "left" }) {
  if (label === undefined || label === null || label === "") return children;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tip" side={side} sideOffset={6} collisionPadding={8}>
          {label}
          <Tooltip.Arrow className="tip-arrow" width={10} height={5} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

const AGE_NAMES = ["", "Dark", "Feudal", "Castle", "Imperial"];
const AGE_NUMERALS = ["", "I", "II", "III", "IV"];

/** An age as a roman-numeral medallion in that age's color, with its name beside it. */
export function AgeMark({ age, label = true }: { age: number; label?: boolean }) {
  const name = `${AGE_NAMES[age]} Age`;
  return (
    <Tip label={label ? undefined : name}>
      <span className={`age-mark age-${age}`} aria-label={label ? undefined : name}>
        <span className="age-coin" aria-hidden="true">
          {AGE_NUMERALS[age]}
        </span>
        {label && <span className="age-name">{name}</span>}
      </span>
    </Tip>
  );
}
const COST_KEYS = ["food", "wood", "gold", "stone"] as const;

function UnitStats({ unit }: { unit: Unit }) {
  const weapon = unit.weapons.find((w) => w.damage > 0);
  const armor = unit.armor.filter((a) => a.value > 0);
  return (
    <div className="unit-card">
      <div className="unit-card-head">
        <img src={unit.icon} alt="" />
        <div>
          <div className="unit-card-name">{unit.name}</div>
          <div className="unit-card-sub">
            {AGE_NAMES[unit.age]} Age · {unit.displayClasses[0] ?? unit.classes[0]}
          </div>
        </div>
      </div>
      <div className="unit-card-costs">
        {COST_KEYS.map((k) =>
          unit.costs[k] > 0 ? (
            <span key={k} className={`cost ${k}`}>
              <img src={resourceIcon(k)} alt={k} />
              {unit.costs[k]}
            </span>
          ) : null,
        )}
      </div>
      <dl className="unit-card-stats">
        <div>
          <dt>HP</dt>
          <dd>{unit.hitpoints}</dd>
        </div>
        {weapon && (
          <div>
            <dt>Damage</dt>
            <dd>{weapon.damage}</dd>
          </div>
        )}
        {armor.map((a) => (
          <div key={a.type}>
            <dt>{a.type === "melee" ? "Melee armor" : a.type === "ranged" ? "Ranged armor" : a.type}</dt>
            <dd>{a.value}</dd>
          </div>
        ))}
      </dl>
      {weapon?.modifiers && weapon.modifiers.length > 0 && (
        <div className="unit-card-bonus">
          {weapon.modifiers.slice(0, 2).map((m, i) => (
            <span key={i}>
              +{m.value} vs <span className="bonus-target">{m.target[0]?.join(" ").replace(/_/g, " ")}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** A unit's game icon. Hovering opens a card with its cost and key stats. */
export function UnitHover({ unit, children }: { unit: Unit | undefined; children: ReactElement }) {
  if (!unit) return children;
  return (
    <HoverCard.Root openDelay={150} closeDelay={60}>
      <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content className="hover-card" side="top" sideOffset={8} collisionPadding={8}>
          <UnitStats unit={unit} />
          <HoverCard.Arrow className="tip-arrow" width={12} height={6} />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
