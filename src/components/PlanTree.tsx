import { Timer } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { GiHammerNails } from "react-icons/gi";
import { resourceIcon } from "../lib/assets";
import { getCiv } from "../lib/gameData";
import { findUnit, landmarkIcon, RESOURCES, STYLE_LABELS, type FeudalPath, type GamePlan, type PlanNode, type Split } from "../lib/gamePlans";
import { Tip, UnitHover } from "./ui";

export interface PlanSelection {
  feudal: string;
  castle: string;
}

export function defaultSelection(plan: GamePlan): PlanSelection {
  return { feudal: plan.feudal[0].id, castle: plan.feudal[0].castle[0].id };
}

/** Resolves a selection against a plan, falling back to the first path when ids don't match. */
export function resolveSelection(plan: GamePlan, sel: PlanSelection | null) {
  const feudal = plan.feudal.find((f) => f.id === sel?.feudal) ?? plan.feudal[0];
  const castle = feudal.castle.find((c) => c.id === sel?.castle) ?? feudal.castle[0];
  return { feudal, castle };
}

export function UnitIcons({ names, civ, size = "sm" }: { names?: string[]; civ: string; size?: "sm" | "md" }) {
  if (!names?.length) return null;
  const abbr = getCiv(civ)?.abbr;
  return (
    <span className={`unit-icons ${size}`}>
      {names.map((n) => {
        const u = findUnit(n, abbr);
        return u ? (
          <UnitHover key={n} unit={u}>
            <img src={u.icon} alt={n} loading="lazy" />
          </UnitHover>
        ) : (
          <span key={n} className="unit-chip">
            {n}
          </span>
        );
      })}
    </span>
  );
}

/** Villager counts as resource icons with numbers, skipping empty resources. */
export function SplitChips({ split, builders }: { split?: Split; builders?: number }) {
  if (!split && !builders) return null;
  return (
    <span className="split">
      {split?.map((n, i) =>
        n > 0 ? (
          <Tip key={RESOURCES[i]} label={`${n} on ${RESOURCES[i]}`}>
            <span className={`split-chip ${RESOURCES[i]}`}>
              <img src={resourceIcon(RESOURCES[i])} alt={RESOURCES[i]} />
              {n}
            </span>
          </Tip>
        ) : null,
      )}
      {builders ? (
        <Tip label="Building">
          <span className="split-chip builders">
            <GiHammerNails className="hammer" aria-hidden="true" />
            {builders}
          </span>
        </Tip>
      ) : null}
    </span>
  );
}

export function AgeTime({ label, children }: { label: string; children: string }) {
  return (
    <Tip label={label}>
      <span className="age-time">
        <Timer size={12} strokeWidth={2.5} aria-hidden="true" />
        {children}
      </span>
    </Tip>
  );
}

function PlanCard({
  node,
  civ,
  selected,
  dimmed,
  onClick,
}: {
  node: PlanNode;
  civ: string;
  selected: boolean;
  dimmed?: boolean;
  onClick: () => void;
}) {
  const icon = landmarkIcon(node.landmark);
  return (
    <motion.button
      layout
      type="button"
      className={`plan-card style-${node.style}${selected ? " selected" : ""}${dimmed ? " dimmed" : ""}`}
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
    >
      <span className="plan-card-top">
        <span className="style-tag">{STYLE_LABELS[node.style]}</span>
        <AgeTime label="Reach the next age by">{node.ageUp}</AgeTime>
      </span>
      <span className="plan-card-name">{node.name}</span>
      {node.landmark && (
        <span className="plan-card-landmark">
          {icon && <img src={icon} alt="" loading="lazy" />}
          {node.landmark}
        </span>
      )}
      <UnitIcons names={node.army} civ={civ} />
      <span className="plan-card-pick">{node.pick}</span>
    </motion.button>
  );
}

/** A curve from (x1,y1) to (x2,y2) in a 100x100 box. */
function curve(y1: number, y2: number) {
  return `M0,${y1} C50,${y1} 50,${y2} 100,${y2}`;
}

function Connector({ from, to, active }: { from: number; to: number[]; active: number | null }) {
  return (
    <svg className="plan-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {to.map((y, i) => (
        <motion.path
          key={`${from}-${y}`}
          d={curve(from, y)}
          className={active === i ? "link active" : "link"}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

function OpeningCard({ plan }: { plan: GamePlan }) {
  const last = plan.opening.steps[plan.opening.steps.length - 1];
  return (
    <div className="plan-card opening">
      <span className="plan-card-top">
        <span className="style-tag">Dark Age</span>
        <AgeTime label="Pick your path by">{plan.opening.decideAt}</AgeTime>
      </span>
      <span className="plan-card-name">Opening</span>
      <SplitChips split={last?.v} />
      <ol className="mini-steps">
        {plan.opening.steps.map((s) => (
          <li key={s.t + s.do}>
            <span className="t">{s.t}</span> {s.do}
          </li>
        ))}
      </ol>
      <span className="plan-card-pick">Choose your Feudal path by {plan.opening.decideAt}</span>
    </div>
  );
}

const AGE_HEADS = ["Dark Age", "Feudal Age", "Castle Age"];

/**
 * The branching plan: the opening, two Feudal paths, and the Castle paths
 * under the chosen one. `full` shows all four Castle paths at once.
 */
export function PlanTree({
  plan,
  selection,
  onSelect,
  full = false,
}: {
  plan: GamePlan;
  selection: PlanSelection;
  onSelect: (s: PlanSelection) => void;
  full?: boolean;
}) {
  const { feudal, castle } = resolveSelection(plan, selection);
  const feudalIndex = plan.feudal.indexOf(feudal);
  const feudalY = plan.feudal.map((_, i) => ((i + 0.5) / plan.feudal.length) * 100);
  const pickFeudal = (f: FeudalPath) => onSelect({ feudal: f.id, castle: f.id === feudal.id ? castle.id : f.castle[0].id });

  const castleCards: { parent: FeudalPath; node: PlanNode }[] = full
    ? plan.feudal.flatMap((f) => f.castle.map((node) => ({ parent: f, node })))
    : feudal.castle.map((node) => ({ parent: feudal, node }));
  const castleY = castleCards.map((_, i) => ((i + 0.5) / castleCards.length) * 100);

  return (
    <div className={`plan-tree${full ? " full" : ""}`}>
      {AGE_HEADS.map((h, i) => (
        <div key={h} className={`plan-head col-${i * 2 + 1}`}>
          {h}
        </div>
      ))}
      <div className="plan-col col-1 center">
        <OpeningCard plan={plan} />
      </div>
      <div className="plan-gap col-2">
        <Connector from={50} to={feudalY} active={feudalIndex} />
      </div>
      <div className="plan-col col-3">
        {plan.feudal.map((f) => (
          <PlanCard key={f.id} node={f} civ={plan.civ} selected={f.id === feudal.id} onClick={() => pickFeudal(f)} />
        ))}
      </div>
      <div className="plan-gap col-4">
        {full ? (
          plan.feudal.map((f, fi) => {
            const ys = castleCards.map((c, i) => (c.parent === f ? castleY[i] : null)).filter((y): y is number => y !== null);
            const activeIndex = f.id === feudal.id ? f.castle.findIndex((c) => c.id === castle.id) : null;
            return (
              <svg key={f.id} className="plan-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {ys.map((y, i) => (
                  <path
                    key={y}
                    d={curve(feudalY[fi], y)}
                    className={activeIndex === i ? "link active" : f.id === feudal.id ? "link" : "link faint"}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            );
          })
        ) : (
          <Connector key={feudal.id} from={feudalY[feudalIndex]} to={castleY} active={feudal.castle.indexOf(castle)} />
        )}
      </div>
      <div className="plan-col col-5">
        <AnimatePresence mode="popLayout" initial={false}>
          {castleCards.map(({ parent, node }) => (
            <PlanCard
              key={`${parent.id}/${node.id}`}
              node={node}
              civ={plan.civ}
              selected={parent.id === feudal.id && node.id === castle.id}
              dimmed={full && parent.id !== feudal.id}
              onClick={() => onSelect({ feudal: parent.id, castle: node.id })}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
