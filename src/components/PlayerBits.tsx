import { GiBorderedShield } from "react-icons/gi";
import { parseLeague, ROMAN } from "../lib/playerStats";
import type { FoundPlayer } from "../lib/profile";
import { Tip } from "./ui";

/** The player's ladder league as a colored shield: Conqueror III, Gold I, ... */
export function LeagueBadge({ rankLevel, size = "sm" }: { rankLevel?: string | null; size?: "sm" | "lg" }) {
  const league = parseLeague(rankLevel);
  const label = league.tier ? `${league.name} ${ROMAN[league.tier]}` : league.name;
  return (
    <Tip label={label}>
      <span className={`league league-${league.league} ${size}`}>
        <GiBorderedShield aria-hidden="true" />
        {size === "lg" && <span className="league-name">{label}</span>}
      </span>
    </Tip>
  );
}

export function Avatar({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) {
  return src ? (
    <img className="avatar" src={src} alt="" width={size} height={size} />
  ) : (
    <span className="avatar avatar-blank" style={{ width: size, height: size }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Avatar, name, country and rating on one line: how a player shows up in lists. */
export function PlayerLine({ player }: { player: FoundPlayer }) {
  return (
    <span className="player-line">
      <Avatar src={player.avatar} name={player.name} size={36} />
      <span className="player-line-text">
        <span className="player-line-name">{player.name}</span>
        <span className="player-line-meta">
          {player.country && <span className="country">{player.country.toUpperCase()}</span>}
          {player.rating ? `${player.rating} rating` : "Unrated"}
        </span>
      </span>
      {player.rankLevel && <LeagueBadge rankLevel={player.rankLevel} />}
    </span>
  );
}
