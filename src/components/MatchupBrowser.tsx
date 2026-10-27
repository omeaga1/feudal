import { useState } from "react";
import { civs } from "../lib/gameData";
import { maps } from "../lib/maps";
import { BriefView } from "./BriefView";

function CivSelect({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {civs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MatchupBrowser() {
  const [myCiv, setMyCiv] = useState("english");
  const [enemyCiv, setEnemyCiv] = useState("holy_roman_empire");
  const [map, setMap] = useState("");

  return (
    <div className="stack">
      <section className="panel row">
        <CivSelect id="my-civ" label="You" value={myCiv} onChange={setMyCiv} />
        <CivSelect id="enemy-civ" label="Them" value={enemyCiv} onChange={setEnemyCiv} />
        <label className="field" htmlFor="map">
          <span>Map</span>
          <select id="map" value={map} onChange={(e) => setMap(e.target.value)}>
            <option value="">Any map</option>
            {[...maps]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
          </select>
        </label>
      </section>
      <BriefView myCivId={myCiv} enemyCivId={enemyCiv} mapName={map || undefined} />
    </div>
  );
}
