import { describe, expect, it } from "vitest";
import type { FetchFn } from "./aoe4world";
import { parseProfileQuery, resolveProfile } from "./profile";

describe("parseProfileQuery", () => {
  it("reads every way a player might identify themselves", () => {
    expect(parseProfileQuery("https://aoe4world.com/players/1270139-Beasty")).toEqual({ kind: "id", id: 1270139 });
    expect(parseProfileQuery("aoe4world.com/players/1270139/games")).toEqual({ kind: "id", id: 1270139 });
    expect(parseProfileQuery(" 1270139 ")).toEqual({ kind: "id", id: 1270139 });
    expect(parseProfileQuery("https://steamcommunity.com/profiles/76561198065651818/")).toEqual({
      kind: "steam",
      steamId: "76561198065651818",
    });
    expect(parseProfileQuery("76561198065651818")).toEqual({ kind: "steam", steamId: "76561198065651818" });
    expect(parseProfileQuery("Beasty")).toEqual({ kind: "name", name: "Beasty" });
    expect(parseProfileQuery("[TAG] Some Player")).toEqual({ kind: "name", name: "[TAG] Some Player" });
  });

  it("rejects blanks and links it can't use", () => {
    expect(parseProfileQuery("   ")).toBeNull();
    expect(parseProfileQuery("https://steamcommunity.com/id/vanityname")).toBeNull();
  });
});

function api(routes: Record<string, unknown>): FetchFn {
  return async (url) => {
    const path = url.replace("https://aoe4world.com/api/v0", "");
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    return key ? new Response(JSON.stringify(routes[key])) : new Response("{}", { status: 404 });
  };
}

describe("resolveProfile", () => {
  const beasty = { profile_id: 1270139, name: "Beasty", last_game_at: "2026-10-21" };

  it("checks a profile number exists", async () => {
    expect(await resolveProfile(api({ "/players/1270139": beasty }), { kind: "id", id: 1270139 })).toEqual({
      kind: "found",
      player: { profileId: 1270139, name: "Beasty", rating: null, lastGameAt: "2026-10-21" },
    });
    expect((await resolveProfile(api({}), { kind: "id", id: 5 })).kind).toBe("none");
  });

  it("finds a profile from a Steam ID", async () => {
    const result = await resolveProfile(api({ "/players/search?query=7656": { players: [beasty] } }), {
      kind: "steam",
      steamId: "76561198065651818",
    });
    expect(result.kind === "found" && result.player.profileId).toBe(1270139);
  });

  it("offers a choice when several players share a name, most recent first", async () => {
    const old = { profile_id: 1, name: "Beasty", last_game_at: "2023-01-01" };
    const result = await resolveProfile(api({ "/players/search?query=Beasty&exact=true": { players: [old, beasty] } }), {
      kind: "name",
      name: "Beasty",
    });
    expect(result.kind).toBe("choose");
    expect(result.kind === "choose" && result.players[0].profileId).toBe(1270139);
  });

  it("falls back to a loose search when no name matches exactly", async () => {
    const result = await resolveProfile(api({
        "/players/search?query=beast&exact=true": { players: [] },
        "/players/search?query=beast": { players: [beasty] },
      }), {
      kind: "name",
      name: "beast",
    });
    expect(result.kind === "found" && result.player.name).toBe("Beasty");
  });
});
