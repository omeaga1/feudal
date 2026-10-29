import NumberFlow from "@number-flow/react";
import { useMemo, useRef } from "react";
import { resourceIcon } from "../lib/assets";
import { getCiv } from "../lib/gameData";
import { findUnit, formatClock, landmarkIcon, RESOURCES, type GamePlan, type SelectedPath } from "../lib/gamePlans";
import { frameAt, type BuildingKind, type Playback } from "../lib/playback";
import { Tip } from "./ui";
import type { IconType } from "react-icons";

const W = 1000;
const VIL_H = 120;
/** Room left of the lanes for their labels; matches .tl-lanes padding. */
const LABEL_W = 74;

/** Greedy rows so labels placed by time don't overlap: each row holds items at least `gap` seconds apart. */
function rows<T extends { seconds: number }>(items: T[], gap: number, max: number): (T & { row: number })[] {
  const lastAt: number[] = [];
  return items.map((it) => {
    let row = lastAt.findIndex((x) => it.seconds - x >= gap);
    if (row < 0) row = lastAt.length < max ? lastAt.length : lastAt.indexOf(Math.min(...lastAt));
    lastAt[row] = it.seconds;
    return { ...it, row };
  });
}

/**
 * The whole plan on one time axis: age bands, the villager split as stacked
 * bands with counts, every step, buildings and the army, with a playhead.
 * Click anywhere to jump there.
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
  const ref = useRef<HTMLDivElement>(null);
  const frame = frameAt(pb, t);
  const pct = (s: number) => `${(s / pb.end) * 100}%`;
  const abbr = getCiv(plan.civ)?.abbr;

  const points = useMemo(() => pb.events.filter((e, i) => i === 0 || e.villagers !== pb.events[i - 1].villagers), [pb]);
  const maxVils = Math.max(10, ...points.map((p) => p.villagers.length));
  const x = (s: number) => (s / pb.end) * W;
  const y = (n: number) => VIL_H - (n / maxVils) * (VIL_H - 6);
  const counts = (e: (typeof points)[number]) => [...RESOURCES.map((r) => e.villagers.filter((v) => v.at === r).length), e.villagers.filter((v) => v.at === "build").length];
  const layers = [0, 1, 2, 3, 4].map((layer) => {
    const top: string[] = [];
    const bottom: string[] = [];
    points.forEach((p, i) => {
      const c = counts(p);
      const lo = c.slice(0, layer).reduce((a, b) => a + b, 0);
      const hi = lo + c[layer];
      const nx = x(i + 1 < points.length ? points[i + 1].seconds : pb.end);
      top.push(`${x(p.seconds)},${y(hi)}`, `${nx},${y(hi)}`);
      bottom.unshift(`${nx},${y(lo)}`, `${x(p.seconds)},${y(lo)}`);
    });
    return `M${top.join(" L")} L${bottom.join(" L")} Z`;
  });

  const steps = rows(
    pb.events.map((e, i) => ({ seconds: e.seconds, i, e })),
    pb.end * 0.17,
    3,
  );
  const builds = rows(
    pb.events.flatMap((e) => e.newBuildings.map((kind) => ({ seconds: e.seconds, kind }))),
    pb.end * 0.025,
    2,
  );
  const ages = [
    { node: path.feudal, at: pb.feudalAt, age: "Feudal" },
    { node: path.castle, at: pb.castleAt, age: "Castle" },
  ];

  const seek = (e: React.MouseEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    onSeek(Math.max(0, Math.min(pb.end, ((e.clientX - box.left - LABEL_W) / (box.width - LABEL_W)) * pb.end)));
  };

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
        <div className="tl-now-step">
          <span className="tl-now-t">{frame.current?.step.t ?? "0:00"}</span>
          <span className="tl-now-do">{frame.current?.step.do ?? "Game starts"}</span>
        </div>
      </div>

      <div className="tl-lanes" ref={ref} onClick={seek}>
        <div className="tl-ages">
          <span className="tl-age a1" style={{ left: 0, width: pct(pb.feudalAt) }}>
            Dark
          </span>
          <span className="tl-age a2" style={{ left: pct(pb.feudalAt), width: pct(pb.castleAt - pb.feudalAt) }}>
            Feudal
          </span>
          <span className="tl-age a3" style={{ left: pct(pb.castleAt), right: 0 }}>
            Castle
          </span>
        </div>

        <div className="tl-lane vils">
          <span className="tl-lane-label">Villagers</span>
          <svg viewBox={`0 0 ${W} ${VIL_H}`} preserveAspectRatio="none" className="tl-vil-svg" aria-hidden="true">
            {layers.map((d, i) => (
              <path key={i} d={d} className={`vil-layer ${i < 4 ? RESOURCES[i] : "builders"}`} />
            ))}
          </svg>
          {points.map((p, i) => {
            const nx = i + 1 < points.length ? points[i + 1].seconds : pb.end;
            const wide = (nx - p.seconds) / pb.end > 0.045;
            return (
              <span key={p.seconds} className="tl-total" style={{ left: pct(p.seconds), bottom: `${((p.villagers.length / maxVils) * (VIL_H - 6) * 100) / VIL_H}%` }}>
                {wide || i === points.length - 1 ? p.villagers.length : ""}
              </span>
            );
          })}
        </div>

        <div className="tl-lane steps" style={{ height: `${Math.max(...steps.map((s) => s.row), 0) * 30 + 34}px` }}>
          <span className="tl-lane-label">Steps</span>
          {steps.map(({ i, e, row }) => {
            const state = i === frame.index ? " now" : i < frame.index ? " done" : "";
            return (
              <Tip key={i} label={`${e.step.t} · ${e.step.do}`}>
                <button
                  type="button"
                  className={`tl-step${state}${e.seconds / pb.end > 0.84 ? " end" : ""}`}
                  style={e.seconds / pb.end > 0.84 ? { right: `${(1 - e.seconds / pb.end) * 100}%`, top: `${row * 30 + 4}px` } : { left: pct(e.seconds), top: `${row * 30 + 4}px` }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSeek(e.seconds);
                  }}
                >
                  <span className="tl-step-t">{e.step.t}</span>
                  <span className="tl-step-do">{e.step.do}</span>
                </button>
              </Tip>
            );
          })}
        </div>

        <div className="tl-lane builds">
          <span className="tl-lane-label">Build</span>
          {builds.map(({ seconds, kind, row }) => {
            const { icon: Icon, label } = buildings[kind];
            return (
              <Tip key={kind} label={`${label} at ${formatClock(seconds)}`}>
                <span className={`tl-building${seconds <= t ? " on" : ""}`} style={{ left: pct(seconds), top: `${row * 30 + 4}px` }}>
                  <Icon aria-label={label} />
                </span>
              </Tip>
            );
          })}
          {ages.map(({ node, at }) => {
            const icon = landmarkIcon(node.landmark);
            return (
              <Tip key={node.id} label={`${node.landmark ?? node.name} at ${node.ageUp}`}>
                <span className={`tl-landmark${at <= t ? " on" : ""}`} style={{ left: pct(at) }}>
                  {icon ? <img src={icon} alt="" /> : <span>{node.ageUp}</span>}
                </span>
              </Tip>
            );
          })}
        </div>

        <div className="tl-lane army">
          <span className="tl-lane-label">Army</span>
          {ages.map(({ node, at }, i) => (
            <span key={node.id} className={`tl-army${at <= t ? " on" : ""}`} style={{ left: pct(at), right: i === 0 ? `calc(100% - ${pct(pb.castleAt)})` : 0 }}>
              {(node.army ?? []).map((n) => {
                const u = findUnit(n, abbr);
                return u ? <img key={n} src={u.icon} alt={n} title={n} /> : <span key={n} className="unit-chip">{n}</span>;
              })}
            </span>
          ))}
        </div>

        <div className="tl-playhead" style={{ left: `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${t / pb.end})` }}>
          <span className="tl-playhead-t">{formatClock(t)}</span>
        </div>
      </div>
    </div>
  );
}
