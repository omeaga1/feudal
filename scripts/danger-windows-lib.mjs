// Pure helpers for scripts/sync-danger-windows.mjs, kept separate so Vitest
// can test them without touching the network.

/**
 * Upper edges, in seconds, of the game-length buckets. The last bucket is
 * open-ended: under 10 min, 10-15, 15-20, 20-30, 30-40 and 40+.
 */
export const BUCKET_EDGES = [600, 900, 1200, 1800, 2400];

/** Games shorter than this are mostly disconnects and instant resigns. */
export const MIN_DURATION = 120;

/** How many of the newest patches to keep. Older ones are dropped. */
export const KEEP_PATCHES = 2;

export function emptyStore() {
  return { updatedAt: null, lastUpdatedAt: null, bucketEdges: BUCKET_EDGES, patches: {} };
}

export function bucketOf(duration) {
  const i = BUCKET_EDGES.findIndex((edge) => duration < edge);
  return i === -1 ? BUCKET_EDGES.length : i;
}

function playerOf(entry) {
  return entry && "player" in entry ? entry.player : entry;
}

/**
 * Returns the two players of a finished ranked 1v1 game that is worth
 * counting, or null. Mirrors are skipped: they always come out at 50%.
 */
export function usableGame(game) {
  if (game.kind !== "rm_1v1" || !game.duration || game.duration < MIN_DURATION) return null;
  if (game.teams?.length !== 2 || game.teams.some((t) => t.length !== 1)) return null;
  const [a, b] = game.teams.map((t) => playerOf(t[0]));
  if (!a?.civilization || !b?.civilization || a.civilization === b.civilization) return null;
  const results = [a.result, b.result].sort().join();
  if (results !== "loss,win") return null;
  return [a, b];
}

function addSide(matchups, civ, other, won, bucket) {
  matchups[civ] ??= {};
  const row = (matchups[civ][other] ??= Array(2 * (BUCKET_EDGES.length + 1)).fill(0));
  row[2 * bucket] += won ? 1 : 0;
  row[2 * bucket + 1] += 1;
}

/**
 * Adds games to the store. Each matchup row holds [wins, games] pairs per
 * bucket from the first civ's side, and both sides are recorded.
 * Returns how many games were counted.
 */
export function addGames(store, games) {
  let counted = 0;
  for (const game of games) {
    // Skip games a previous run already saw.
    if (store.lastUpdatedAt && game.updated_at <= store.lastUpdatedAt) continue;
    const players = usableGame(game);
    if (!players) continue;
    const [a, b] = players;
    const patch = String(game.patch);
    const entry = (store.patches[patch] ??= { games: 0, matchups: {} });
    const bucket = bucketOf(game.duration);
    addSide(entry.matchups, a.civilization, b.civilization, a.result === "win", bucket);
    addSide(entry.matchups, b.civilization, a.civilization, b.result === "win", bucket);
    entry.games += 1;
    counted += 1;
  }
  return counted;
}

/** Keeps only the newest patches. */
export function prunePatches(store, keep = KEEP_PATCHES) {
  const newest = Object.keys(store.patches)
    .map(Number)
    .sort((x, y) => y - x)
    .slice(0, keep)
    .map(String);
  store.patches = Object.fromEntries(newest.map((p) => [p, store.patches[p]]));
}
