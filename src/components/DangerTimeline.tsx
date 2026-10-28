import { useEffect, useMemo, useState } from "react";
import { dangerWindows, loadDangerData, summarizeWindows, type DangerData } from "../lib/dangerWindows";
import { getCiv } from "../lib/gameData";
import { appFetch } from "../lib/http";

// Fetch the freshest numbers once per app session.
let dataRequest: Promise<DangerData> | null = null;

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Win rate by game length for this matchup, as a strip of bars: red where you tend to lose, green where you win. */
export function DangerTimeline({ myCivId, enemyCivId }: { myCivId: string; enemyCivId: string }) {
  const [data, setData] = useState<DangerData | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    dataRequest ??= loadDangerData(appFetch);
    void dataRequest.then((d) => !cancelled && setData(d));
    return () => {
      cancelled = true;
    };
  }, []);

  const result = useMemo(() => dangerWindows(myCivId, enemyCivId, data), [myCivId, enemyCivId, data]);
  if (!result) return null;
  const enemyName = getCiv(enemyCivId)?.name ?? enemyCivId;

  if (result.windows.every((w) => w.thin)) {
    return (
      <section className="panel">
        <h3>Danger windows</h3>
        <p className="muted">
          Still collecting current-patch games against {enemyName} ({result.games} so far). This fills in on its own
          over the next few days.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Danger windows</h3>
        <span className="muted small">Your win rate by when the game ends</span>
      </div>
      <p>{summarizeWindows(result)}</p>
      <div className="timeline" role="table" aria-label="Your win rate by game length">
        {result.windows.map((w) => (
          <div key={w.label} className={`window ${w.kind}${w.thin ? " thin" : ""}`} role="row">
            <div className="bar" aria-hidden="true">
              <div className="fill" style={{ height: `${Math.round(w.winRate * 100)}%` }} />
              <div className="even-line" />
            </div>
            <b role="cell">{w.thin ? "–" : percent(w.winRate)}</b>
            <span className="muted small" role="cell">
              {w.label}
            </span>
            <span className="muted small" role="cell">
              {w.games} games
            </span>
          </div>
        ))}
      </div>
      <p className="muted small">
        {result.basis === "matchup" ? "This matchup" : `Everyone vs ${enemyName}`}, {result.games.toLocaleString()} games this patch. Dash: too few games.
      </p>
    </section>
  );
}
