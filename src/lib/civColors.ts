/**
 * Each civ's banner color, taken from its flag and evened out to one
 * brightness so any of them reads on the dark theme. Used to tint the civ's
 * side of the versus banner, its hero header and its highlights.
 */
const CIV_COLORS: Record<string, string> = {
  abbasid_dynasty: "#cfa958",
  ayyubids: "#ddc54a",
  byzantines: "#9b67d6",
  chinese: "#d56b52",
  delhi_sultanate: "#4fc27f",
  english: "#db594c",
  french: "#4aa2dd",
  golden_horde: "#cf5e57",
  holy_roman_empire: "#e6c941",
  house_of_lancaster: "#5f90d6",
  japanese: "#dbbc4c",
  jeanne_darc: "#d9b74e",
  jin_dynasty: "#d65351",
  knights_templar: "#e9524e",
  macedonian_dynasty: "#ce585c",
  malians: "#e9d03e",
  mongols: "#3eabe9",
  order_of_the_dragon: "#e7cf40",
  ottomans: "#58ce76",
  rus: "#d26055",
  sengoku_daimyo: "#ce585a",
  tughlaq_dynasty: "#ce6158",
  zhu_xis_legacy: "#57cecf",
};

export function civColor(civ: string): string {
  return CIV_COLORS[civ] ?? "#d9a74a";
}
