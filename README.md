# Feudal

A free desktop companion for Age of Empires IV. When your ranked or quick-match game starts, Feudal detects both civilizations and opens a matchup brief: when the enemy civ is dangerous, what each of their units is weak to, and what to build from your own roster.

Feudal never touches the game. It doesn't read game memory, game files, network traffic or your screen, so it can't trip anti-cheat or put a ranked account at risk. Everything it knows about a live match comes from the public [AoE4 World API](https://aoe4world.com/api), the same data shown on your loading screen and on public profiles. To find your profile it can read Steam's own list of accounts signed in on your PC, or send you to Steam's sign-in page, which hands Feudal your Steam ID and nothing else.

## Features

| Screen | Status |
| --- | --- |
| **Live match**: sign in through Steam (or pick the Steam account already on your PC, or search your in-game name for Xbox), and the brief opens on its own when a game starts | Working |
| **In-game Live view**: one screen, no scrolling: what counters what, the enemy civ's rush, weak and spike timings, and a villager graph that follows the game clock to show where your count should be now | Working |
| **Stats**: rating, league, ladder rank, rating history, win rate per civ and map, recent games and past seasons, for you or any player you look up | Working |
| **Matchups**: pick any two civs and read the brief outside a game | Working |
| **Counters**: computed from unit stats (bonus damage, armor, HP, cost) with a small override list | Working |
| **Enemy player habits**: their most-played civs, win rate, and how often their games end before 15 minutes | Working |
| **Tempo tag**: "expect early pressure" or "expect a long game", from how long each civ's ranked games last | Working |
| **What to scout for**: the enemy civ's landmark options at each age-up, so one look at their landmark tells you their plan | Working |
| **Civ playbooks**: power spikes, openings and answers for every civ | Drafts for all civs |
| **Danger windows**: your win rate by game length in each matchup, current patch only | Working |
| **Game plans**: a branching timeline for every civ (opening, two Feudal paths, two Castle paths each) with villager splits over time, condensed from pro guides on aoe4guides.com | Working |
| **Civ analysis**: one screen per civ with the full plan tree, signature armies, win conditions and new units per age | Working |
| **Update prompts**: when a new version is out, Feudal tells you and installs it only when you click Update now. It never prompts or restarts during a game | Working |
| **Keys**: a lit-up keyboard of the ~30 hotkeys you use every game, read from your own AoE4 keybind profile (read-only, AoE4 defaults as fallback), plus a counter chart | Working |

## Development

You need [Node.js](https://nodejs.org) 20+ and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for Windows (Rust and the WebView2 runtime, which Windows 10/11 already has).

```bash
npm install
npm run tauri dev     # run the desktop app
npm test              # unit tests
npm run tauri build   # build the Windows installer
```

### Releasing

Bump the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, then push a matching tag (`git tag v0.2.0 && git push origin v0.2.0`). The `Release` workflow builds the installers on Windows and publishes them as a GitHub release, which the website's download button and the app's update notice both pick up. The installer isn't code-signed yet, so Windows SmartScreen asks for confirmation the first time.

`npm run dev` runs the UI in a plain browser. The matchup browser works there, but live calls to AoE4 World may be blocked by the browser's CORS rules. The desktop app sends them through Tauri's HTTP plugin instead.

### Game data

Unit and civilization data lives in `src/data/generated` and comes from [aoe4world/data](https://github.com/aoe4world/data), which is parsed from the game files. After a patch, refresh it with:

```bash
npm run data:sync
```

### Website

The landing page is plain HTML in `site/`, with no build step. Open `site/index.html` in a browser to preview it. Pushes to `main` that touch `site/` deploy it to GitHub Pages through `.github/workflows/pages.yml`. The download buttons look up the newest GitHub release and link straight to its installer.

### Danger windows

`src/data/generated/danger-windows.json` holds win/loss counts by game length for every civ pairing on the newest two patches. The `Danger windows` GitHub Action runs `npm run data:danger` every four hours: it reads the most recently finished ranked 1v1 games from AoE4 World (19 requests, one a second, using the `since` filter AoE4 World asks for) and commits the new counts. The app fetches the latest file from GitHub and falls back to the copy it shipped with.

### Build watch

A daily GitHub Action (`.github/workflows/build-watch.yml`, or `npm run data:watch` locally) compares each plan's `checkedBuild` with the newest game build AoE4 World reports and lists newer, well-scored guides from aoe4guides.com that the plans don't use yet. It commits `src/data/generated/build-watch.json`, which the app reads to flag stale plans and link the new guides, and opens one issue per new patch so the plans get re-checked. YouTube isn't scraped; most aoe4guides builds link their video.

### Project layout

```
src/lib/aoe4world.ts    AoE4 World API client and match parsing
src/lib/liveMatch.ts    polling hook that detects when a game starts
src/lib/counters.ts     counter engine
src/lib/brief.ts        builds the matchup brief for two civs
src/data/playbooks/     one hand-written playbook per civ
src/data/counter-overrides.json   fixes for matchups the math gets wrong
src-tauri/              desktop shell (Rust)
site/                   landing page (static, deployed to GitHub Pages)
```

### Writing a playbook

Add `src/data/playbooks/<civ id>.json`, using the civ ids from `src/data/generated/civs.json`. Copy `holy_roman_empire.json` for the format. Keep `status` as `draft` until someone who plays the matchup has checked it, and set `patch` to the patch it was checked on.

## Using AoE4 World

Feudal polls `/players/{id}/games/last` every 15 seconds while it's open, sends a descriptive User-Agent, and does no bulk crawling, following AoE4 World's API guidance. Thanks to the AoE4 World team for the API and data.

## Legal

Age of Empires IV © Microsoft Corporation. Feudal was created under Microsoft's "[Game Content Usage Rules](https://www.xbox.com/en-US/developers/rules)" using assets from Age of Empires IV, and it is not endorsed by or affiliated with Microsoft.

Feudal is and will stay free. Under those rules it can't be sold or carry ads.

Icons from [game-icons.net](https://game-icons.net) by Lorc, Delapouite and contributors (CC BY 3.0), and [Lucide](https://lucide.dev) (ISC).
