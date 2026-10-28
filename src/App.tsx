import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { GiCrossedSwords, GiKnightBanner, GiRadarSweep } from "react-icons/gi";
import { MdKeyboard } from "react-icons/md";
import { Toaster, toast } from "sonner";
import { CivAnalysis } from "./components/CivAnalysis";
import { Keybinds } from "./components/Keybinds";
import { LiveMatch } from "./components/LiveMatch";
import { Flag } from "./components/Flag";
import { MatchupBrowser } from "./components/MatchupBrowser";
import { Tip, TipProvider } from "./components/ui";
import { UpdateNotice } from "./components/UpdateNotice";
import { dataMeta, getCiv } from "./lib/gameData";
import { appFetch } from "./lib/http";
import { useLiveMatch } from "./lib/liveMatch";
import { loadProfileId, loadProfileName, saveProfileId } from "./lib/profile";

type View = "live" | "matchups" | "civs" | "keybinds";

const VIEWS: { id: View; label: string; hint: string; icon: ComponentType }[] = [
  { id: "live", label: "Live", hint: "Your current game, opened on its own", icon: GiRadarSweep },
  { id: "matchups", label: "Matchups", hint: "Read any matchup before a game", icon: GiCrossedSwords },
  { id: "civs", label: "Civs", hint: "Game plans and units for each civ", icon: GiKnightBanner },
  { id: "keybinds", label: "Keys", hint: "Hotkeys and the counter chart", icon: MdKeyboard },
];

export default function App() {
  const [view, setView] = useState<View>("live");
  const [profileId, setProfileId] = useState<number | null>(loadProfileId);
  const [profileName, setProfileName] = useState<string | null>(loadProfileName);
  // Polling lives here, not in the Live tab, so it keeps running on every tab.
  const status = useLiveMatch(profileId, appFetch);
  const liveGameId = status.kind === "in-game" ? status.match.gameId : null;
  const shownGameId = useRef<number | null>(null);
  const lastCiv = status.kind === "in-game" ? status.match.me.civ : status.kind === "waiting" ? status.lastMatch?.me.civ : undefined;

  // When a new game starts, jump to its brief. The player never has to click
  // anything once a game is under way.
  useEffect(() => {
    if (liveGameId !== null && liveGameId !== shownGameId.current) {
      shownGameId.current = liveGameId;
      setView("live");
      if (status.kind === "in-game") {
        const { me, opponents, map } = status.match;
        toast(
          <span className="toast-match">
            <Flag civ={me.civ} size="sm" />
            <b>vs</b>
            {opponents.map((o) => (
              <Flag key={o.profileId} civ={o.civ} size="sm" />
            ))}
          </span>,
          { description: `Game found on ${map}. Your brief is open.` },
        );
      }
    }
  }, [liveGameId, status]);

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
    <TipProvider>
    <div className="app">
      <nav className="rail" aria-label="Sections">
        <div className="brand" title="Feudal">
          <span className="brand-mark">F</span>
        </div>
        {VIEWS.map((v) => (
          <Tip key={v.id} label={v.hint} side="right">
            <button
              className={v.id === view ? "rail-item active" : "rail-item"}
              onClick={() => setView(v.id)}
              type="button"
              aria-current={v.id === view ? "page" : undefined}
            >
              {v.id === view && <motion.span layoutId="rail-active" className="rail-active" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
              <span className="rail-icon" aria-hidden="true">
                <v.icon />
              </span>
              <span className="rail-label">{v.label}</span>
              {v.id === "live" && status.kind === "in-game" && <span className="rail-dot" />}
            </button>
          </Tip>
        ))}
        <span className="spacer" />
        <UpdateNotice safeToInstall={profileId === null || status.kind === "waiting"} />
      </nav>

      <div className="main">
        <main className="content">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              {view === "live" && <LiveMatch profileId={profileId} profileName={profileName} status={status} onProfileChange={changeProfile} />}
              {view === "matchups" && <MatchupBrowser defaultCiv={lastCiv} />}
              {view === "civs" && <CivAnalysis defaultCiv={lastCiv} />}
              {view === "keybinds" && <Keybinds />}
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="footer">
          Unit data from AoE4 World ({dataMeta.syncedAt.slice(0, 10)}), build orders from aoe4guides.com. Age of Empires IV ©
          Microsoft Corporation. Feudal was created under Microsoft's "Game Content Usage Rules" using assets from Age of
          Empires IV, and it is not endorsed by or affiliated with Microsoft.
        </footer>
      </div>
      <Toaster theme="dark" position="bottom-right" toastOptions={{ className: "toast" }} />
    </div>
    </TipProvider>
  );
}
