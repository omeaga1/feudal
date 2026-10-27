import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { commandLabel, comboKeys, groupKeybinds, parseRkp, type KeybindProfile } from "../lib/keybinds";

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

  if (profiles === null) return <section className="panel muted">Looking for your keybinding profiles…</section>;

  return (
    <div className="stack">
      <section className="panel row keybind-head">
        {profiles.length > 0 && (
          <label className="field">
            <span>Profile</span>
            <select value={profile?.name ?? ""} onChange={(e) => choose(e.target.value)}>
              {profiles.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {profile && (
          <label className="field grow">
            <span>Search</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. idle, town center, F1" />
          </label>
        )}
        <label className="field">
          <span>Open a profile file</span>
          <input type="file" accept=".rkp" onChange={(e) => e.target.files?.[0] && void loadFile(e.target.files[0])} />
        </label>
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
