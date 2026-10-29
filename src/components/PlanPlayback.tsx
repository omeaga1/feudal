import NumberFlow from "@number-flow/react";
import { Pause, Play, RotateCcw, SkipBack, SkipForward, X } from "lucide-react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { Dialog, Slider, ToggleGroup } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { IconType } from "react-icons";
import {
  GiAnchor,
  GiAnvil,
  GiBowArrow,
  GiCastle,
  GiChurch,
  GiCrossedSwords,
  GiHorseHead,
  GiHouse,
  GiMining,
  GiShop,
  GiTrebuchet,
  GiWatchtower,
  GiWheat,
  GiWindmill,
  GiWoodAxe,
} from "react-icons/gi";
import { resourceIcon } from "../lib/assets";
import { getCiv } from "../lib/gameData";
import { findUnit, formatClock, landmarkIcon, RESOURCES, type GamePlan, type PlanNode, type SelectedPath, type Split } from "../lib/gamePlans";
import { usePersisted } from "../lib/persisted";
import { buildPlayback, frameAt, landmarkStart, SLOTS, villagerAt, villagerMoves, type BuildingKind, type Playback, type Slot, type VillagerMove } from "../lib/playback";
import { Tip } from "./ui";

// A top-down mini base in a 960x500 scene: the Town Center in the middle,
// sheep, trees, gold and stone around it, buildings on fixed plots. Every
// position is worked out from the game clock, so scrubbing and speed
// changes stay exact.

type P = { x: number; y: number };

const TC: P = { x: 480, y: 250 };
const SITES: Record<Slot, P> = {
  food: { x: 300, y: 300 },
  wood: { x: 300, y: 104 },
  gold: { x: 790, y: 140 },
  stone: { x: 820, y: 335 },
  build: { x: 400, y: 410 },
};
/** Where each site's villager count sits, just clear of the site itself. */
const BADGES: Record<Slot, P> = {
  food: { x: 285, y: 255 },
  wood: { x: 215, y: 138 },
  gold: { x: 800, y: 92 },
  stone: { x: 878, y: 290 },
  build: { x: 400, y: 358 },
};
const CASTLE_LANDMARK: P = { x: 570, y: 415 };
const RALLY: P = { x: 845, y: 452 };

const PLOTS: Record<Exclude<BuildingKind, "house">, P> = {
  mill: { x: 345, y: 360 },
  lumber: { x: 335, y: 165 },
  mining: { x: 715, y: 240 },
  farm: { x: 300, y: 300 },
  barracks: { x: 595, y: 62 },
  range: { x: 668, y: 56 },
  stable: { x: 741, y: 52 },
  siege: { x: 880, y: 58 },
  blacksmith: { x: 650, y: 345 },
  market: { x: 705, y: 450 },
  tower: { x: 905, y: 185 },
  townCenter: { x: 130, y: 250 },
  religious: { x: 232, y: 430 },
  dock: { x: 90, y: 440 },
};
const HOUSE_PLOTS: P[] = [
  { x: 412, y: 178 },
  { x: 548, y: 178 },
  { x: 415, y: 325 },
  { x: 545, y: 325 },
  { x: 232, y: 196 },
  { x: 200, y: 345 },
  { x: 130, y: 370 },
  { x: 130, y: 140 },
  { x: 610, y: 450 },
];

const BUILDINGS: Record<BuildingKind, { icon: IconType; label: string }> = {
  house: { icon: GiHouse, label: "House" },
  mill: { icon: GiWindmill, label: "Mill" },
  lumber: { icon: GiWoodAxe, label: "Lumber camp" },
  mining: { icon: GiMining, label: "Mining camp" },
  farm: { icon: GiWheat, label: "Farms" },
  barracks: { icon: GiCrossedSwords, label: "Barracks" },
  range: { icon: GiBowArrow, label: "Archery range" },
  stable: { icon: GiHorseHead, label: "Stable" },
  blacksmith: { icon: GiAnvil, label: "Blacksmith" },
  market: { icon: GiShop, label: "Market" },
  tower: { icon: GiWatchtower, label: "Tower" },
  townCenter: { icon: GiCastle, label: "Town Center" },
  religious: { icon: GiChurch, label: "Monastery" },
  dock: { icon: GiAnchor, label: "Dock" },
  siege: { icon: GiTrebuchet, label: "Siege workshop" },
};

const AGE_LABELS = { 1: "Dark Age", 2: "Feudal Age", 3: "Castle Age" } as const;
const SPEEDS = [1, 2, 4, 8, 16];
/** Scene pixels a villager walks per game second. */
const WALK = 42;
/** Game seconds a villager gathers before carrying a load back. */
const GATHER = 12;
/** Game seconds a building takes to go up. */
const BUILD_TIME = 25;

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: P, b: P, k: number): P => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

/** A villager's own spot at a site, spread on a sunflower spiral so a crowd doesn't stack. */
function spot(slot: Slot, id: number): P {
  const c = SITES[slot];
  const a = id * 2.39996;
  const r = 10 + Math.sqrt(id % 24) * 9;
  return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r * 0.7 };
}

function dropoff(slot: Slot, built: Map<BuildingKind, number>, t: number): P {
  const has = (k: BuildingKind) => (built.get(k) ?? Infinity) + BUILD_TIME <= t;
  if (slot === "food" && has("mill")) return PLOTS.mill;
  if (slot === "wood" && has("lumber")) return PLOTS.lumber;
  if ((slot === "gold" || slot === "stone") && has("mining")) return PLOTS.mining;
  // Drop at the Town Center's edge facing the site, not in its middle.
  const site = SITES[slot];
  const d = dist(site, TC) || 1;
  return { x: TC.x + ((site.x - TC.x) / d) * 42, y: TC.y + ((site.y - TC.y) / d) * 42 };
}

interface VilState {
  p: P;
  job: Slot;
  carrying: boolean;
  working: boolean;
  /** Distance walked on this leg, for the stepping bounce. */
  stride: number;
  /** -1 when walking left. */
  facing: 1 | -1;
}

const ease = (k: number) => k * k * (3 - 2 * k);

function leg(a: P, b: P, k: number, job: Slot, carrying: boolean): VilState {
  const e = ease(Math.min(1, Math.max(0, k)));
  return { p: lerp(a, b, e), job, carrying, working: false, stride: dist(a, b) * e, facing: b.x < a.x ? -1 : 1 };
}

function villagerState(moves: VillagerMove[] | undefined, id: number, t: number, built: Map<BuildingKind, number>): VilState | undefined {
  const st = villagerAt(moves, t);
  if (!st) return undefined;
  const from = st.from === "tc" ? TC : spot(st.from, id);
  const to = spot(st.to, id);
  const walk = dist(from, to) / WALK;
  const e = t - st.since;
  if (e < walk) return leg(from, to, e / walk, st.to, false);
  const idle = (job: Slot): VilState => ({ p: to, job, carrying: false, working: true, stride: 0, facing: to.x > SITES[job].x ? -1 : 1 });
  if (st.to === "build") return idle("build");
  const drop = dropoff(st.to, built, t);
  const trip = dist(to, drop) / WALK;
  const cycle = GATHER + 2 * trip;
  const phase = (e - walk + ((id * 7.3) % cycle)) % cycle;
  if (phase < GATHER) return idle(st.to);
  if (phase < GATHER + trip) return leg(to, drop, (phase - GATHER) / trip, st.to, true);
  return leg(drop, to, (phase - GATHER - trip) / trip, st.to, false);
}

/** Deterministic scatter for trees and rocks. */
function scatter(n: number, seed: number, box: { x: number; y: number; w: number; h: number }): P[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  return Array.from({ length: n }, () => ({ x: box.x + rnd() * box.w, y: box.y + rnd() * box.h }));
}

const TREES = scatter(46, 7, { x: 40, y: 18, w: 500, h: 74 }).sort((a, b) => a.y - b.y);
const GOLD_ROCKS = scatter(7, 3, { x: 815, y: 112, w: 60, h: 40 });
const STONE_ROCKS = scatter(7, 11, { x: 845, y: 310, w: 60, h: 40 });
const SHEEP = scatter(8, 5, { x: 250, y: 280, w: 70, h: 40 });

/** Plays the clock forward while `playing`, `speed` game seconds per real second, stopping at `end`. */
function useGameClock(end: number) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = usePersisted<number>("feudal.playback.speed", 8);
  const tRef = useRef(0);
  tRef.current = t;

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(end, tRef.current + ((now - last) / 1000) * speed);
      last = now;
      setT(next);
      if (next >= end) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, end]);

  const toggle = () => {
    if (!playing && tRef.current >= end) setT(0);
    setPlaying(!playing);
  };
  return { t, setT, playing, setPlaying, toggle, speed, setSpeed };
}

/** A bump that settles: 1 at rest, overshooting just after `since`. */
function pop(since: number) {
  if (since < 0 || since > 4) return 1;
  return 1 + Math.sin(since * 4) * 0.18 * Math.exp(-since * 1.4);
}

function Building({ kind, at, t, p, scale = 1 }: { kind: BuildingKind; at: number; t: number; p: P; scale?: number }) {
  if (t < at) return null;
  const { icon: Icon, label } = BUILDINGS[kind];
  const k = Math.min(1, (t - at) / BUILD_TIME);
  const s = 30 * scale;
  const z = k < 1 ? 0.85 + 0.15 * ease(k) : pop(t - at - BUILD_TIME);
  const now = performance.now() / 1000;
  return (
    <g className={`sb-building${k < 1 ? " rising" : ""}`} transform={`translate(${p.x} ${p.y}) scale(${z.toFixed(3)}) translate(${-s / 2} ${-s / 2})`}>
      <title>{label}</title>
      <ellipse cx={s / 2} cy={s + 4} rx={s / 2 + 4} ry={4} className="sb-shadow" />
      <rect className="sb-plot" x={-3} y={-3} width={s + 6} height={s + 6} rx={6} />
      <rect className="sb-plot-fill" x={-3} y={s + 3 - (s + 6) * k} width={s + 6} height={(s + 6) * k} rx={6} />
      <Icon x={4 * scale} y={4 * scale} size={s - 8 * scale} className="sb-building-icon" style={{ opacity: 0.35 + 0.65 * k }} />
      {k < 1 &&
        [0, 1, 2].map((d) => {
          const ph = (now * 0.9 + d / 3) % 1;
          return <circle key={d} className="sb-dust" cx={s / 2 + (d - 1) * s * 0.35} cy={s + 2 - ph * 14} r={2 + ph * 5} style={{ opacity: 0.5 * (1 - ph) }} />;
        })}
      {k >= 1 && t - at - BUILD_TIME < 1.5 && (
        <rect className="sb-flash" x={-3} y={-3} width={s + 6} height={s + 6} rx={6} style={{ opacity: 1 - (t - at - BUILD_TIME) / 1.5 }} />
      )}
    </g>
  );
}

function Landmark({ node, p, start, done, t }: { node: PlanNode; p: P; start?: number; done: number; t: number }) {
  const icon = landmarkIcon(node.landmark);
  const from = start ?? done - 60;
  if (t < from) return null;
  const k = Math.min(1, (t - from) / Math.max(1, done - from));
  const after = t - done;
  return (
    <g className={`sb-landmark${k < 1 ? " rising" : " done"}`} transform={`translate(${p.x} ${p.y}) scale(${pop(after).toFixed(3)}) translate(-30 -30)`}>
      {after >= 0 && after < 6 && <circle cx={30} cy={30} r={36 + after * 22} className="sb-burst" style={{ opacity: 1 - after / 6 }} />}
      <title>{node.landmark ?? node.name}</title>
      <rect className="sb-landmark-base" x={-4} y={-4} width={68} height={68} rx={10} />
      {icon ? (
        <image href={icon} x={2} y={2} width={56} height={56} style={{ opacity: k < 1 ? 0.25 + 0.4 * k : 1 }} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <GiCastle x={8} y={8} size={44} className="sb-building-icon" />
      )}
      {k < 1 && (
        <>
          <rect className="sb-progress-bg" x={0} y={68} width={60} height={5} rx={2.5} />
          <rect className="sb-progress" x={0} y={68} width={60 * k} height={5} rx={2.5} />
        </>
      )}
    </g>
  );
}

function Villager({ s, id }: { s: VilState; id: number }) {
  const now = performance.now() / 1000;
  // Walking: a little hop each stride. Working: the tool swings.
  const hop = s.working ? 0 : -Math.abs(Math.sin(s.stride / 5)) * 2.2;
  const swing = s.working ? Math.sin(now * (s.job === "build" ? 11 : 7) + id) * 38 : 10;
  return (
    <g className={`sb-vil ${s.job}${s.working ? " working" : ""}`} transform={`translate(${s.p.x.toFixed(1)} ${s.p.y.toFixed(1)}) scale(${1.35 * s.facing} 1.35)`}>
      <ellipse className="sb-shadow" cx={0} cy={6} rx={5} ry={2} />
      <g transform={`translate(0 ${hop.toFixed(2)})`}>
        <g className="sb-tool" transform={`translate(3 -1) rotate(${swing.toFixed(1)})`}>
          <line x1={0} y1={0} x2={0} y2={-8} />
          <rect x={-2.4} y={-10} width={4.8} height={2.6} rx={0.8} />
        </g>
        <path className="sb-vil-body" d="M-4.5 5 Q-5 -1 0 -2 Q5 -1 4.5 5 Z" />
        <circle className="sb-vil-head" cy={-4.8} r={2.6} />
        {s.carrying && <circle className="sb-load" cx={-4} cy={-1.5} r={2.8} />}
      </g>
    </g>
  );
}

function Scene({ pb, path, plan, t }: { pb: Playback; path: SelectedPath; plan: GamePlan; t: number }) {
  const moves = useMemo(() => villagerMoves(pb), [pb]);
  const built = useMemo(() => {
    const m = new Map<BuildingKind, number>();
    for (const e of pb.events) for (const b of e.newBuildings) if (!m.has(b)) m.set(b, e.seconds);
    return m;
  }, [pb]);
  const frame = frameAt(pb, t);
  const vils = frame.villagers.map((v) => ({ id: v.id, s: villagerState(moves.get(v.id), v.id, t, built) })).filter((v) => v.s);
  const houseAt = built.get("house");
  // Population needs a house per 10 villagers past the Town Center's own room.
  const houses = Math.min(HOUSE_PLOTS.length, Math.max(houseAt !== undefined && t >= houseAt ? 1 : 0, Math.ceil((frame.villagers.length - 9) / 10)));
  const farms = (built.get("farm") ?? Infinity) <= t;
  const abbr = getCiv(plan.civ)?.abbr;
  const armies = [
    { node: path.feudal, at: pb.feudalAt },
    { node: path.castle, at: pb.castleAt },
  ].filter((a) => t >= a.at && a.node.army?.length);
  const armyUnits = armies.flatMap((a) => (a.node.army ?? []).map((n) => ({ n, at: a.at, unit: findUnit(n, abbr) })));
  const uniqueUnits = armyUnits.filter((u, i) => armyUnits.findIndex((o) => o.n === u.n) === i);

  // A pulse on each site that just gained villagers.
  const prev = frame.index > 0 ? pb.events[frame.index - 1] : undefined;
  const sinceStep = frame.current ? t - frame.current.seconds : Infinity;
  const gained = (s: Slot) => {
    if (!frame.current || sinceStep > 8) return false;
    const now = frame.current.villagers.filter((v) => v.at === s).length;
    const before = prev?.villagers.filter((v) => v.at === s).length ?? 0;
    return now > before;
  };

  const trained = frame.current ? frame.current.villagers.length - (prev?.villagers.length ?? 0) : 0;

  return (
    <svg className={`sb-scene age-${frame.age}`} viewBox="0 0 960 500" role="img" aria-label="Your base, playing the build">
      <defs>
        <radialGradient id="sb-ground" cx="50%" cy="50%" r="70%">
          <stop offset="0%" className="sb-ground-in" />
          <stop offset="100%" className="sb-ground-out" />
        </radialGradient>
        <pattern id="sb-grass" width="22" height="22" patternUnits="userSpaceOnUse">
          <path d="M3 18 l2 -5 M12 8 l1.5 -4 M17 20 l2 -4" className="sb-grass-blade" />
        </pattern>
      </defs>
      <rect width="960" height="500" fill="url(#sb-ground)" />
      <rect width="960" height="500" fill="url(#sb-grass)" />

      {/* Paths worn between the Town Center and each site */}
      {(["food", "wood", "gold", "stone"] as const).map((s) => (
        <line key={s} x1={TC.x} y1={TC.y} x2={SITES[s].x} y2={SITES[s].y} className="sb-path" />
      ))}

      {/* Resources */}
      {TREES.map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y})`} className="sb-tree">
          <ellipse cx={0} cy={13} rx={9} ry={3} className="sb-shadow" />
          <path d="M0 -14 L10 6 L-10 6 Z" />
          <path d="M0 -6 L12 12 L-12 12 Z" />
        </g>
      ))}
      {farms
        ? [-1, 0, 1].flatMap((r) =>
            [-1, 0, 1].map((c) => (
              <rect key={`${r},${c}`} x={SITES.food.x + c * 34 - 15} y={SITES.food.y + r * 26 - 11} width={30} height={22} rx={3} className="sb-farm" />
            )),
          )
        : SHEEP.slice(0, Math.max(2, SHEEP.length - Math.floor(t / 45))).map((p, i) => (
            <g key={i} transform={`translate(${(p.x + Math.sin(t / 9 + i) * 3).toFixed(1)} ${(p.y + Math.cos(t / 11 + i * 2) * 2).toFixed(1)})`} className="sb-sheep">
              <ellipse rx={7} ry={5} />
              <circle cx={6} cy={-2} r={2.6} className="sb-sheep-head" />
            </g>
          ))}
      {GOLD_ROCKS.map((p, i) => (
        <path key={i} d={`M${p.x - 9} ${p.y + 6} L${p.x - 4} ${p.y - 7} L${p.x + 6} ${p.y - 5} L${p.x + 10} ${p.y + 6} Z`} className="sb-gold" />
      ))}
      {STONE_ROCKS.map((p, i) => (
        <path key={i} d={`M${p.x - 10} ${p.y + 6} L${p.x - 6} ${p.y - 6} L${p.x + 5} ${p.y - 8} L${p.x + 11} ${p.y + 5} Z`} className="sb-stone" />
      ))}
      {(["food", "wood", "gold", "stone"] as const).map((s) =>
        gained(s) ? (
          <circle key={`pulse-${s}-${frame.index}`} cx={SITES[s].x} cy={SITES[s].y} r={20 + sinceStep * 6} className={`sb-pulse ${s}`} style={{ opacity: Math.max(0, 1 - sinceStep / 8) }} />
        ) : null,
      )}

      {/* New villagers from the Town Center */}
      {trained > 0 && sinceStep < 8 && (
        <text key={`trained-${frame.index}`} x={TC.x} y={TC.y - 48 - sinceStep * 3} className="sb-float" style={{ opacity: Math.max(0, 1 - sinceStep / 8) }}>
          +{trained} villager{trained > 1 ? "s" : ""}
        </text>
      )}

      {/* Town Center */}
      <g className="sb-tc" transform={`translate(${TC.x - 34} ${TC.y - 34})`}>
        <title>Town Center</title>
        <rect x={-4} y={-4} width={76} height={76} rx={12} className="sb-tc-base" />
        <GiCastle x={8} y={6} size={52} className="sb-tc-icon" />
      </g>

      {/* Buildings */}
      {HOUSE_PLOTS.slice(0, houses).map((p, i) => (
        <Building key={i} kind="house" at={i === 0 ? (houseAt ?? 0) : 0} t={t} p={p} scale={0.8} />
      ))}
      {[...built.entries()]
        .filter(([k]) => k !== "house" && k !== "farm")
        .map(([k, at]) => (
          <Building key={k} kind={k} at={at} t={t} p={PLOTS[k as Exclude<BuildingKind, "house">]} scale={k === "townCenter" ? 1.6 : 1} />
        ))}
      <Landmark node={path.feudal} p={SITES.build} start={landmarkStart(pb, 2)} done={pb.feudalAt} t={t} />
      <Landmark node={path.castle} p={CASTLE_LANDMARK} start={landmarkStart(pb, 3)} done={pb.castleAt} t={t} />

      {/* Army at the rally point */}
      {uniqueUnits.length > 0 && (
        <g className="sb-army" transform={`translate(${RALLY.x} ${RALLY.y})`}>
          <path d="M44 -34 L44 22 M44 -34 L64 -27 L44 -20" className="sb-flag" />
          {uniqueUnits.map(({ n, unit, at }, i) => {
            const k = ease(Math.min(1, Math.max(0, (t - at - i * 1.5) / 10)));
            const home = { x: -((uniqueUnits.length - 1 - i) % 4) * 32 + 4, y: -Math.floor((uniqueUnits.length - 1 - i) / 4) * 32 - 14 };
            const start = { x: PLOTS.barracks.x - RALLY.x, y: PLOTS.barracks.y - RALLY.y };
            const { x, y } = lerp(start, home, k);
            return (
              <g key={n} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(0.7 + 0.3 * k).toFixed(3)})`} style={{ opacity: Math.min(1, k * 4) }}>
                <title>{n}</title>
                <rect x={-15} y={-15} width={30} height={30} rx={6} className="sb-unit-frame" />
                {unit ? <image href={unit.icon} x={-13} y={-13} width={26} height={26} /> : <GiCrossedSwords x={-11} y={-11} size={22} className="sb-building-icon" />}
              </g>
            );
          })}
        </g>
      )}

      {/* Villagers, drawn last so they walk over everything */}
      {vils.map(({ id, s }) => (
        <Villager key={id} id={id} s={s!} />
      ))}
    </svg>
  );
}

function deltas(now?: Split, before?: Split, nowB = 0, beforeB = 0) {
  if (!now) return [];
  const out: { key: string; n: number }[] = [];
  RESOURCES.forEach((r, i) => {
    const d = now[i] - (before?.[i] ?? 0);
    if (d) out.push({ key: r, n: d });
  });
  if (nowB - beforeB) out.push({ key: "build", n: nowB - beforeB });
  return out;
}

/** The track under the slider: age bands and a tick per step. */
function Timeline({ end, feudalAt, castleAt, steps, onSeek }: { end: number; feudalAt: number; castleAt: number; steps: number[]; onSeek: (s: number) => void }) {
  const pct = (s: number) => `${(s / end) * 100}%`;
  return (
    <div className="pb-bands" aria-hidden="true">
      <span className="pb-band band-0" style={{ left: 0, width: pct(feudalAt) }} />
      <span className="pb-band band-1" style={{ left: pct(feudalAt), width: pct(castleAt - feudalAt) }} />
      <span className="pb-band band-2" style={{ left: pct(castleAt), right: 0 }} />
      {steps.map((s, i) => (
        <button key={i} type="button" tabIndex={-1} className="pb-tick" style={{ left: pct(s) }} onClick={() => onSeek(s)} />
      ))}
    </div>
  );
}

/** The sandbox: your base, playing the chosen path on a running game clock. */
export function PlanPlayback({ plan, path }: { plan: GamePlan; path: SelectedPath }) {
  const pb = useMemo(() => buildPlayback(plan, path), [plan, path]);
  const { t, setT, playing, setPlaying, toggle, speed, setSpeed } = useGameClock(pb.end);
  const frame = frameAt(pb, t);
  const ageNode = frame.age === 1 ? path.feudal : frame.age === 2 ? path.castle : undefined;
  const reachedNode = frame.age === 2 ? path.feudal : frame.age === 3 ? path.castle : undefined;
  const count = (s: Slot) => frame.villagers.filter((v) => v.at === s).length;
  const steps = pb.events.map((e) => e.seconds);
  const prev = frame.index > 0 ? pb.events[frame.index - 1] : undefined;
  const changes = deltas(frame.current?.split, prev?.split, frame.current?.builders, prev?.builders);

  const seekStep = (dir: -1 | 1) => {
    const target = dir > 0 ? steps.find((s) => s > t + 0.01) : [...steps].reverse().find((s) => s < t - 0.5);
    setPlaying(false);
    setT(target ?? (dir > 0 ? pb.end : 0));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      // Sliders and toggles use arrows themselves; a focused button already clicks on Space.
      if (el?.closest("[role=slider], [role=radio]")) return;
      if (e.key === " ") {
        if (el?.closest("button")) return;
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowRight") seekStep(1);
      else if (e.key === "ArrowLeft") seekStep(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const justAged = frame.age > 1 && t - (frame.age === 2 ? pb.feudalAt : pb.castleAt) < 20;
  const nextIcon = landmarkIcon(ageNode?.landmark);

  return (
    <MotionConfig reducedMotion="user">
      <div className="pb">
        <div className="pb-stage">
          <Scene pb={pb} path={path} plan={plan} t={t} />
          <div className="sb-badges" aria-hidden="true">
            {SLOTS.map((slot) => {
              const n = count(slot);
              const before = prev?.villagers.filter((v) => v.at === slot).length ?? 0;
              const fresh = frame.current && t - frame.current.seconds < 8 ? n - before : 0;
              if (!n && !fresh) return null;
              const at = BADGES[slot];
              return (
                <span key={slot} className={`sb-badge ${slot}`} style={{ left: `${(at.x / 960) * 100}%`, top: `${(at.y / 500) * 100}%` }}>
                  {slot === "build" ? <span className="sb-badge-hammer">⚒</span> : <img src={resourceIcon(slot)} alt="" />}
                  <NumberFlow value={n} />
                  {fresh !== 0 && (
                    <span key={frame.index} className={`sb-badge-delta${fresh < 0 ? " out" : ""}`}>
                      {fresh > 0 ? `+${fresh}` : fresh}
                    </span>
                  )}
                </span>
              );
            })}
          </div>

          <div className="pb-hud top">
            <div className="pb-res">
              {(["food", "wood", "gold", "stone"] as const).map((r) => (
                <Tip key={r} label={`Villagers on ${r}`}>
                  <span className={`pb-res-item ${r}${count(r) ? "" : " zero"}`}>
                    <img src={resourceIcon(r)} alt={r} />
                    <NumberFlow value={count(r)} />
                  </span>
                </Tip>
              ))}
              {count("build") > 0 && (
                <Tip label="Villagers building">
                  <span className="pb-res-item build">⚒ {count("build")}</span>
                </Tip>
              )}
              <Tip label="Villagers">
                <span className="pb-res-item vils">
                  <img src={resourceIcon("villager")} alt="villagers" />
                  <NumberFlow value={frame.villagers.length} />
                </span>
              </Tip>
            </div>
            <div className="pb-clock" aria-label="Game time">
              {formatClock(t)}
            </div>
            <div className="pb-age">
              <span className="pb-age-name">{AGE_LABELS[frame.age]}</span>
              {frame.nextAgeAt !== undefined && (
                <span className="pb-age-next">
                  {nextIcon && <img src={nextIcon} alt="" />}
                  {AGE_LABELS[(frame.age + 1) as 2 | 3].split(" ")[0]} in {formatClock(frame.nextAgeAt - t)}
                </span>
              )}
              <span className="pb-age-bar">
                <span className="pb-age-fill" style={{ width: `${frame.ageProgress * 100}%` }} />
              </span>
            </div>
          </div>

          <div className="pb-hud bottom">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={frame.index}
                className="pb-objective"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
              >
                <span className="pb-obj-t">{frame.current?.step.t ?? "0:00"}</span>
                <span className="pb-obj-do">{frame.current?.step.do ?? "Game starts"}</span>
                {changes.length > 0 && (
                  <span className="pb-obj-moves">
                    {changes.map((c) => (
                      <span key={c.key} className={`pb-move ${c.key}${c.n < 0 ? " out" : ""}`}>
                        {c.key === "build" ? "⚒" : <img src={resourceIcon(c.key as (typeof RESOURCES)[number])} alt={c.key} />}
                        {c.n > 0 ? `+${c.n}` : c.n}
                      </span>
                    ))}
                  </span>
                )}
              </motion.div>
            </AnimatePresence>
            {frame.next && (
              <div className="pb-next">
                <span className="pb-next-in">Next in {formatClock(frame.next.seconds - t)}</span>
                <span className="pb-next-do">{frame.next.step.do}</span>
              </div>
            )}
          </div>

          <AnimatePresence>
            {justAged && reachedNode && (
              <motion.div
                key={frame.age}
                className="pb-banner"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.08 }}
                transition={{ type: "spring", stiffness: 280, damping: 22 }}
              >
                {landmarkIcon(reachedNode.landmark) && <img src={landmarkIcon(reachedNode.landmark)} alt="" />}
                <span>
                  <span className="pb-banner-age">{AGE_LABELS[frame.age]}</span>
                  <span className="pb-banner-name">{reachedNode.name}</span>
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="pb-transport">
          <div className="pb-buttons">
            <Tip label="Back a step (←)">
              <button type="button" className="pb-btn" onClick={() => seekStep(-1)} aria-label="Back a step">
                <SkipBack size={16} />
              </button>
            </Tip>
            <button type="button" className="pb-btn play" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause size={20} /> : t >= pb.end ? <RotateCcw size={20} /> : <Play size={20} />}
            </button>
            <Tip label="Next step (→)">
              <button type="button" className="pb-btn" onClick={() => seekStep(1)} aria-label="Next step">
                <SkipForward size={16} />
              </button>
            </Tip>
          </div>
          <div className="pb-scrub">
            <Timeline end={pb.end} feudalAt={pb.feudalAt} castleAt={pb.castleAt} steps={steps} onSeek={(s) => setT(s)} />
            <Slider.Root
              className="pb-slider"
              min={0}
              max={pb.end}
              step={1}
              value={[t]}
              onValueChange={([v]) => setT(v)}
              onPointerDown={() => setPlaying(false)}
              aria-label="Game time"
            >
              <Slider.Track className="pb-slider-track">
                <Slider.Range className="pb-slider-range" />
              </Slider.Track>
              <Slider.Thumb className="pb-slider-thumb" aria-label="Game time" />
            </Slider.Root>
          </div>
          <ToggleGroup.Root className="segmented pb-speed" type="single" value={String(speed)} onValueChange={(v) => v && setSpeed(Number(v))} aria-label="Speed">
            {SPEEDS.map((s) => (
              <ToggleGroup.Item key={s} value={String(s)} className="segmented-item">
                {s === speed && <motion.span layoutId="pb-speed" className="segmented-thumb" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                <span>{s}×</span>
              </ToggleGroup.Item>
            ))}
          </ToggleGroup.Root>
        </div>
      </div>
    </MotionConfig>
  );
}

/** The "Play build" button and the sandbox window it opens. */
export function PlaybackButton({ plan, path }: { plan: GamePlan; path: SelectedPath }) {
  const civName = getCiv(plan.civ)?.name ?? plan.civ;
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="play-build">
          <Play size={14} fill="currentColor" aria-hidden="true" />
          Play build
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="pb-overlay" />
        <Dialog.Content className="pb-dialog" aria-describedby={undefined}>
          <div className="pb-dialog-head">
            <Dialog.Title className="pb-title">
              {civName}: {path.feudal.name} → {path.castle.name}
            </Dialog.Title>
            <span className="muted small">Space to pause, arrows to step</span>
            <span className="spacer" />
            <Dialog.Close asChild>
              <button type="button" className="pb-btn" aria-label="Close">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          <PlanPlayback key={`${path.feudal.id}/${path.castle.id}`} plan={plan} path={path} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
