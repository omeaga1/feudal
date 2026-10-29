import NumberFlow from "@number-flow/react";
import { Pause, Play, RotateCcw, SkipBack, SkipForward, X } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, MotionConfig } from "motion/react";
import { Dialog, Slider, ToggleGroup } from "radix-ui";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { IconType } from "react-icons";
import {
  GiAnchor,
  GiAnvil,
  GiBowArrow,
  GiCastle,
  GiChurch,
  GiCrossedSwords,
  GiHammerNails,
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
import { formatClock, landmarkIcon, type GamePlan, type SelectedPath } from "../lib/gamePlans";
import { usePersisted } from "../lib/persisted";
import { buildPlayback, frameAt, SLOTS, type BuildingKind, type Slot } from "../lib/playback";
import { UnitIcons } from "./PlanTree";
import { Tip } from "./ui";

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
  tower: { icon: GiWatchtower, label: "Tower or outpost" },
  townCenter: { icon: GiCastle, label: "Town Center" },
  religious: { icon: GiChurch, label: "Monastery" },
  dock: { icon: GiAnchor, label: "Dock" },
  siege: { icon: GiTrebuchet, label: "Siege workshop" },
};

const SLOT_LABELS: Record<Slot, string> = { food: "Food", wood: "Wood", gold: "Gold", stone: "Stone", build: "Building" };
const AGE_LABELS = { 1: "Dark Age", 2: "Feudal Age", 3: "Castle Age" } as const;
const SPEEDS = [1, 2, 4, 8, 16];

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

/** One resource (or the build site) with its villagers as dots that slide between zones. */
function Zone({ slot, ids, children }: { slot: Slot; ids: number[]; children?: ReactNode }) {
  const icon = slot === "build" ? null : resourceIcon(slot);
  return (
    <div className={`pb-zone ${slot}${ids.length ? "" : " empty"}`}>
      <div className="pb-zone-head">
        {icon ? <img src={icon} alt="" /> : <GiHammerNails className="pb-hammer" aria-hidden="true" />}
        <span className="pb-zone-count">
          <NumberFlow value={ids.length} />
        </span>
        <span className="pb-zone-label">{SLOT_LABELS[slot]}</span>
      </div>
      <div className="pb-dots">
        {ids.map((id) => (
          <motion.span
            key={id}
            layoutId={`vil-${id}`}
            className="pb-dot"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          />
        ))}
      </div>
      {children}
    </div>
  );
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

/** The sandbox: a running game clock that plays the chosen path step by step. */
export function PlanPlayback({ plan, path }: { plan: GamePlan; path: SelectedPath }) {
  const pb = useMemo(() => buildPlayback(plan, path), [plan, path]);
  const { t, setT, playing, setPlaying, toggle, speed, setSpeed } = useGameClock(pb.end);
  const frame = frameAt(pb, t);
  const ageNode = frame.age === 1 ? path.feudal : frame.age === 2 ? path.castle : undefined;
  const reachedNode = frame.age === 2 ? path.feudal : frame.age === 3 ? path.castle : undefined;
  const nextLandmark = ageNode?.landmark;
  const byZone = (s: Slot) => frame.villagers.filter((v) => v.at === s).map((v) => v.id);
  const total = frame.villagers.length;
  const steps = pb.events.map((e) => e.seconds);

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

  // The age-up banner shows for a moment after each age-up the clock passes.
  const justAged = frame.age > 1 && t - (frame.age === 2 ? pb.feudalAt : pb.castleAt) < 25;

  return (
    <MotionConfig reducedMotion="user">
      <div className={`pb age-${frame.age}`}>
        <div className="pb-top">
          <div className="pb-clock" aria-label="Game time">
            {formatClock(t)}
          </div>
          <div className="pb-age">
            <div className="pb-age-row">
              <span className="pb-age-name">{AGE_LABELS[frame.age]}</span>
              {frame.nextAgeAt !== undefined && (
                <span className="pb-age-next">
                  {AGE_LABELS[(frame.age + 1) as 2 | 3]} at {formatClock(frame.nextAgeAt)}
                  {nextLandmark && (
                    <>
                      {" · "}
                      {landmarkIcon(nextLandmark) && <img src={landmarkIcon(nextLandmark)} alt="" />}
                      {nextLandmark}
                    </>
                  )}
                </span>
              )}
            </div>
            <div className="pb-age-bar">
              <motion.span className="pb-age-fill" animate={{ width: `${frame.ageProgress * 100}%` }} transition={{ duration: 0.15, ease: "linear" }} />
            </div>
          </div>
          <div className="pb-vils">
            <img src={resourceIcon("villager")} alt="" />
            <NumberFlow value={total} />
          </div>
        </div>

        <div className="pb-stage">
          <LayoutGroup id={`pb-${path.feudal.id}-${path.castle.id}`}>
            <div className="pb-zones">
              {SLOTS.map((s) => (
                <Zone key={s} slot={s} ids={byZone(s)}>
                  {s === "build" && byZone("build").length > 0 && nextLandmark && (
                    <span className="pb-building-now">
                      {landmarkIcon(nextLandmark) && <img src={landmarkIcon(nextLandmark)} alt="" />}
                      {nextLandmark}
                    </span>
                  )}
                </Zone>
              ))}
            </div>
          </LayoutGroup>
          <AnimatePresence>
            {justAged && reachedNode && (
              <motion.div
                key={frame.age}
                className="pb-banner"
                initial={{ opacity: 0, scale: 0.85, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
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

        <div className="pb-now">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={frame.index}
              className="pb-now-card"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.25 }}
            >
              <span className="pb-now-t">{frame.current?.step.t ?? "0:00"}</span>
              <span className="pb-now-do">{frame.current?.step.do ?? "Game starts"}</span>
            </motion.div>
          </AnimatePresence>
          {frame.next && (
            <div className="pb-next">
              <span className="pb-next-in">in {formatClock(frame.next.seconds - t)}</span>
              <span className="pb-next-do">{frame.next.step.do}</span>
            </div>
          )}
        </div>

        <div className="pb-bottom">
          <div className="pb-built">
            <span className="section-kicker">Built</span>
            <span className="pb-built-icons">
              <AnimatePresence initial={false}>
                {frame.buildings.map(({ kind }) => {
                  const { icon: Icon, label } = BUILDINGS[kind];
                  return (
                    <Tip key={kind} label={label}>
                      <motion.span className="pb-building" initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}>
                        <Icon aria-label={label} />
                      </motion.span>
                    </Tip>
                  );
                })}
              </AnimatePresence>
              {frame.buildings.length === 0 && <span className="muted small">Nothing yet</span>}
            </span>
          </div>
          <div className="pb-army">
            <span className="section-kicker">Army</span>
            {[path.feudal, path.castle].map((node, i) => (
              <span key={node.id} className={`pb-army-group${frame.age >= i + 2 ? " on" : ""}`}>
                <UnitIcons names={node.army} civ={plan.civ} />
                {frame.age < i + 2 && <span className="pb-army-at">{node.ageUp}</span>}
              </span>
            ))}
          </div>
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
