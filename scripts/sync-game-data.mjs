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
const technologies = await getJson("technologies/all.json");
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
    buildTime: b.costs?.time ?? 0,
    icon: b.icon,
  });
}

// What the build playback needs to follow the game's production rules: how
// long each civ's Town Center takes per villager, and how long a new Town
// Center takes to build. Golden Horde recruits in batches, which the data
// doesn't carry, so its batch size of two is set here. Nor does it carry the
// starting villagers: six for most civs, five for the civs below, as every
// pro build order for them opens (Jin's three are Mounted Villagers).
const BATCH = { gol: 2 };
const START = { gol: 5, od: 5, zx: 5, jin: 3 };
const economy = {};
function townCenterAgeUps(abbr) {
  const ups = {};
  for (const t of technologies.data) {
    if (!t.civs.includes(abbr) || !t.classes?.includes("age_up_upgrade") || !t.producedBy?.includes("town-center")) continue;
    ups[t.age + 1] = Math.max(ups[t.age + 1] ?? 0, t.costs.time);
  }
  return Object.keys(ups).length ? { townCenterAgeUp: ups } : {};
}
for (const civ of civs) {
  const villager = units.data.find((u) => u.id === "villager-1" && u.civs.includes(civ.abbr)) ?? units.data.find((u) => u.baseId === "gilded-villager" && u.civs.includes(civ.abbr));
  const tc = buildings.data.find((b) => b.baseId === "town-center" && b.civs.includes(civ.abbr));
  if (!villager || !tc) throw new Error(`No villager or Town Center for ${civ.abbr}`);
  // Jin train Mounted Villagers up to a build limit, then regular ones.
  const mounted = units.data.find((u) => u.id === "mounted-villager-1" && u.civs.includes(civ.abbr));
  const limit = Number(mounted?.description.match(/build limit of (\d+)/i)?.[1]);
  economy[civ.abbr] = {
    villager: villager.baseId,
    trainTime: villager.costs.time,
    batch: BATCH[civ.abbr] ?? 1,
    food: villager.costs.food,
    speed: villager.movement?.speed ?? 1.125,
    start: START[civ.abbr] ?? 6,
    ...(mounted && limit ? { limited: { name: mounted.name, trainTime: mounted.costs.time, limit } } : {}),
    townCenterBuildTime: tc.costs.time,
    // Knights Templar research their age-ups at the Town Center, which
    // stops villagers for that long. Seconds, by the age reached.
    ...townCenterAgeUps(civ.abbr),
    // Landmarks that train villagers too, like the English King's Palace,
    // and how much faster they train them ("+200% faster" is 3x).
    villagerLandmarks: (villager.producedBy ?? [])
      .filter((id) => id !== "capital-town-center")
      .map((id) => buildings.data.find((b) => b.baseId === id && b.civs.includes(civ.abbr) && b.classes?.includes("landmark")))
      .filter(Boolean)
      .map((b) => ({ name: b.name, speed: 1 + Number(b.description.match(/villagers \+(\d+)% faster/i)?.[1] ?? 0) / 100 })),
  };
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
await writeFile(join(OUT_DIR, "economy.json"), JSON.stringify(economy, null, 2) + "\n");
await writeFile(join(OUT_DIR, "civs.json"), JSON.stringify(civs, null, 2) + "\n");
await writeFile(
  join(OUT_DIR, "meta.json"),
  JSON.stringify({ source: SOURCE, dataVersion: units.__version__, syncedAt: new Date().toISOString() }, null, 2) + "\n",
);
console.log(
  `Wrote ${military.length} military units, ${landmarks.length} landmarks and ${civs.length} civilizations to ${OUT_DIR}`,
);
