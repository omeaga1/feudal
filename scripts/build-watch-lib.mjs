// Pure helpers for scripts/watch-build-orders.mjs, kept separate so Vitest
// can test them without touching the network.

/** aoe4guides.com civ codes by AoE4 World civ id. */
export const GUIDE_CIV_CODES = {
  abbasid_dynasty: "ABB",
  ayyubids: "AYY",
  byzantines: "BYZ",
  chinese: "CHI",
  delhi_sultanate: "DEL",
  english: "ENG",
  french: "FRE",
  golden_horde: "GOH",
  holy_roman_empire: "HRE",
  house_of_lancaster: "HOL",
  japanese: "JAP",
  jeanne_darc: "JDA",
  jin_dynasty: "JIN",
  knights_templar: "KTE",
  macedonian_dynasty: "MAC",
  malians: "MAL",
  mongols: "MON",
  order_of_the_dragon: "DRA",
  ottomans: "OTT",
  rus: "RUS",
  scots: "SCO",
  sengoku_daimyo: "SEN",
  tughlaq_dynasty: "TUG",
  vikings: "VIK",
  zhu_xis_legacy: "ZXL",
};

/** How many fresh guides to list per civ. */
export const MAX_FRESH = 3;

/** The newest game build the danger-window sampler has seen, or null. */
export function newestBuild(dangerData) {
  const builds = Object.keys(dangerData?.patches ?? {}).map(Number).filter(Number.isFinite);
  return builds.length ? Math.max(...builds) : null;
}

/** "https://www.youtube.com/embed/ID" -> "https://www.youtube.com/watch?v=ID". */
export function watchUrl(video) {
  const m = typeof video === "string" && video.match(/youtube\.com\/embed\/([\w-]+)/);
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : video || undefined;
}

function updatedAt(build) {
  const t = build.timeUpdated ?? build.timeCreated;
  return t?._seconds ? new Date(t._seconds * 1000).toISOString() : null;
}

/**
 * Guides on aoe4guides.com that are newer than the plan and not already among
 * its sources, best scored first.
 */
export function freshGuides(plan, builds) {
  const known = new Set(plan.sources.map((s) => s.url.split("/").pop()));
  return builds
    .filter((b) => !b.isDraft && !known.has(b.id))
    .map((b) => ({ build: b, updated: updatedAt(b) }))
    .filter(({ updated }) => updated && updated.slice(0, 10) > plan.updated)
    .sort((a, b) => (b.build.score ?? 0) - (a.build.score ?? 0))
    .slice(0, MAX_FRESH)
    .map(({ build, updated }) => ({
      title: build.title,
      author: build.author,
      url: `https://aoe4guides.com/builds/${build.id}`,
      ...(watchUrl(build.video) ? { video: watchUrl(build.video) } : {}),
      updated: updated.slice(0, 10),
    }));
}

/**
 * The report the app reads: per civ, whether its plan predates the newest
 * game build, and fresh guides worth a look. `guides` maps civ id to the
 * aoe4guides list for that civ; a missing entry means the fetch failed, so
 * the previous report's guides are kept.
 */
export function buildReport({ plans, latestBuild, guides, previous, now }) {
  const civs = {};
  for (const plan of plans) {
    const fetched = guides[plan.civ];
    civs[plan.civ] = {
      checkedBuild: plan.checkedBuild,
      stale: latestBuild !== null && latestBuild > plan.checkedBuild,
      fresh: fetched ? freshGuides(plan, fetched) : (previous?.civs?.[plan.civ]?.fresh ?? []),
    };
  }
  return { latestBuild, checkedAt: now, civs };
}

/** Markdown for the GitHub issue opened when a new patch makes plans stale. */
export function issueBody(report) {
  const stale = Object.entries(report.civs).filter(([, c]) => c.stale);
  const lines = [
    `Game build ${report.latestBuild} is live and ${stale.length} game plans were last checked on an older build.`,
    "",
    "Review each plan in `src/data/gameplans/` against the patch notes and the newest guides, then bump its `checkedBuild` and `updated`.",
    "",
  ];
  for (const [civ, c] of stale) {
    lines.push(`- [ ] **${civ}** (checked on ${c.checkedBuild})`);
    for (const g of c.fresh) lines.push(`  - [${g.title}](${g.url}) by ${g.author}, ${g.updated}${g.video ? ` ([video](${g.video}))` : ""}`);
  }
  return lines.join("\n") + "\n";
}
