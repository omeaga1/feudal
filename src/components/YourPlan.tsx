import { useEffect, useState } from "react";
import { bundledBuildWatch, loadBuildWatch, planIsStale, type BuildWatch } from "../lib/buildWatch";
import { getCiv } from "../lib/gameData";
import { getGamePlan } from "../lib/gamePlans";
import { appFetch } from "../lib/http";
import { usePersisted } from "../lib/persisted";
import { PlanTree, resolveSelection, type PlanSelection } from "./PlanTree";
import { StepTrack } from "./StepTrack";
import { VillagerChart } from "./VillagerChart";

let watchRequest: Promise<BuildWatch> | null = null;

/** The build-watch report, fetched once per session. */
function useBuildWatch(): BuildWatch {
  const [watch, setWatch] = useState(bundledBuildWatch);
  useEffect(() => {
    let cancelled = false;
    (watchRequest ??= loadBuildWatch(appFetch)).then((w) => !cancelled && setWatch(w));
    return () => {
      cancelled = true;
    };
  }, []);
  return watch;
}

/** Your branching plan for a civ: pick a path in the tree, read the villager chart and timed steps for it. */
export function YourPlan({ civ, gameBuild, full = false, title }: { civ: string; gameBuild?: number; full?: boolean; title?: string }) {
  const plan = getGamePlan(civ);
  const [selection, setSelection] = usePersisted<PlanSelection | null>(`feudal.plan.${civ}`, null);
  const watch = useBuildWatch();
  const civName = getCiv(civ)?.name ?? civ;
  if (!plan) {
    return (
      <section className="panel">
        <h3>{title ?? `Your plan as ${civName}`}</h3>
        <p className="muted">No build plan for {civName} yet.</p>
      </section>
    );
  }
  const path = resolveSelection(plan, selection);
  const sel = { feudal: path.feudal.id, castle: path.castle.id };
  const stale = planIsStale(plan.checkedBuild, watch, gameBuild);
  const fresh = watch.civs[civ]?.fresh ?? [];

  return (
    <section className="panel plan-panel">
      <div className="panel-head">
        <h3>{title ?? `Your plan as ${civName}`}</h3>
        <span className="muted small">Click a path. Feudal picks which Castle options you get.</span>
        <span className="spacer" />
        {stale && (
          <span className="pill draft" title={`Plan checked on build ${plan.checkedBuild}`}>
            New patch: plan not re-checked yet
          </span>
        )}
        <span className="pill subtle">{plan.season} guides</span>
      </div>
      <PlanTree plan={plan} selection={sel} onSelect={setSelection} full={full} />
      <div className="plan-detail">
        <VillagerChart plan={plan} path={path} />
        <StepTrack plan={plan} path={path} />
      </div>
      {fresh.length > 0 && (
        <p className="fresh-guides small">
          <span className="fresh-label">New guides</span>
          {fresh.map((g) => (
            <span key={g.url} className="fresh-guide">
              <a href={g.url} target="_blank" rel="noreferrer">
                {g.title}
              </a>
              <span className="muted"> · {g.author}</span>
              {g.video && (
                <a href={g.video} target="_blank" rel="noreferrer" className="video-link" title="Watch the guide">
                  {" "}▶
                </a>
              )}
            </span>
          ))}
        </p>
      )}
      <p className="sources muted small">
        From{" "}
        {plan.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && " · "}
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.title}
            </a>
            {s.video && (
              <>
                {" "}
                <a href={s.video} target="_blank" rel="noreferrer" className="video-link" title="Watch the guide">
                  ▶
                </a>
              </>
            )}
          </span>
        ))}
      </p>
    </section>
  );
}
