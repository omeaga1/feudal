import { maps } from "../lib/maps";
import { usePersisted } from "../lib/persisted";
import { BriefView } from "./BriefView";
import { VersusBar } from "./CivPicker";

const mapNames = maps.map((m) => m.name).sort((a, b) => a.localeCompare(b));

/** Pick any two civs (and optionally a map) to read the matchup before a game. */
export function MatchupBrowser({ defaultCiv }: { defaultCiv?: string }) {
  const [pair, setPair] = usePersisted("feudal.matchup", { me: defaultCiv ?? "english", them: "holy_roman_empire" });
  const [map, setMap] = usePersisted("feudal.matchup.map", "");

  return (
    <div className="stack">
      <div className="versus-wrap">
        <VersusBar me={pair.me} them={pair.them} editable onChange={(me, them) => setPair({ me, them })} />
        <label className="map-chip">
          <span>Map</span>
          <select value={map} onChange={(e) => setMap(e.target.value)}>
            <option value="">Any</option>
            {mapNames.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
      <BriefView myCivId={pair.me} enemyCivId={pair.them} mapName={map || undefined} />
    </div>
  );
}
