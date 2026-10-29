import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { fetchMatchupStat, fetchRecentGames, type Match, type MatchPlayer, type MatchupStat } from "../lib/aoe4world";
import { buildBrief } from "../lib/brief";
import { civColor } from "../lib/civColors";
import { dangerWindows } from "../lib/dangerWindows";
import { getCiv, type Unit } from "../lib/gameData";
import { clock, formatClock, getGamePlan, landmarkIcon, pathSteps, STYLE_LABELS } from "../lib/gamePlans";
import { elapsedSeconds, firstSentence, glanceThreats, stepWindow, windowAt } from "../lib/glance";
import { appFetch } from "../lib/http";
import { summarizePlayer, type PlayerProfile } from "../lib/opponent";
import { usePersisted } from "../lib/persisted";
import { getPlaybook } from "../lib/playbooks";
import { useDangerData } from "./DangerTimeline";
import { Flag } from "./Flag";
import { resolveSelection, SplitChips, UnitIcons, type PlanSelection } from "./PlanTree";
import { AgeMark, UnitHover } from "./ui";

const shortName = (name: string) => name.replace(/^(Early|Hardened|Veteran|Elite) /, "");
const percent = (v: number) => `${Math.round(v * 100)}%`;

/** Ticks once every few seconds so the clock and the "now" window move on their own. */
function useNow(intervalMs = 5000): number {
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
      const overflows = () => [...el.querySelectorAll<HTMLElement>(".g-card, .g-head")].some((c) => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1);
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

function useMatchupStat(me: string, them: string): MatchupStat | null {
  const [stat, setStat] = useState<MatchupStat | null>(null);
  useEffect(() => {
    let cancelled = false;
    setStat(null);
    fetchMatchupStat(appFetch, me, them)
      .then((s) => !cancelled && setStat(s))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [me, them]);
  return stat;
}

function useOpponentProfile(profileId: number): PlayerProfile | null {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    fetchRecentGames(appFetch, profileId)
      .then((games) => !cancelled && setProfile(summarizePlayer(games, profileId)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profileId]);
  return profile;
}

function Icon({ unit, big }: { unit: Unit; big?: boolean }) {
  return (
    <UnitHover unit={unit}>
      <span className={big ? "g-unit big" : "g-unit"}>
        <img src={unit.icon} alt="" loading="lazy" />
        <span>{shortName(unit.name)}</span>
      </span>
    </UnitHover>
  );
}

function LandmarkIcon({ name }: { name?: string }) {
  if (!name) return null;
  const icon = landmarkIcon(name);
  return icon ? <img className="g-landmark" src={icon} alt={name} title={name} /> : <span className="g-landmark blank">{name[0]}</span>;
}

const AGE_SHORT = { 1: "Dark", 2: "Feudal", 3: "Castle" } as const;

/**
 * Your own build for this civ: the path you picked in Matchups or Civs (or
 * the first one), your age-up targets, and the step you should be on now with
 * the next few. It follows the game clock on its own.
 */
function YourBuild({ civ, elapsed }: { civ: string; elapsed: number | null }) {
  const plan = getGamePlan(civ);
  const [selection] = usePersisted<PlanSelection | null>(`feudal.plan.${civ}`, null);
  if (!plan) return null;
  const path = resolveSelection(plan, selection);
  const steps = pathSteps(plan, path);
  const { items, current, offset } = stepWindow(steps, elapsed);
  const targets = [
    { age: 2, node: path.feudal },
    { age: 3, node: path.castle },
  ];
  const next = targets.find((t) => elapsed === null || clock(t.node.ageUp) > elapsed);

  return (
    <section className={`g-card g-mine style-${path.feudal.style}`}>
      <div className="g-mine-head">
        <h3>Your build</h3>
        <b className="g-mine-name">
          {path.feudal.name} › <span className={`style-${path.castle.style}`}>{path.castle.name}</span>
        </b>
        <span className="spacer" />
        {targets.map(({ age, node }) => (
          <span key={age} className={next?.age === age ? "g-target next" : "g-target"}>
            <AgeMark age={age} label={false} />
            <LandmarkIcon name={node.landmark} />
            <b>{node.ageUp}</b>
          </span>
        ))}
        <UnitIcons names={path.castle.army?.slice(0, 4)} civ={civ} />
      </div>
      <div className="g-steps">
        {items.map(({ age, step }, i) => {
          const index = offset + i;
          const state = index < current ? " done" : index === current ? " now" : "";
          return (
            <div key={index} className={`g-step age-${age}${state}`}>
              <div className="g-step-top">
                <b>{step.t}</b>
                <span className="g-step-age">{AGE_SHORT[age]}</span>
                {index === current && elapsed !== null && <span className="g-now inline">Now</span>}
              </div>
              <SplitChips split={step.v} builders={step.b} />
              <span className="g-step-do">{step.do}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The in-game Live view: one screen, no scrolling, nothing to click. What
 * they'll open with, what to build against their units, and when the game
 * tends to swing. Everything else lives in Matchups.
 */
export function LiveGlance({ match, opponent }: { match: Match; opponent: MatchPlayer }) {
  const me = match.me.civ;
  const them = opponent.civ;
  const brief = useMemo(() => buildBrief(me, them), [me, them]);
  const plan = getGamePlan(them);
  const playbook = getPlaybook(them);
  const stat = useMatchupStat(me, them);
  const profile = useOpponentProfile(opponent.profileId);
  const dangerData = useDangerData();
  const danger = useMemo(() => dangerWindows(me, them, dangerData), [me, them, dangerData]);
  const now = useNow();
  const elapsed = elapsedSeconds(match.startedAt, now);
  const nowWindow = danger && elapsed !== null ? windowAt(danger.windows, elapsed) : -1;
  const threats = brief ? glanceThreats(brief) : [];
  const theirName = getCiv(them)?.name ?? them;
  const root = useRef<HTMLDivElement>(null);
  useFitToScreen(root, `${me}|${them}|${!!profile}|${!!stat}|${!!danger}`);
  const winTone = stat ? (stat.win_rate >= 52 ? "good" : stat.win_rate <= 48 ? "bad" : "even") : "";

  return (
    <div ref={root} className="glance" style={{ "--civ": civColor(them) } as React.CSSProperties}>
      <header className="g-head">
        <span className="pill live">
          <span className="pulse" /> Live
        </span>
        <div className="g-side">
          <Flag civ={me} size="md" />
          <b>{getCiv(me)?.name ?? me}</b>
        </div>
        <span className="g-vs">VS</span>
        <div className="g-side">
          <Flag civ={them} size="md" />
          <div className="g-who">
            <b>{theirName}</b>
            <span className="muted">
              {opponent.name}
              {opponent.rating ? ` · ${opponent.rating}` : ""}
            </span>
          </div>
        </div>
        {profile && (
          <div className="g-habits" title={`Their last ${profile.games} games`}>
            <span>
              <b>{percent(profile.winRate)}</b> won
            </span>
            <span className={profile.shortGameShare >= 0.4 ? "hot" : undefined}>
              <b>{percent(profile.shortGameShare)}</b> end &lt;15m
            </span>
          </div>
        )}
        <span className="spacer" />
        <span className="g-map muted">{match.map}</span>
        {stat && (
          <div className={`g-win ${winTone}`}>
            <b>{Math.round(stat.win_rate)}%</b>
            <span>win rate</span>
          </div>
        )}
        {elapsed !== null && (
          <div className="g-clock" title="From when AoE4 World saw the game start, so it runs a little ahead">
            <b>≈{formatClock(elapsed)}</b>
            <span>game time</span>
          </div>
        )}
      </header>

      <YourBuild civ={me} elapsed={elapsed} />

      <section className="g-card g-plan">
        <h3>Their opening</h3>
        {plan ? (
          <div className="g-paths">
            {plan.feudal.slice(0, 2).map((f) => (
              <div key={f.id} className={`g-path style-${f.style}`}>
                <div className="g-path-main">
                  <LandmarkIcon name={f.landmark} />
                  <div className="g-path-text">
                    <b>{f.name}</b>
                    <span className="muted">
                      {STYLE_LABELS[f.style]} · Feudal <b className="ink">{f.ageUp}</b>
                    </span>
                  </div>
                  <UnitIcons names={f.army?.slice(0, 4)} civ={them} size="md" />
                </div>
                <div className="g-castles">
                  {f.castle.slice(0, 2).map((c) => (
                    <div key={c.id} className={`g-castle style-${c.style}`}>
                      <LandmarkIcon name={c.landmark} />
                      <span className="g-castle-name">{c.name}</span>
                      <span className="age-time">{c.ageUp}</span>
                      <UnitIcons names={c.army?.slice(0, 3)} civ={them} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No build plan for {theirName} yet.</p>
        )}
        {playbook && playbook.spikes.length > 0 && (
          <div className="g-spikes">
            {playbook.spikes.slice(0, 3).map((s) => (
              <div key={s.label} className="g-spike">
                <AgeMark age={s.age} label={false} />
                <b>{s.label}</b>
                <span className="g-answer">{firstSentence(s.answer)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="g-card g-counters">
        <h3>Build against</h3>
        {threats.map(({ age, threats: list }) => (
          <div key={age} className="g-age">
            <AgeMark age={age} label={false} />
            <div className="g-threats">
              {list.map(({ enemy, answers }) => (
                <div key={enemy.id} className={enemy.unique ? "g-threat unique" : "g-threat"}>
                  <Icon unit={enemy} big />
                  <span className="g-arrow">›</span>
                  {answers.length > 0 ? answers.map((a) => <Icon key={a.id} unit={a} />) : <span className="muted">Mixed army</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {danger && !danger.windows.every((w) => w.thin) && (
        <section className="g-card g-danger">
          <h3>Danger windows</h3>
          <div className="g-windows" role="table" aria-label="Your win rate by game length">
            {danger.windows.map((w, i) => (
              <div key={w.label} role="row" className={`g-window ${w.kind}${w.thin ? " thin" : ""}${i === nowWindow ? " now" : ""}`}>
                <span role="cell" className="g-window-label">
                  {w.label.replace(" min", "m")}
                </span>
                <b role="cell">{w.thin ? "–" : percent(w.winRate)}</b>
                {i === nowWindow && <span className="g-now">Now</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
