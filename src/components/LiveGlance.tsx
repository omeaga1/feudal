import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Match, MatchPlayer } from "../lib/aoe4world";
import { buildBrief } from "../lib/brief";
import { civColor } from "../lib/civColors";
import { dangerWindows } from "../lib/dangerWindows";
import { getCiv, type Unit } from "../lib/gameData";
import { clock, formatClock, getGamePlan, pathSteps, type GamePlan } from "../lib/gamePlans";
import { glanceThreats } from "../lib/glance";
import { chartSpan, enemyTimings, gameSeconds, LOADING_SECONDS, timingState, villagersAt, villagerTargets, type Timing } from "../lib/liveView";
import { usePersisted } from "../lib/persisted";
import { getPlaybook } from "../lib/playbooks";
import { useDangerData } from "./DangerTimeline";
import { Flag } from "./Flag";
import { resolveSelection, SplitChips, UnitIcons, type PlanSelection } from "./PlanTree";
import { AgeMark, UnitHover } from "./ui";

const shortName = (name: string) => name.replace(/^(Early|Hardened|Veteran|Elite) /, "");

/** Ticks every second so the clock, the timings and the villager graph play along with the game. */
function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Shrinks the view's font size until every card fits without clipping, so a
 * busy matchup or a small window never needs scrolling. Everything is sized
 * in em, so one number scales the whole view.
 */
function useFitToScreen(ref: RefObject<HTMLElement | null>, contentKey: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = "";
      let size = parseFloat(getComputedStyle(el).fontSize);
      const overflows = () => [...el.querySelectorAll<HTMLElement>(".lv-card, .lv-head")].some((c) => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1);
      while (overflows() && size > 9) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el.parentElement ?? el);
    return () => observer.disconnect();
  }, [ref, contentKey]);
}

function Icon({ unit, big }: { unit: Unit; big?: boolean }) {
  return (
    <UnitHover unit={unit}>
      <span className={big ? "lv-unit big" : "lv-unit"}>
        <img src={unit.icon} alt="" loading="lazy" />
        <span>{shortName(unit.name)}</span>
      </span>
    </UnitHover>
  );
}

/** Their units on the left, what beats them on the right, by age. */
function Counters({ me, them }: { me: string; them: string }) {
  const brief = useMemo(() => buildBrief(me, them), [me, them]);
  const ages = brief ? glanceThreats(brief, 3, 2) : [];
  return (
    <section className="lv-card lv-counters">
      <h3>What counters what</h3>
      {ages.map(({ age, threats }) => (
        <div key={age} className="lv-age">
          <AgeMark age={age} label={false} />
          <div className="lv-threats">
            {threats.map(({ enemy, answers }) => (
              <div key={enemy.id} className={enemy.unique ? "lv-threat unique" : "lv-threat"}>
                <Icon unit={enemy} big />
                <span className="lv-arrow">›</span>
                {answers.length > 0 ? answers.map((a) => <Icon key={a.id} unit={a} />) : <span className="muted">Mixed army</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

const KIND_LABEL: Record<Timing["kind"], string> = {
  rush: "Rush",
  spike: "Spike",
  weak: "Weak",
  yours: "Attack",
  theirs: "Hold",
};

const span = (t: Timing) => (t.to === null ? `${formatClock(t.from)}+` : `${formatClock(t.from)}–${formatClock(t.to)}`);

/** When their civ hits and when it's open, on a strip with a moving Now line and a short list. */
function Timings({ them, me, seconds }: { them: string; me: string; seconds: number | null }) {
  const dangerData = useDangerData();
  const danger = useMemo(() => dangerWindows(me, them, dangerData), [me, them, dangerData]);
  const timings = useMemo(() => enemyTimings(getGamePlan(them), getPlaybook(them), danger), [them, danger]);
  // The strip covers the first 20 minutes and grows with the game.
  const end = Math.max(20 * 60, Math.ceil(((seconds ?? 0) + 120) / 300) * 300);
  const x = (s: number) => `${(Math.min(s, end) / end) * 100}%`;
  const states = timings.map((t) => timingState(t, seconds));
  const nextIndex = states.indexOf("later");
  // Once a timing is over it only takes room, unless the list is short.
  const shown = timings.map((t, i) => ({ t, i })).filter(({ i }) => states[i] !== "past" || timings.length <= 4);
  const theirName = getCiv(them)?.name ?? them;

  return (
    <section className="lv-card lv-timings">
      <h3>Watch {theirName}: timings</h3>
      <div className="lv-strip" aria-hidden="true">
        {timings.map((t, i) => (
          <span
            key={i}
            className={`lv-band ${t.kind}`}
            style={{
              left: x(t.from),
              width: `calc(${x(t.to ?? end)} - ${x(t.from)})`,
            }}
          />
        ))}
        {Array.from({ length: end / 300 }, (_, k) => k * 5).map((m) => (
          <span key={m} className="lv-tick" style={{ left: x(m * 60) }}>
            {m}m
          </span>
        ))}
        {seconds !== null && <span className="lv-nowline" style={{ left: x(seconds) }} />}
      </div>
      {timings.length === 0 ? (
        <p className="muted">No timing data for {theirName} yet.</p>
      ) : (
        <div className="lv-list">
          {shown.map(({ t, i }) => {
            const state = states[i] === "later" && i === nextIndex ? "next" : states[i];
            return (
              <div key={i} className={`lv-timing ${t.kind} ${state}`}>
                <span className="lv-kind">{KIND_LABEL[t.kind]}</span>
                <b className="lv-when">{span(t)}</b>
                <div className="lv-what">
                  <b>{t.title}</b>
                  <span>{t.tip}</span>
                </div>
                <UnitIcons names={t.units} civ={them} />
                {state === "now" && <span className="lv-badge">Now</span>}
                {state === "next" && seconds !== null && <span className="lv-badge soon">in {formatClock(t.from - seconds)}</span>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** The pixel size of an element, so the chart draws at its real size instead of stretching. */
function useSize(ref: RefObject<HTMLElement | null>): {
  width: number;
  height: number;
} {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/**
 * Where your villager count should be, from your build's production rules,
 * with a Now line that moves with the game clock.
 */
function Villagers({ civ, plan, seconds }: { civ: string; plan: GamePlan; seconds: number | null }) {
  const [selection] = usePersisted<PlanSelection | null>(`feudal.plan.${civ}`, null);
  const path = resolveSelection(plan, selection);
  const feudalAt = clock(path.feudal.ageUp);
  const castleAt = clock(path.castle.ageUp);
  const { from, to } = chartSpan(seconds, castleAt);
  const prod = useMemo(() => villagerTargets(plan, path, to), [plan, path.feudal, path.castle, to]);
  const steps = useMemo(() => pathSteps(plan, path).filter(({ step }) => step.v), [plan, path.feudal, path.castle]);
  const box = useRef<HTMLDivElement>(null);
  const size = useSize(box);
  const AXIS = 16;
  const W = Math.max(1, size.width);
  const H = Math.max(1, size.height - AXIS);

  const max = Math.max(villagersAt(prod, to), 20);
  const top = Math.ceil(max / 20) * 20;
  const x = (s: number) => ((s - from) / (to - from)) * W;
  const y = (n: number) => H - (n / top) * H;

  // Step-after line: the count holds until the next villager walks out.
  const born = [...prod.born.filter((b) => b > from && b <= to)];
  const pts: string[] = [`${x(from)},${y(villagersAt(prod, from))}`];
  for (const b of born) {
    pts.push(`${x(b)},${y(villagersAt(prod, b - 0.001))}`, `${x(b)},${y(villagersAt(prod, b))}`);
  }
  pts.push(`${x(to)},${y(villagersAt(prod, to))}`);
  const line = `M${pts.join(" L")}`;
  const area = `${line} L${x(to)},${H} L${x(from)},${H} Z`;

  const t = seconds ?? 0;
  const now = villagersAt(prod, t);
  const nextMinute = (Math.floor(t / 60) + 1) * 60;
  const step = [...steps].reverse().find(({ step: s }) => clock(s.t) <= t) ?? steps[0];
  const nextAge = [
    { age: 2, at: feudalAt },
    { age: 3, at: castleAt },
  ].find((a) => a.at > t);

  const bands = [
    { age: 1, a: 0, b: feudalAt },
    { age: 2, a: feudalAt, b: castleAt },
    { age: 3, a: castleAt, b: Infinity },
  ]
    .map((band) => ({
      ...band,
      a: Math.max(band.a, from),
      b: Math.min(band.b, to),
    }))
    .filter((band) => band.b > band.a);
  const ticks = Array.from({ length: Math.floor(to / 60) + 1 }, (_, m) => m * 60).filter((s) => s >= from && s % (to - from > 1200 ? 300 : 120) === 0);
  const gridLines = Array.from({ length: top / 20 + 1 }, (_, i) => i * 20);

  return (
    <section className="lv-card lv-villagers">
      <div className="lv-vil-head">
        <h3>Villagers</h3>
        <div className="lv-vil-now">
          <b>{now}</b>
          <span>{seconds === null ? "at start" : "by now"}</span>
        </div>
        <div className="lv-vil-next">
          <b>{villagersAt(prod, nextMinute)}</b>
          <span>by {formatClock(nextMinute)}</span>
        </div>
        {step && <SplitChips split={step.step.v} builders={step.step.b} />}
        <span className="spacer" />
        {nextAge && (
          <span className="lv-age-target">
            <AgeMark age={nextAge.age} label={false} /> <b>{formatClock(nextAge.at)}</b>
          </span>
        )}
        <span className="lv-path muted">{path.feudal.name}</span>
      </div>
      <div ref={box} className="lv-vil-box">
        <svg width={W} height={H + AXIS} className="lv-vil-svg" role="img" aria-label="Villager count to aim for over the game">
          {bands.map((band) => (
            <rect key={band.age} x={x(band.a)} y={0} width={x(band.b) - x(band.a)} height={H} className={`lv-age-band age-${band.age}`} />
          ))}
          {gridLines.map((n) => (
            <g key={n}>
              <line x1={0} x2={W} y1={y(n)} y2={y(n)} className="lv-grid" />
              {n > 0 && (
                <text x={4} y={y(n) + 12} className="lv-axis">
                  {n}
                </text>
              )}
            </g>
          ))}
          <path d={area} className="lv-vil-area" />
          <path d={line} className="lv-vil-line" />
          {seconds !== null && (
            <>
              <rect x={x(from)} y={0} width={Math.max(0, x(t) - x(from))} height={H} className="lv-past" />
              <line x1={x(t)} x2={x(t)} y1={0} y2={H} className="lv-vil-nowline" />
            </>
          )}
          {ticks.map((s) => (
            <text key={s} x={x(s)} y={H + 13} className={s === from ? "lv-axis" : "lv-axis tick"}>
              {s / 60}m
            </text>
          ))}
        </svg>
      </div>
    </section>
  );
}

/**
 * The in-game Live view: one screen, no scrolling, nothing to click. What
 * counters what, when their civ hits or is open, and where your villager count
 * should be right now. Everything else lives in Matchups.
 */
export function LiveGlance({ match, opponent }: { match: Match; opponent: MatchPlayer }) {
  const me = match.me.civ;
  const them = opponent.civ;
  const myPlan = getGamePlan(me);
  const now = useNow();
  const seconds = gameSeconds(match.startedAt, now);
  const root = useRef<HTMLDivElement>(null);
  useFitToScreen(root, `${me}|${them}`);

  return (
    <div ref={root} className="lv" style={{ "--civ": civColor(them) } as React.CSSProperties}>
      <header className="lv-head">
        <span className="pill live">
          <span className="pulse" /> Live
        </span>
        <div className="lv-side">
          <Flag civ={me} size="md" />
          <b>{getCiv(me)?.name ?? me}</b>
        </div>
        <span className="lv-vs">VS</span>
        <div className="lv-side">
          <Flag civ={them} size="md" />
          <b>{getCiv(them)?.name ?? them}</b>
          <span className="muted lv-opp">
            {opponent.name}
            {opponent.rating ? ` · ${opponent.rating}` : ""}
          </span>
        </div>
        <span className="spacer" />
        {seconds !== null && (
          <div className="lv-clock" title={`From when AoE4 World saw the game start, less about ${LOADING_SECONDS}s of loading`}>
            <b>≈{formatClock(seconds)}</b>
            <span>game time</span>
          </div>
        )}
      </header>

      <Counters me={me} them={them} />
      <Timings me={me} them={them} seconds={seconds} />
      {myPlan ? (
        <Villagers civ={me} plan={myPlan} seconds={seconds} />
      ) : (
        <section className="lv-card lv-villagers">
          <h3>Villagers</h3>
          <p className="muted">No build plan for {getCiv(me)?.name ?? me} yet.</p>
        </section>
      )}
    </div>
  );
}
