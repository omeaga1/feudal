import { invoke, isTauri } from "@tauri-apps/api/core";
import { Check, ChevronDown, FileUp } from "lucide-react";
import { Select } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { commandLabel, comboKeys, groupKeybinds, parseRkp, resolveEssentials, type KeybindProfile } from "../lib/keybinds";
import { CounterChart, KeyMap } from "./KeyMap";

const PROFILE_KEY = "feudal.keybindProfile";

function savedProfileName(): string | null {
  try {
    return localStorage.getItem(PROFILE_KEY);
  } catch {
    return null;
  }
}

function Combo({ combo }: { combo: string }) {
  return (
    <span className="combo">
      {comboKeys(combo).map((k, i) => (
        <kbd key={i}>{k}</kbd>
      ))}
    </span>
  );
}

/** The player's essential hotkeys, read from their AoE4 keybinding profile, with AoE4 defaults as a fallback. */
export function Keybinds() {
  const [profiles, setProfiles] = useState<KeybindProfile[] | null>(null);
  const [selected, setSelected] = useState<string | null>(savedProfileName);
  const [query, setQuery] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isTauri()) {
      setProfiles([]);
      return;
    }
    invoke<KeybindProfile[]>("read_keybind_profiles")
      .then(setProfiles)
      .catch(() => setProfiles([]));
  }, []);

  const loadFile = async (file: File) => {
    const profile = { name: file.name.replace(/\.rkp$/i, ""), contents: await file.text(), modified: Date.now() };
    setProfiles((list) => [...(list ?? []).filter((p) => p.name !== profile.name), profile]);
    choose(profile.name);
  };

  const choose = (name: string) => {
    setSelected(name);
    try {
      localStorage.setItem(PROFILE_KEY, name);
    } catch {
      // Not remembered; fine for this session.
    }
  };

  const profile = profiles?.find((p) => p.name === selected) ?? newest(profiles ?? []);
  const parsed = useMemo(() => (profile ? parseRkp(profile.contents) : null), [profile]);
  const essentials = useMemo(() => resolveEssentials(parsed), [parsed]);
  const results = useMemo(() => (parsed && query.trim() ? groupKeybinds(parsed, query) : []), [parsed, query]);

  const note =
    profiles === null
      ? "Looking for your keybinding profile…"
      : profile
        ? `Read from your AoE4 keybind profile "${profile.name}" (read-only). Dashed keys are AoE4 defaults.`
        : "No AoE4 keybind profile found, so these are AoE4's default keys.";

  return (
    <div className="stack">
      <section className="panel row keybind-head">
        {(profiles ?? []).length > 1 && (
          <div className="field">
            <span>Profile</span>
            <Select.Root value={profile?.name} onValueChange={choose}>
              <Select.Trigger className="select-trigger" aria-label="Profile">
                <Select.Value />
                <ChevronDown size={14} aria-hidden="true" />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="select-menu" position="popper" sideOffset={6}>
                  <Select.Viewport className="select-viewport">
                    {(profiles ?? []).map((p) => (
                      <Select.Item key={p.name} value={p.name} className="select-item">
                        <Select.ItemText>{p.name}</Select.ItemText>
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
        )}
        {profile && (
          <label className="field grow">
            <span>Find any hotkey</span>
            <input className="search-input wide" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. monastery, camera, F1" />
          </label>
        )}
        <div className="field">
          <span>{profile ? "Different profile?" : "Profile somewhere else?"}</span>
          <button type="button" className="button-secondary" onClick={() => fileInput.current?.click()}>
            <FileUp size={16} aria-hidden="true" />
            Open .rkp file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".rkp"
            hidden
            onChange={(e) => e.target.files?.[0] && void loadFile(e.target.files[0])}
          />
        </div>
      </section>

      {query.trim() ? searchResults() : <KeyMap essentials={essentials} note={note} />}

      {profiles !== null && !profile && (
        <p className="muted small">
          AoE4 saves custom hotkeys in <code>Documents\My Games\Age of Empires IV\keyBindingProfiles</code> once you make
          a profile under Settings › Controls. Feudal finds it there, and reads it without changing it.
        </p>
      )}
      <CounterChart />
    </div>
  );

  function searchResults() {
    if (results.length === 0) return <section className="panel muted">No hotkeys match "{query}".</section>;
    return (
      <div className="keybind-grid">
        {results.map(([group, binds]) => (
          <section className="panel" key={group}>
            <h3>{group}</h3>
            <table className="keybinds">
              <tbody>
                {binds.map((b) => (
                  <tr key={b.command}>
                    <td>{commandLabel(b.command)}</td>
                    <td className="keys">
                      {b.combos.map((c, i) => (
                        <span key={c}>
                          {i > 0 && <span className="muted small"> or</span>}
                          <Combo combo={c} />
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    );
  }
}

/** The most recently saved profile is most likely the one the player uses. */
function newest(profiles: KeybindProfile[]): KeybindProfile | undefined {
  return [...profiles].sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0))[0];
}
