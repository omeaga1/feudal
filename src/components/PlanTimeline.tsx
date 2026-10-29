import NumberFlow from "@number-flow/react";
import { useEffect, useMemo, useRef } from "react";
import { resourceIcon } from "../lib/assets";
import { getCiv } from "../lib/gameData";
import { findUnit, formatClock, landmarkIcon, RESOURCES, type GamePlan, type SelectedPath } from "../lib/gamePlans";
import { frameAt, planOff, type BuildingKind, type Move, type Playback, type Production } from "../lib/playback";
import { Tip } from "./ui";
import type { IconType } from "react-icons";

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

const SEGMENTS = [...RESOURCES, "build"] as const;

function producersAt(pb: Playback, t: number) {
  const n = pb.production.producers.filter((p) => p.from <= t).length;
  return n > 1 ? `${n} producers` : "one Town Center";
}

/** How the Town Centers make villagers, in one line for the tooltip. */
function productionNote(p: Production): string {
  const start = `You start with ${p.start}${p.limited ? ` ${p.limited.name}s` : " villagers"}.`;
  if (p.limited) return `${start} Each Town Center trains a ${p.limited.name} every ${p.limited.trainTime}s up to ${p.limited.limit}, then villagers, nonstop.`;
  return `${start} Each Town Center trains ${p.batch > 1 ? `${p.batch} villagers` : "a villager"} every ${p.trainTime}s, nonstop.`;
}
const BAR_H = 176;

type Column =
  | { kind: "step"; i: number; e: Playback["events"][number] }
  | { kind: "age"; age: 2 | 3; at: number; node: SelectedPath["castle"] };

/**
 * The plan as one column per step: the villager split as a stacked bar with
 * counts, who moves where, the rally point and new buildings. Age-ups sit
 * between the columns. Click a column to jump there.
 */
export function PlanTimeline({
  pb,
  plan,
  path,
  t,
  onSeek,
  buildings,
}: {
  pb: Playback;
  plan: GamePlan;
  path: SelectedPath;
  t: number;
  onSeek: (s: number) => void;
  buildings: Record<BuildingKind, { icon: IconType; label: string }>;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const frame = frameAt(pb, t);
  const abbr = getCiv(plan.civ)?.abbr;
  const maxVils = Math.max(10, ...pb.events.map((e) => e.reached.length));
  const producing = pb.production.producers.filter((p) => p.from <= t).length;

  const columns = useMemo(() => {
    const out: Column[] = [];
    const ages = [
      { age: 2 as const, at: pb.feudalAt, node: path.feudal },
      { age: 3 as const, at: pb.castleAt, node: path.castle },
    ];
    pb.events.forEach((e, i) => {
      while (ages.length && ages[0].at <= e.seconds) out.push({ kind: "age", ...ages.shift()! });
      out.push({ kind: "step", i, e });
    });
    ages.forEach((a) => out.push({ kind: "age", ...a }));
    return out;
  }, [pb, path]);

  // Keep the current step in view as playback moves on.
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(".tlc.now");
    if (!el || !strip.current) return;
    const box = strip.current;
    const left = el.offsetLeft - box.offsetLeft;
    if (left < box.scrollLeft + 40 || left + el.offsetWidth > box.scrollLeft + box.clientWidth - 40) {
      box.scrollTo({ left: left - box.clientWidth / 3, behavior: "smooth" });
    }
  }, [frame.index]);

  // Each column shows what its step builds up to by the next step.
  const counts = (e: Playback["events"][number]) => SEGMENTS.map((s) => e.reached.filter((v) => v.at === s).length);

  return (
    <div className="tl">
      <div className="tl-now">
        <div className="tl-now-split">
          {RESOURCES.map((r) => {
            const n = frame.villagers.filter((v) => v.at === r).length;
            return (
              <span key={r} className={`tl-big ${r}${n ? "" : " zero"}`}>
                <img src={resourceIcon(r)} alt={r} />
                <NumberFlow value={n} />
              </span>
            );
          })}
          {frame.villagers.some((v) => v.at === "build") && (
            <span className="tl-big build">
              <span aria-hidden="true">⚒</span>
              <NumberFlow value={frame.villagers.filter((v) => v.at === "build").length} />
            </span>
          )}
        </div>
        <Tip label={`${productionNote(pb.production)}${pb.production.producers.length > 1 ? " " + pb.production.producers.map((p) => `${p.label} from ${formatClock(p.from)}`).join(", ") + "." : ""}`}>
          <span className="tl-prod">
            <img src={resourceIcon("villager")} alt="" />
            <b>
              <NumberFlow value={frame.villagers.length} />
            </b>
            <span>
              {producing} TC{producing > 1 ? "s" : ""} · {pb.production.batch > 1 ? `${pb.production.batch} per ` : ""}
              {pb.production.trainTime}s
            </span>
          </span>
        </Tip>
        <div className="tl-now-step">
          <span className="tl-now-t">{frame.current?.step.t ?? "0:00"}</span>
          <span className="tl-now-do">{frame.current?.step.do ?? "Game starts"}</span>
        </div>
      </div>

      <div className="tlc-strip" ref={strip}>
        {columns.map((c) => {
          if (c.kind === "age") {
            const icon = landmarkIcon(c.node.landmark);
            return (
              <button type="button" key={`age${c.age}`} className={`tlc-age a${c.age}${c.at <= t ? " on" : ""}`} onClick={() => onSeek(c.at)}>
                <span className="tlc-t">{c.node.ageUp}</span>
                <span className="tlc-age-name">{c.age === 2 ? "Feudal" : "Castle"}</span>
                {icon && <img className="tlc-landmark" src={icon} alt={c.node.landmark ?? ""} title={c.node.landmark} />}
                <span className="tlc-army">
                  {(c.node.army ?? []).slice(0, 3).map((n) => {
                    const u = findUnit(n, abbr);
                    return u ? <img key={n} src={u.icon} alt={n} title={n} /> : null;
                  })}
                </span>
              </button>
            );
          }
          const { i, e } = c;
          const n = counts(e);
          const state = i === frame.index ? " now" : i < frame.index ? " done" : "";
          const rallyChanged = i === 0 || pb.events[i - 1].rally !== e.rally;
          const moves = e.moves.filter((m) => m.from !== "tc" || m.to !== e.rally);
          const fresh = e.trained + e.moves.filter((m) => m.from === "tc" && m.to === e.rally).reduce((a, m) => a + m.n, 0);
          const off = planOff(pb, i);
          return (
            <Tip
              key={i}
              label={`${e.step.t} · ${e.step.do}${Math.abs(off) >= 2 ? ` · The plan counts ${e.planned.length} villagers here; ${producersAt(pb, e.seconds)} training nonstop ${off > 0 ? `can only make ${e.reached.length} before the next step` : `have already made ${e.villagers.length} by ${e.step.t}`}.` : ""}`}
            >
              <button type="button" className={`tlc${state}`} onClick={() => onSeek(e.seconds)}>
                <span className="tlc-t">{e.step.t}</span>
                <span className="tlc-bar" style={{ height: BAR_H }}>
                  <span className="tlc-total">
                    {e.reached.length}
                    {Math.abs(off) >= 2 && <span className="tlc-ahead">plan {e.planned.length}</span>}
                  </span>
                  {SEGMENTS.map((s, k) =>
                    n[k] ? (
                      <span key={s} className={`tlc-seg ${s}`} style={{ height: (n[k] / maxVils) * (BAR_H - 18) }}>
                        {(n[k] / maxVils) * (BAR_H - 18) >= 13 && n[k]}
                      </span>
                    ) : null,
                  )}
                </span>
                <span className={`tlc-rally ${e.rally}${rallyChanged ? " changed" : ""}`}>
                  <span aria-hidden="true">⚑</span>
                  <img src={resourceIcon(e.rally)} alt={`rally to ${e.rally}`} />
                  {fresh > 0 && <b>+{fresh}</b>}
                </span>
                <span className="tlc-moves">
                  {moves.slice(0, 3).map((m, k) => (
                    <span key={k} className="tlc-move">
                      <b>{m.n}</b>
                      <SlotIcon slot={m.from} />
                      <span className="move-arrow" aria-hidden="true">›</span>
                      <SlotIcon slot={m.to} />
                    </span>
                  ))}
                </span>
                <span className="tlc-builds">
                  {e.newBuildings.slice(0, 4).map((b) => {
                    const { icon: Icon, label } = buildings[b];
                    return <Icon key={b} aria-label={label} title={label} />;
                  })}
                </span>
              </button>
            </Tip>
          );
        })}
      </div>
    </div>
  );
}
