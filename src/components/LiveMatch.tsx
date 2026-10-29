import { useEffect, useState } from "react";
import { GiCrossedSwords } from "react-icons/gi";
import type { LiveStatus } from "../lib/liveMatch";
import { civColor } from "../lib/civColors";
import { getCiv } from "../lib/gameData";
import { appFetch } from "../lib/http";
import { fetchPlayer, timeAgo, type PlayerDetails } from "../lib/playerStats";
import { Flag } from "./Flag";
import { LiveGlance } from "./LiveGlance";
import { Avatar, LeagueBadge } from "./PlayerBits";
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
      <div className="glance-wrap">
        {match.opponents.length > 1 && (
          <div className="glance-opponents">
            {match.opponents.map((o, i) => (
              <button key={o.profileId} type="button" className={i === opponentIndex ? "tab active" : "tab"} onClick={() => setOpponentIndex(i)}>
                <Flag civ={o.civ} size="sm" /> {o.name}
              </button>
            ))}
          </div>
        )}
        {opponent && <LiveGlance match={match} opponent={opponent} />}
      </div>
    );
  }

  return <Waiting profileId={profileId} profileName={profileName} status={status} onProfileChange={onProfileChange} />;
}

/** Between games: who's linked, the last battle, and a quiet sign that Feudal is watching. */
function Waiting({ profileId, profileName, status, onProfileChange }: Props & { profileId: number }) {
  const [player, setPlayer] = useState<PlayerDetails | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPlayer(appFetch, profileId)
      .then((p) => !cancelled && setPlayer(p))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const solo = player?.modes.rm_solo;
  const last = status.kind === "waiting" ? status.lastMatch : null;
  const name = player?.name ?? profileName ?? `Profile #${profileId}`;

  return (
    <section className="panel waiting banner" style={last ? ({ "--civ": civColor(last.me.civ) } as React.CSSProperties) : undefined}>
      <div className="waiting-hero">
        <div className="radar" aria-hidden="true">
          <span />
          <GiCrossedSwords className="radar-icon" />
        </div>
        <div className="waiting-text">
          <span className="eyebrow">Watching AoE4 World</span>
          <h2>Awaiting your next battle</h2>
          <p className="muted">Your matchup brief opens by itself when a ranked or quick match starts. No clicks needed.</p>
          {status.kind === "error" && <p className="error small">Couldn't reach AoE4 World: {status.message}. Retrying.</p>}
        </div>
      </div>

      <div className="waiting-cards">
        <div className="waiting-card">
          <span className="eyebrow">Linked profile</span>
          <div className="waiting-player">
            <Avatar src={player?.avatars?.medium} name={name} size={48} />
            <div className="waiting-player-text">
              <b>{name}</b>
              <span className="muted small">{solo?.rating ? `${solo.rating} rating${solo.rank ? ` · #${solo.rank}` : ""}` : "Ranked 1v1"}</span>
            </div>
            {solo?.rank_level && <LeagueBadge rankLevel={solo.rank_level} />}
          </div>
          <button type="button" className="link small" onClick={() => onProfileChange(null)}>
            Change profile
          </button>
        </div>

        <div className="waiting-card">
          <span className="eyebrow">Last battle</span>
          {last ? (
            <div className="waiting-last">
              <Flag civ={last.me.civ} size="md" />
              <span className="vs-mini">VS</span>
              {last.opponents.map((o) => (
                <Flag key={o.profileId} civ={o.civ} size="md" />
              ))}
              <div className="waiting-last-text">
                <b>
                  {getCiv(last.me.civ)?.name ?? last.me.civ} vs {last.opponents.map((o) => getCiv(o.civ)?.name ?? o.civ).join(", ")}
                </b>
                <span className="muted small">
                  {last.map} · {timeAgo(last.startedAt)}
                </span>
              </div>
            </div>
          ) : (
            <p className="muted small">No ranked or quick-match game on AoE4 World for this profile yet.</p>
          )}
        </div>
      </div>

      <p className="muted small">Custom and AI games don't show up on AoE4 World. Use Matchups for those.</p>
    </section>
  );
}
