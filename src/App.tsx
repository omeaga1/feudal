import { useEffect, useRef, useState } from "react";
import { Keybinds } from "./components/Keybinds";
import { LiveMatch } from "./components/LiveMatch";
import { MatchupBrowser } from "./components/MatchupBrowser";
import { UpdateNotice } from "./components/UpdateNotice";
import { dataMeta, getCiv } from "./lib/gameData";
import { appFetch } from "./lib/http";
import { useLiveMatch } from "./lib/liveMatch";
import { loadProfileId, loadProfileName, saveProfileId } from "./lib/profile";

type View = "live" | "browser" | "keybinds";

const VIEWS: { id: View; label: string }[] = [
  { id: "live", label: "Live match" },
  { id: "browser", label: "Matchups" },
  { id: "keybinds", label: "Keybinds" },
];

export default function App() {
  const [view, setView] = useState<View>("live");
  const [profileId, setProfileId] = useState<number | null>(loadProfileId);
  const [profileName, setProfileName] = useState<string | null>(loadProfileName);
  // Polling lives here, not in the Live tab, so it keeps running on every tab.
  const status = useLiveMatch(profileId, appFetch);
  const liveGameId = status.kind === "in-game" ? status.match.gameId : null;
  const shownGameId = useRef<number | null>(null);

  // When a new game starts, jump to its brief. The player never has to click
  // anything once a game is under way.
  useEffect(() => {
    if (liveGameId !== null && liveGameId !== shownGameId.current) {
      shownGameId.current = liveGameId;
      setView("live");
    }
  }, [liveGameId]);

  useEffect(() => {
    if (status.kind !== "in-game") {
      document.title = "Feudal";
      return;
    }
    const { me, opponents } = status.match;
    const civName = (id: string) => getCiv(id)?.name ?? id;
    document.title = `Feudal · ${civName(me.civ)} vs ${opponents.map((o) => civName(o.civ)).join(", ")}`;
  }, [status]);

  const changeProfile = (id: number | null, name?: string) => {
    saveProfileId(id, name);
    setProfileId(id);
    setProfileName(name ?? null);
  };

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Feudal</span>
        {status.kind === "in-game" && view !== "live" && (
          <span className="pill live">In game</span>
        )}
        <nav className="tabs">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={v.id === view ? "tab active" : "tab"}
              onClick={() => setView(v.id)}
              type="button"
            >
              {v.label}
            </button>
          ))}
        </nav>
        <UpdateNotice />
      </header>

      <main className="content">
        {view === "live" && <LiveMatch profileId={profileId} profileName={profileName} status={status} onProfileChange={changeProfile} />}
        {view === "browser" && <MatchupBrowser />}
        {view === "keybinds" && <Keybinds />}
      </main>

      <footer className="footer">
        Unit data from AoE4 World ({dataMeta.syncedAt.slice(0, 10)}). Age of Empires IV © Microsoft Corporation.
        Feudal was created under Microsoft's "Game Content Usage Rules" using assets from Age of Empires IV, and it
        is not endorsed by or affiliated with Microsoft.
      </footer>
    </div>
  );
}
