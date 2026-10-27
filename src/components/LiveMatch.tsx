import { useState } from "react";
import type { LiveStatus } from "../lib/liveMatch";
import { getCiv } from "../lib/gameData";
import { parseProfileInput } from "../lib/profile";
import { BriefView } from "./BriefView";

interface Props {
  profileId: number | null;
  status: LiveStatus;
  onProfileChange: (id: number | null) => void;
}

export function LiveMatch({ profileId, status, onProfileChange }: Props) {
  const [draft, setDraft] = useState("");
  const [opponentIndex, setOpponentIndex] = useState(0);

  const save = () => {
    const id = parseProfileInput(draft);
    if (id !== null) onProfileChange(id);
  };

  if (profileId === null) {
    return (
      <section className="panel">
        <h2>Link your AoE4 World profile</h2>
        <p className="muted">
          Paste your profile link from aoe4world.com (or just the number in it). Feudal checks it every 15 seconds and
          opens the matchup brief when your ranked or quick-match game starts.
        </p>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            id="profile-id"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://aoe4world.com/players/1234567"
          />
          <button type="submit">Save</button>
        </form>
        {draft.trim() !== "" && parseProfileInput(draft) === null && (
          <p className="error small">That doesn't look like an AoE4 World profile link or number.</p>
        )}
      </section>
    );
  }

  if (status.kind === "in-game") {
    const { match } = status;
    const opponent = match.opponents[Math.min(opponentIndex, match.opponents.length - 1)];
    return (
      <div className="stack">
        <section className="panel match-head">
          <span className="pill live">In game</span>
          <span>
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
        </section>
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
    <section className="panel">
      <h2>Waiting for your next game</h2>
      {status.kind === "error" && <p className="error">Couldn't reach AoE4 World: {status.message}. Retrying.</p>}
      {status.kind === "waiting" && status.lastMatch && (
        <p className="muted">
          Last game: {getCiv(status.lastMatch.me.civ)?.name ?? status.lastMatch.me.civ} vs{" "}
          {status.lastMatch.opponents.map((o) => getCiv(o.civ)?.name ?? o.civ).join(", ")} on {status.lastMatch.map}.
        </p>
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
