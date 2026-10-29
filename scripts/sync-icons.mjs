// Downloads the unit and landmark icons that src/data/generated names into
// src/assets/game, so they load offline and inside sandboxed previews. Run
// with `npm run data:icons` after `npm run data:sync`. The icons are game
// assets from AoE4 World, used under Microsoft's Game Content Usage Rules.
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "assets", "game");
const PREFIX = "https://data.aoe4world.com/images/";

const read = async (f) => JSON.parse(await readFile(join(ROOT, "src", "data", "generated", f), "utf8"));
const urls = new Set([...(await read("units.json")), ...(await read("landmarks.json"))].map((x) => x.icon).filter((u) => u?.startsWith(PREFIX)));

let fetched = 0;
for (const url of urls) {
  const file = join(OUT, url.slice(PREFIX.length));
  try {
    await access(file);
    continue;
  } catch {
    // Not downloaded yet.
  }
  const res = await fetch(url, { headers: { "User-Agent": "Feudal icon sync (https://github.com/omeaga1/feudal)" } });
  if (!res.ok) {
    console.warn(`${url}: HTTP ${res.status}`);
    continue;
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  fetched++;
}
console.log(`${urls.size} icons, ${fetched} downloaded`);
