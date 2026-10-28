import { Check, ChevronDown, Map as MapIcon } from "lucide-react";
import { Select } from "radix-ui";
import { maps } from "../lib/maps";
import { usePersisted } from "../lib/persisted";
import { BriefView } from "./BriefView";
import { VersusBar } from "./CivPicker";

const ANY = "any";
const mapNames = maps.map((m) => m.name).sort((a, b) => a.localeCompare(b));

/** Pick any two civs (and optionally a map) to read the matchup before a game. */
export function MatchupBrowser({ defaultCiv }: { defaultCiv?: string }) {
  const [pair, setPair] = usePersisted("feudal.matchup", { me: defaultCiv ?? "english", them: "holy_roman_empire" });
  const [map, setMap] = usePersisted("feudal.matchup.map", "");

  return (
    <div className="stack">
      <div className="versus-wrap">
        <VersusBar me={pair.me} them={pair.them} editable onChange={(me, them) => setPair({ me, them })} />
        <Select.Root value={map || ANY} onValueChange={(v) => setMap(v === ANY ? "" : v)}>
          <Select.Trigger className="map-chip" aria-label="Map">
            <MapIcon size={14} aria-hidden="true" />
            <Select.Value />
            <ChevronDown size={14} aria-hidden="true" />
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className="select-menu" position="popper" sideOffset={6} align="center">
              <Select.Viewport className="select-viewport">
                <Select.Item value={ANY} className="select-item">
                  <Select.ItemText>Any map</Select.ItemText>
                  <Select.ItemIndicator className="select-check">
                    <Check size={14} />
                  </Select.ItemIndicator>
                </Select.Item>
                <Select.Separator className="select-sep" />
                {mapNames.map((m) => (
                  <Select.Item key={m} value={m} className="select-item">
                    <Select.ItemText>{m}</Select.ItemText>
                    <Select.ItemIndicator className="select-check">
                      <Check size={14} />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>
      <BriefView myCivId={pair.me} enemyCivId={pair.them} mapName={map || undefined} />
    </div>
  );
}
