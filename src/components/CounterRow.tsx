export interface CounterUnit {
  name: string;
  icon?: string;
}

/** "Veteran Spearman" -> "Spearman": the age tier is clear from context and the short name reads faster. */
const shortName = (name: string) => name.replace(/^(Early|Hardened|Veteran|Elite) /, "");

function UnitTile({ unit, size }: { unit: CounterUnit; size: "lg" | "md" }) {
  return (
    <span className={`unit-tile ${size}`} title={unit.name}>
      {unit.icon ? <img src={unit.icon} alt="" loading="lazy" /> : <span className="unit-tile-blank">{unit.name === "Buildings" ? "🏰" : unit.name[0]}</span>}
      <span className="unit-tile-name">{size === "md" ? shortName(unit.name) : unit.name}</span>
    </span>
  );
}

/** One line of the counter cheat sheet: their unit, then what to build against it. */
export function CounterRow({ enemy, answers, note, unique }: { enemy: CounterUnit; answers: CounterUnit[]; note?: string; unique?: boolean }) {
  return (
    <div className={unique ? "counter-row unique" : "counter-row"}>
      <div className="counter-enemy">
        <UnitTile unit={enemy} size="lg" />
        {note && <span className="counter-note">{note}</span>}
      </div>
      <span className="counter-arrow">Build</span>
      <div className="counter-answers">
        {answers.length === 0 ? <span className="muted small">A mixed army</span> : answers.map((a) => <UnitTile key={a.name} unit={a} size="md" />)}
      </div>
    </div>
  );
}
