import { Command } from "cmdk";
import { LoaderCircle, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { FaSteam } from "react-icons/fa";
import { appFetch } from "../lib/http";
import { parseProfileQuery, playerForSteamId, resolveProfile, suggestPlayers, type FoundPlayer } from "../lib/profile";
import { canSignInWithSteam, detectSteamAccounts, signInWithSteam } from "../lib/steam";
import { PlayerLine } from "./PlayerBits";

/**
 * Find any AoE4 World player by typing: names suggest as you type, and a
 * pasted aoe4world.com or Steam link works too.
 */
export function PlayerSearch({ onPick, placeholder, autoFocus }: { onPick: (p: FoundPlayer) => void; placeholder: string; autoFocus?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoundPlayer[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const parsed = parseProfileQuery(q);
    setMessage(null);
    if (q.length < 2 || parsed?.kind !== "name") {
      setResults([]);
      return;
    }
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      setBusy(true);
      suggestPlayers(appFetch, q)
        .then((players) => ticket === latest.current && setResults(players))
        .catch(() => ticket === latest.current && setMessage("Couldn't reach AoE4 World. Check your connection."))
        .finally(() => ticket === latest.current && setBusy(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const pick = (p: FoundPlayer) => {
    setQuery("");
    setResults([]);
    setOpen(false);
    onPick(p);
  };

  // Enter with nothing highlighted: treat the text as a link or an exact name.
  const submit = async () => {
    const parsed = parseProfileQuery(query);
    if (!parsed) {
      setMessage("That link isn't one Feudal can read. Paste an aoe4world.com or Steam profile link, or type a name.");
      return;
    }
    setBusy(true);
    try {
      const result = await resolveProfile(appFetch, parsed);
      if (result.kind === "found") pick(result.player);
      else if (result.kind === "choose") setResults(result.players);
      else setMessage(result.message);
    } catch (err) {
      setMessage(`Couldn't reach AoE4 World: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Command className="player-search" shouldFilter={false} label={placeholder}>
      {busy ? <LoaderCircle className="player-search-icon spin" size={16} /> : <Search className="player-search-icon" size={16} />}
      <Command.Input
        className="player-search-input"
        value={query}
        onValueChange={(v) => {
          setQuery(v);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results.length === 0) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.div className="player-search-results" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}>
            <Command.List>
              {results.map((p) => (
                <Command.Item key={p.profileId} value={String(p.profileId)} onSelect={() => pick(p)} onMouseDown={(e) => e.preventDefault()} className="player-search-item">
                  <PlayerLine player={p} />
                </Command.Item>
              ))}
            </Command.List>
          </motion.div>
        )}
      </AnimatePresence>
      {message && <p className="error small player-search-message">{message}</p>}
    </Command>
  );
}

type SteamState = { kind: "idle" } | { kind: "waiting" } | { kind: "error"; message: string };

/** First run: link the player's AoE4 World profile with as little typing as possible. */
export function ProfileLink({ onLinked }: { onLinked: (player: FoundPlayer) => void }) {
  const [found, setFound] = useState<FoundPlayer[] | null>(null);
  const [steam, setSteam] = useState<SteamState>({ kind: "idle" });

  // Steam accounts already signed in on this PC, matched to AoE4 World players.
  useEffect(() => {
    let cancelled = false;
    detectSteamAccounts()
      .then((accounts) => Promise.all(accounts.slice(0, 3).map((a) => playerForSteamId(appFetch, a.steamId).catch(() => null))))
      .then((players) => !cancelled && setFound(players.filter((p): p is FoundPlayer => p !== null)))
      .catch(() => !cancelled && setFound([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const steamSignIn = async () => {
    setSteam({ kind: "waiting" });
    try {
      const steamId = await signInWithSteam();
      const player = await playerForSteamId(appFetch, steamId);
      if (player) onLinked(player);
      else
        setSteam({
          kind: "error",
          message: "You're signed in, but AoE4 World has no games for that Steam account yet. Search your in-game name instead.",
        });
    } catch (err) {
      setSteam({ kind: "error", message: `Steam sign-in didn't finish: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  return (
    <section className="panel onboard">
      <h2>Find your profile</h2>
      <p className="muted">Feudal needs your AoE4 World profile once. After that, your matchup brief opens by itself whenever a ranked or quick match starts.</p>

      {found && found.length > 0 && (
        <div className="onboard-block">
          <span className="onboard-label">Found on this PC</span>
          <div className="found-list">
            {found.map((p) => (
              <button key={p.profileId} type="button" className="found-card" onClick={() => onLinked(p)}>
                <PlayerLine player={p} />
                <span className="found-cta">That's me</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="onboard-options">
        {canSignInWithSteam() && (
          <div className="onboard-block">
            <span className="onboard-label">Play on Steam</span>
            <button type="button" className="steam-button" onClick={() => void steamSignIn()} disabled={steam.kind === "waiting"}>
              {steam.kind === "waiting" ? <LoaderCircle className="spin" size={20} /> : <FaSteam size={20} aria-hidden="true" />}
              {steam.kind === "waiting" ? "Finish signing in in your browser" : "Sign in through Steam"}
            </button>
            <span className="muted small">Opens Steam's own sign-in page. Feudal only receives your Steam ID, never your password.</span>
            {steam.kind === "error" && <p className="error small">{steam.message}</p>}
          </div>
        )}
        <div className="onboard-block grow">
          <span className="onboard-label">Xbox, Game Pass, or anything else</span>
          <PlayerSearch onPick={onLinked} placeholder="Type your in-game name" autoFocus={!canSignInWithSteam()} />
          <span className="muted small">Pasting an aoe4world.com or Steam profile link works too.</span>
        </div>
      </div>
    </section>
  );
}
