import { useState } from "react";
import type { LiveStatus } from "../lib/liveMatch";
import { getCiv } from "../lib/gameData";
import { BriefView } from "./BriefView";
import { VersusBar } from "./CivPicker";
import { ProfileLink } from "./ProfileLink";

interface Props {
  profileId: number | null;
  profileName: string | null;
  status: LiveStatus;
  onProfileChange: (id: number | null, name?: string) => void;
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
