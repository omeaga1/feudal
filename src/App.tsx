import { useState } from "react";
import { Keybinds } from "./components/Keybinds";
import { LiveMatch } from "./components/LiveMatch";
import { MatchupBrowser } from "./components/MatchupBrowser";
import { dataMeta } from "./lib/gameData";

type View = "live" | "browser" | "keybinds";

const VIEWS: { id: View; label: string }[] = [
  { id: "live", label: "Live match" },
  { id: "browser", label: "Matchups" },
  { id: "keybinds", label: "Keybinds" },
];

export default function App() {
  const [view, setView] = useState<View>("live");

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Feudal</span>
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
      </header>

      <main className="content">
        {view === "live" && <LiveMatch />}
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
