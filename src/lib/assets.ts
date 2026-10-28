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
