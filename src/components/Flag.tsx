import { flagUrl } from "../lib/assets";
import { getCiv } from "../lib/gameData";

/** A civ's flag, with its short name as a fallback. */
export function Flag({ civ, size = "md" }: { civ: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const url = flagUrl(civ);
  const name = getCiv(civ)?.name ?? civ;
  if (!url) return <span className={`flag flag-${size} flag-missing`}>{name.slice(0, 2)}</span>;
  return <img className={`flag flag-${size}`} src={url} alt={name} draggable={false} />;
}
