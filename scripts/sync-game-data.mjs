// Downloads unit and civilization data from aoe4world/data and writes a
// trimmed copy into src/data/generated. Run with `npm run data:sync` after a
// game patch. The data is parsed from game files by AoE4 World and is used
// under Microsoft's Game Content Usage Rules.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "https://raw.githubusercontent.com/aoe4world/data/main";
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "generated");

async function getJson(path) {
  const res = await fetch(`${SOURCE}/${path}`, {
    headers: { "User-Agent": "Feudal data sync (https://github.com/omeaga1/feudal)" },
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

function trimWeapon(w) {
  return {
    name: w.name,
    type: w.type,
    damage: w.damage,
    speed: w.speed,
    range: w.range?.max ?? 0,
    modifiers: (w.modifiers ?? []).map((m) => ({
      property: m.property,
      target: m.target?.class ?? [],
      value: m.value,
    })),
  };
}

function trimUnit(u) {
  return {
    id: u.id,
    baseId: u.baseId,
    name: u.name,
    age: u.age,
    civs: u.civs,
    unique: u.unique,
    classes: u.classes,
    displayClasses: u.displayClasses,
    costs: u.costs,
    hitpoints: u.hitpoints,
    weapons: (u.weapons ?? []).map(trimWeapon),
    armor: u.armor ?? [],
    producedBy: u.producedBy ?? [],
    icon: u.icon,
  };
}

const units = await getJson("units/all.json");
const buildings = await getJson("buildings/all.json");
const index = await getJson("civilizations/civs-index.json");

const civs = [];
for (const entry of Object.values(index)) {
  const civ = await getJson(`civilizations/${entry.slug}.json`);
  civs.push({
    id: entry.id,
    abbr: entry.abbr,
    name: entry.name,
    expansion: entry.expansion,
    classes: civ.classes,
    description: civ.description,
    bonuses: civ.overview?.find((o) => o.title === "Civilization Bonuses")?.list ?? [],
  });
}
civs.sort((a, b) => a.name.localeCompare(b.name));

const military = units.data.filter((u) => u.type === "unit" && u.classes.includes("military"));

// Age-up landmarks carry a class like "age2_landmark1": the landmark a civ
// builds in that age to advance to the next one. Seeing which one an
// opponent builds tells you their plan.
const landmarks = [];
for (const b of buildings.data) {
  const tag = b.classes?.map((c) => c.match(/^age([123])_landmark\d$/)).find(Boolean);
  if (!tag) continue;
  landmarks.push({
    id: b.id,
    name: b.name,
    civs: b.civs,
    builtInAge: Number(tag[1]),
    description: b.description,
    icon: b.icon,
  });
}

// A few units are listed from the Dark Age but only come from a later
// landmark (Vikings' Skåne Crossbowmen from the Imperial Rikets Nyckel
// Castle). Move them to the age the landmark is first available in.
const landmarkAge = new Map(
  buildings.data.flatMap((b) => {
    const l = landmarks.find((x) => x.id === b.id);
    return l ? [[b.baseId, l.builtInAge + 1]] : [];
  }),
);
for (const u of military) {
  const producers = u.producedBy ?? [];
  if (producers.length === 0) continue;
  const earliest = Math.min(...producers.map((p) => landmarkAge.get(p) ?? 1));
  if (earliest > u.age) u.age = earliest;
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, "landmarks.json"), JSON.stringify(landmarks, null, 2) + "\n");
await writeFile(join(OUT_DIR, "units.json"), JSON.stringify(military.map(trimUnit)) + "\n");
await writeFile(join(OUT_DIR, "civs.json"), JSON.stringify(civs, null, 2) + "\n");
await writeFile(
  join(OUT_DIR, "meta.json"),
  JSON.stringify({ source: SOURCE, dataVersion: units.__version__, syncedAt: new Date().toISOString() }, null, 2) + "\n",
);
console.log(
  `Wrote ${military.length} military units, ${landmarks.length} landmarks and ${civs.length} civilizations to ${OUT_DIR}`,
);
