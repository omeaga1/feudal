import { invoke, isTauri } from "@tauri-apps/api/core";
import { Check, ChevronDown, FileUp } from "lucide-react";
import { Select } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { commandLabel, comboKeys, groupKeybinds, parseRkp, type KeybindProfile } from "../lib/keybinds";
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

/** A glanceable view of the player's own hotkeys, read from their AoE4 keybinding profiles. */
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
    const profile = { name: file.name.replace(/\.rkp$/i, ""), contents: await file.text() };
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

  const profile = profiles?.find((p) => p.name === selected) ?? profiles?.[0];
  const groups = useMemo(() => (profile ? groupKeybinds(parseRkp(profile.contents), query) : []), [profile, query]);

  return (
    <div className="stack">
      <KeyMap />
      <CounterChart />
      {profiles === null ? (
        <section className="panel muted">Looking for your keybinding profiles…</section>
      ) : (
        profileView()
      )}
    </div>
  );

  function profileView() {
    return (
    <div className="stack">
      <h2 className="section-title">Your full keybinding profile</h2>
      <section className="panel row keybind-head">
        {(profiles ?? []).length > 0 && (
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
            <span>Search</span>
            <input className="search-input wide" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. idle, town center, F1" />
          </label>
        )}
        <div className="field">
          <span>Profile file</span>
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

      {!profile && (
        <section className="panel">
          <h2>No keybinding profile found</h2>
          <p className="muted">
            AoE4 saves custom hotkeys in <code>Documents\My Games\Age of Empires IV\keyBindingProfiles</code> once you
            make a profile under Settings › Hotkeys. Feudal reads those files (it never changes them). If yours live
            somewhere else, open the <code>.rkp</code> file above.
          </p>
        </section>
      )}

      {profile && groups.length === 0 && <section className="panel muted">No hotkeys match "{query}".</section>}

      <div className="keybind-grid">
        {groups.map(([group, binds]) => (
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
    </div>
    );
  }
}
