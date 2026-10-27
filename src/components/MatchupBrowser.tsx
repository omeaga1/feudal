import { useState } from "react";
import { civs } from "../lib/gameData";
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

  return (
    <div className="stack">
      <section className="panel row">
        <CivSelect id="my-civ" label="You" value={myCiv} onChange={setMyCiv} />
        <CivSelect id="enemy-civ" label="Them" value={enemyCiv} onChange={setEnemyCiv} />
      </section>
      <BriefView myCivId={myCiv} enemyCivId={enemyCiv} />
    </div>
  );
}
