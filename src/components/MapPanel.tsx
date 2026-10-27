import { useEffect, useState } from "react";
import { getCiv } from "../lib/gameData";
import { appFetch } from "../lib/http";
import { fetchMapStats, getMapInfo, type MapStats } from "../lib/maps";

function civLine(stats: MapStats, civId: string, label: string) {
  const row = stats.civs.find((c) => c.civilization === civId);
  if (!row) return null;
  const rank = [...stats.civs].sort((a, b) => b.win_rate - a.win_rate).findIndex((c) => c.civilization === civId) + 1;
  return (
    <li>
      {label} ({getCiv(civId)?.name ?? civId}) win <b>{row.win_rate.toFixed(1)}%</b> here, #{rank} of {stats.civs.length}{" "}
      civs on this map.
    </li>
  );
}

/** Notes and civ win rates for the map being played. */
export function MapPanel({ mapName, myCivId, enemyCivId }: { mapName: string; myCivId: string; enemyCivId: string }) {
  const info = getMapInfo(mapName);
  const [stats, setStats] = useState<MapStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    fetchMapStats(appFetch, mapName)
      .then((s) => !cancelled && setStats(s))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mapName]);

  if (!info && !stats) return null;
  return (
    <section className="panel">
      <h3>
        On {info?.name ?? mapName}
        {info?.features.map((f) => (
          <span className="pill" key={f}>
            {f}
          </span>
        ))}
      </h3>
      {info && <p className="muted">{info.summary}</p>}
      {info && info.tips.length > 0 && (
        <ul className="plan">
          {info.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      {stats && (
        <ul className="plan muted">
          {civLine(stats, myCivId, "You")}
          {civLine(stats, enemyCivId, "They")}
        </ul>
      )}
    </section>
  );
}
