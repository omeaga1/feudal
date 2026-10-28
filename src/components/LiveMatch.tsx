import { Link2, LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { LiveStatus } from "../lib/liveMatch";
import { getCiv } from "../lib/gameData";
import { appFetch } from "../lib/http";
import { parseProfileQuery, resolveProfile, type FoundPlayer } from "../lib/profile";
import { BriefView } from "./BriefView";
import { VersusBar } from "./CivPicker";

interface Props {
  profileId: number | null;
  profileName: string | null;
  status: LiveStatus;
  onProfileChange: (id: number | null, name?: string) => void;
}

function ProfileLink({ onLinked }: { onLinked: (player: FoundPlayer) => void }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [choices, setChoices] = useState<FoundPlayer[]>([]);
  const query = parseProfileQuery(draft);

  const submit = async () => {
    setChoices([]);
    setMessage(null);
    if (!query) {
      setMessage("Paste your aoe4world.com profile link, your Steam profile link, or your in-game name.");
      return;
    }
    setBusy(true);
    try {
      const result = await resolveProfile(appFetch, query);
      if (result.kind === "found") onLinked(result.player);
      else if (result.kind === "choose") setChoices(result.players);
      else setMessage(result.message);
    } catch (err) {
      setMessage(`Couldn't reach AoE4 World: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>Link your AoE4 World profile</h2>
      <ol className="onboard-steps">
        <li>
          <span className="onboard-num">1</span>
          <span>
            <b>Link once.</b> Your aoe4world.com link, Steam link, or in-game name.
          </span>
        </li>
        <li>
          <span className="onboard-num">2</span>
          <span>
            <b>Queue up.</b> Feudal checks AoE4 World every 15 seconds.
          </span>
        </li>
        <li>
          <span className="onboard-num">3</span>
          <span>
            <b>Read the brief.</b> It opens on its own when a ranked or quick match starts.
          </span>
        </li>
      </ol>
      <form
        className="row profile-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Link2 className="input-icon" size={16} aria-hidden="true" />
        <input
          id="profile-id"
          className="grow with-icon"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://aoe4world.com/players/1234567 or your name"
          autoFocus
        />
        <button type="submit" className="button-primary" disabled={busy || draft.trim() === ""}>
          {busy && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
          {busy ? "Looking" : "Link"}
        </button>
      </form>
      {message && <p className="error small">{message}</p>}
      {choices.length > 0 && (
        <div className="stack choices">
          <p className="muted small">Several players have that name. Which one is you?</p>
          {choices.map((p) => (
            <button key={p.profileId} type="button" className="choice" onClick={() => onLinked(p)}>
              <b>{p.name}</b>
              <span className="muted small">
                {[p.rating ? `${p.rating} rating` : null, p.lastGameAt ? `last game ${p.lastGameAt.slice(0, 10)}` : null, `#${p.profileId}`]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function LiveMatch({ profileId, profileName, status, onProfileChange }: Props) {
  const [opponentIndex, setOpponentIndex] = useState(0);

  if (profileId === null) {
    return <ProfileLink onLinked={(p) => onProfileChange(p.profileId, p.name)} />;
  }

  if (status.kind === "in-game") {
    const { match } = status;
    const opponent = match.opponents[Math.min(opponentIndex, match.opponents.length - 1)];
    return (
      <div className="stack">
        <div className="live-head">
          <span className="pill live">
            <span className="pulse" /> In game
          </span>
          <span className="muted">
            {match.map} · {match.kind.replace(/_/g, " ")}
          </span>
          {match.opponents.length > 1 && (
            <div className="row">
              {match.opponents.map((o, i) => (
                <button
                  key={o.profileId}
                  type="button"
                  className={i === opponentIndex ? "tab active" : "tab"}
                  onClick={() => setOpponentIndex(i)}
                >
                  {o.name} ({getCiv(o.civ)?.name ?? o.civ})
                </button>
              ))}
            </div>
          )}
        </div>
        {opponent && <VersusBar me={match.me.civ} them={opponent.civ} myName={match.me.name} theirName={opponent.name} />}
        {opponent && (
          <BriefView
            myCivId={match.me.civ}
            enemyCivId={opponent.civ}
            opponentName={opponent.name}
            opponentProfileId={opponent.profileId}
            gameBuild={match.patch}
            mapName={match.map}
          />
        )}
      </div>
    );
  }

  return (
    <section className="panel waiting">
      <div className="radar" aria-hidden="true">
        <span />
      </div>
      <h2>Waiting for your next game</h2>
      <p className="muted">Linked to {profileName ?? `AoE4 World profile #${profileId}`}.</p>
      {status.kind === "error" && <p className="error">Couldn't reach AoE4 World: {status.message}. Retrying.</p>}
      {status.kind === "waiting" && status.lastMatch && (
        <p className="muted">
          Last game: {getCiv(status.lastMatch.me.civ)?.name ?? status.lastMatch.me.civ} vs{" "}
          {status.lastMatch.opponents.map((o) => getCiv(o.civ)?.name ?? o.civ).join(", ")} on {status.lastMatch.map}.
        </p>
      )}
      {status.kind === "waiting" && !status.lastMatch && (
        <p className="muted">AoE4 World doesn't show a ranked or quick-match game for this profile yet.</p>
      )}
      <p className="muted">
        The brief opens on its own once your game shows up on AoE4 World. Custom and AI games don't appear there; use
        Matchups for those.
      </p>
      <button type="button" className="link" onClick={() => onProfileChange(null)}>
        Change profile
      </button>
    </section>
  );
}
