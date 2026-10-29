// Bundled images: civ flags (from AoE4 World) and resource icons (from
// aoe4guides.com), both game assets used under Microsoft's Game Content Usage
// Rules. Bundled so the picker works offline.
import type { Resource } from "./gamePlans";

const flagUrls = import.meta.glob<string>("../assets/flags/*.png", { eager: true, query: "?url", import: "default" });
const resourceUrls = import.meta.glob<string>("../assets/res/*.webp", { eager: true, query: "?url", import: "default" });

function byName(urls: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(urls).map(([path, url]) => [path.replace(/^.*\/([^/]+)\.\w+$/, "$1"), url]));
}

const flags = byName(flagUrls);
const resources = byName(resourceUrls);

export function flagUrl(civId: string): string | undefined {
  return flags.get(civId);
}

export function resourceIcon(resource: Resource | "villager"): string | undefined {
  return resources.get(resource);
}

// Unit and landmark icons, bundled by `npm run data:icons` and keyed by their
// path under data.aoe4world.com/images.
const gameIcons = import.meta.glob<string>("../assets/game/**/*.png", { eager: true, query: "?url", import: "default" });
const GAME_PREFIX = "https://data.aoe4world.com/images/";
const gameIconByPath = new Map(Object.entries(gameIcons).map(([path, url]) => [path.replace(/^.*\/assets\/game\//, ""), url]));

/** The bundled copy of an AoE4 World icon, or the remote URL when it isn't bundled yet. */
export function gameIcon(url: string): string {
  return url.startsWith(GAME_PREFIX) ? (gameIconByPath.get(url.slice(GAME_PREFIX.length)) ?? url) : url;
}
