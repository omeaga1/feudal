// Checks the game plans in src/data/gameplans against the current patch and
// writes src/data/generated/build-watch.json: which plans predate the newest
// game build, and the newest well-scored guides on aoe4guides.com that the
// plans don't use yet. The app reads the report to flag stale plans and link
// the fresh guides, and the build-watch workflow opens an issue when a new
// patch lands so the plans get re-checked.
//
// The newest build comes from danger-windows.json, which the danger-window
// sampler refreshes from AoE4 World every four hours. aoe4guides allows only
// light use, so this reads one list per civ, two seconds apart.
// Env: ISSUE_BODY (path to write the issue text to when plans are stale).
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport, GUIDE_CIV_CODES, issueBody, newestBuild } from "./build-watch-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLANS = join(ROOT, "src", "data", "gameplans");
const GENERATED = join(ROOT, "src", "data", "generated");
const OUT = join(GENERATED, "build-watch.json");
const API = "https://aoe4-guides-api-7h2vti5ckq-ey.a.run.app/builds";
const DELAY_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

async function guidesFor(code) {
  const res = await fetch(`${API}?civ=${code}&orderBy=score`, {
    headers: { "User-Agent": "Feudal build-order watcher (https://github.com/omeaga1/feudal)" },
  });
  if (!res.ok) throw new Error(`${code}: HTTP ${res.status}`);
  return res.json();
}

const plans = await Promise.all((await readdir(PLANS)).filter((f) => f.endsWith(".json")).map((f) => readJson(join(PLANS, f))));
const latestBuild = newestBuild(await readJson(join(GENERATED, "danger-windows.json")));
let previous = null;
try {
  previous = await readJson(OUT);
} catch {
  // First run.
}

const guides = {};
for (const plan of plans) {
  const code = GUIDE_CIV_CODES[plan.civ];
  if (!code) continue;
  try {
    guides[plan.civ] = await guidesFor(code);
  } catch (err) {
    console.warn(`Skipping ${plan.civ}: ${err.message}`);
  }
  await sleep(DELAY_MS);
}

const report = buildReport({ plans, latestBuild, guides, previous, now: new Date().toISOString() });
// Keep the old timestamp when nothing else changed, so the workflow doesn't commit noise.
if (previous && JSON.stringify({ ...previous, checkedAt: null }) === JSON.stringify({ ...report, checkedAt: null })) {
  report.checkedAt = previous.checkedAt;
}
await writeFile(OUT, JSON.stringify(report, null, 2) + "\n");

const stale = Object.values(report.civs).filter((c) => c.stale).length;
const fresh = Object.values(report.civs).reduce((n, c) => n + c.fresh.length, 0);
console.log(`Build ${latestBuild}: ${stale} stale plans, ${fresh} fresh guides, ${Object.keys(guides).length} civs fetched.`);
if (stale > 0 && process.env.ISSUE_BODY) await writeFile(process.env.ISSUE_BODY, issueBody(report));
