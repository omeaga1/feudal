// Samples recently finished ranked 1v1 games from the public AoE4 World API
// and adds them to src/data/generated/danger-windows.json: win rate by game
// length for every civ pairing, kept for the newest patches only.
//
// A scheduled GitHub Action runs this every four hours. AoE4 World serves only
// about 20 pages of 50 games and asks bulk readers to filter with `since`, so
// each run reads the ~950 most recently updated games (about 40 minutes of
// ranked 1v1), one request a second, and keeps the finished ones.
// Env: PAGES (default 19), SINCE_HOURS (default 3).
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addGames, emptyStore, prunePatches } from "./danger-windows-lib.mjs";

const API = "https://aoe4world.com/api/v0/games";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "generated", "danger-windows.json");
const PAGES = Number(process.env.PAGES ?? 19);
const SINCE = new Date(Date.now() - Number(process.env.SINCE_HOURS ?? 3) * 3600_000).toISOString();
const DELAY_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getPage(page) {
  const res = await fetch(`${API}?leaderboard=rm_1v1&per_page=50&page=${page}&since=${SINCE}&order=updated_at`, {
    headers: { "User-Agent": "Feudal danger-window sampler (https://github.com/omeaga1/feudal)" },
  });
  // Past the last page AoE4 World allows, it answers 400; keep what we have.
  if (res.status === 400 && page > 1) return [];
  if (!res.ok) throw new Error(`page ${page}: HTTP ${res.status}`);
  return (await res.json()).games ?? [];
}

let store;
try {
  store = JSON.parse(await readFile(OUT, "utf8"));
} catch {
  store = emptyStore();
}

// Pages shift while we read them as new games start, so drop repeats.
const seen = new Map();
for (let page = 1; page <= PAGES; page++) {
  const batch = await getPage(page);
  for (const game of batch) seen.set(game.game_id, game);
  if (batch.length < 50) break;
  await sleep(DELAY_MS);
}
const games = [...seen.values()];
const counted = addGames(store, games);
const newest = games.map((g) => g.updated_at).sort().at(-1);
if (newest && (!store.lastUpdatedAt || newest > store.lastUpdatedAt)) store.lastUpdatedAt = newest;
prunePatches(store);
store.updatedAt = new Date().toISOString();

await writeFile(OUT, JSON.stringify(store) + "\n");
const totals = Object.entries(store.patches).map(([p, e]) => `${p}: ${e.games}`).join(", ");
console.log(`Read ${games.length} games, counted ${counted}. Games per patch: ${totals}`);
