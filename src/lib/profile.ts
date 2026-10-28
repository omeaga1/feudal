import { API_BASE, USER_AGENT, type FetchFn } from "./aoe4world";

export type ProfileQuery =
  | { kind: "id"; id: number }
  | { kind: "steam"; steamId: string }
  | { kind: "name"; name: string };

const STEAM_ID = /^7656\d{13}$/;

/**
 * Works out what the player pasted: an aoe4world.com profile link or its
 * number, a Steam profile link or Steam ID, or an in-game name.
 */
export function parseProfileQuery(input: string): ProfileQuery | null {
  const text = input.trim();
  if (text === "") return null;
  // A Steam ID anywhere in the text (a Steam link, an aoe4world.com link
  // built from one, or the bare number) is looked up by Steam account.
  const steamId = text.match(/(?<!\d)(7656\d{13})(?!\d)/);
  if (steamId) return { kind: "steam", steamId: steamId[1] };
  const aoe4World = text.match(/aoe4world\.com\/players\/(\d+)/) ?? text.match(/players\/(\d+)/);
  if (aoe4World) return { kind: "id", id: Number(aoe4World[1]) };
  if (/^\d+$/.test(text)) return { kind: "id", id: Number(text) };
  // A pasted link we don't recognise (a vanity Steam URL, say) isn't a name.
  if (/^https?:\/\//i.test(text) || /\.(com|net|gg|io)\//i.test(text)) return null;
  return { kind: "name", name: text };
}

/** Kept for callers that only need a profile number. */
export function parseProfileInput(input: string): number | null {
  const q = parseProfileQuery(input);
  return q?.kind === "id" ? q.id : null;
}

export interface FoundPlayer {
  profileId: number;
  name: string;
  rating?: number | null;
  lastGameAt?: string | null;
}

interface ApiPlayer {
  profile_id: number;
  name: string;
  rating?: number | null;
  last_game_at?: string | null;
  steam_id?: string | null;
}

async function get(fetchFn: FetchFn, path: string): Promise<Response> {
  return fetchFn(`${API_BASE}${path}`, { headers: { "User-Agent": USER_AGENT } });
}

function toFound(p: ApiPlayer): FoundPlayer {
  return { profileId: p.profile_id, name: p.name, rating: p.rating ?? null, lastGameAt: p.last_game_at ?? null };
}

async function search(fetchFn: FetchFn, query: string, exact: boolean): Promise<FoundPlayer[]> {
  const res = await get(fetchFn, `/players/search?query=${encodeURIComponent(query)}${exact ? "&exact=true" : ""}`);
  if (!res.ok) throw new Error(`AoE4 World search failed (HTTP ${res.status})`);
  const body = (await res.json()) as { players?: ApiPlayer[] };
  return (body.players ?? []).map(toFound);
}

export type ResolveResult =
  | { kind: "found"; player: FoundPlayer }
  | { kind: "choose"; players: FoundPlayer[] }
  | { kind: "none"; message: string };

/**
 * Turns whatever the player pasted into an AoE4 World profile, checking with
 * AoE4 World that it exists. Names with several matches come back as a list
 * to pick from, most recently active first.
 */
export async function resolveProfile(fetchFn: FetchFn, query: ProfileQuery): Promise<ResolveResult> {
  if (query.kind === "id") {
    const res = await get(fetchFn, `/players/${query.id}`);
    if (res.status === 404) return { kind: "none", message: `AoE4 World has no player with profile number ${query.id}.` };
    if (!res.ok) throw new Error(`AoE4 World returned HTTP ${res.status}`);
    return { kind: "found", player: toFound((await res.json()) as ApiPlayer) };
  }
  if (query.kind === "steam") {
    const players = await search(fetchFn, query.steamId, false);
    if (players.length === 0) {
      return {
        kind: "none",
        message: `AoE4 World doesn't know Steam account ${query.steamId}. It may not be the account you play on, or you may play through Xbox. Try typing your in-game name instead.`,
      };
    }
    return { kind: "found", player: players[0] };
  }
  let players = await search(fetchFn, query.name, true);
  if (players.length === 0) players = await search(fetchFn, query.name, false);
  if (players.length === 0) return { kind: "none", message: `No AoE4 World player is called "${query.name}".` };
  if (players.length === 1) return { kind: "found", player: players[0] };
  const recent = [...players].sort((a, b) => (b.lastGameAt ?? "").localeCompare(a.lastGameAt ?? ""));
  return { kind: "choose", players: recent.slice(0, 8) };
}

const STORAGE_KEY = "feudal.profileId";
const NAME_KEY = "feudal.profileName";

export function loadProfileId(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? "";
    // Version 0.1.0 accepted a bare Steam ID as a profile number, which never
    // matched a game. Drop it so the player links again.
    if (STEAM_ID.test(raw)) return null;
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function loadProfileName(): string | null {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

export function saveProfileId(id: number | null, name?: string): void {
  try {
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(NAME_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, String(id));
      if (name) localStorage.setItem(NAME_KEY, name);
    }
  } catch {
    // Not persisted; still works for this session.
  }
}
