# Feudal

A free desktop companion for Age of Empires IV. When your ranked or quick-match game starts, Feudal detects both civilizations and opens a matchup brief: when the enemy civ is dangerous, what each of their units is weak to, and what to build from your own roster.

Feudal never touches the game. It doesn't read game memory, game files, network traffic or your screen, so it can't trip anti-cheat or put a ranked account at risk. Everything it knows about a live match comes from the public [AoE4 World API](https://aoe4world.com/api), the same data shown on your loading screen and on public profiles.

## Features

| Screen | Status |
| --- | --- |
| **Live match**: link your AoE4 World profile once, and the brief opens on its own when a game starts | Working |
| **Matchups**: pick any two civs and read the brief outside a game | Working |
| **Counters**: computed from unit stats (bonus damage, armor, HP, cost) with a small override list | Working |
| **Civ playbooks**: hand-written power spikes and answers per civ | Format done, HRE draft only |
| **Danger windows**: win rate by game length per matchup, recomputed each patch | Planned |
| **Keybinds**: a glanceable view of your own hotkeys | Planned |

## Development

You need [Node.js](https://nodejs.org) 20+ and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for Windows (Rust and the WebView2 runtime, which Windows 10/11 already has).

```bash
npm install
npm run tauri dev     # run the desktop app
npm test              # unit tests
npm run tauri build   # build the Windows installer
```

`npm run dev` runs the UI in a plain browser. The matchup browser works there, but live calls to AoE4 World may be blocked by the browser's CORS rules. The desktop app sends them through Tauri's HTTP plugin instead.

### Game data

Unit and civilization data lives in `src/data/generated` and comes from [aoe4world/data](https://github.com/aoe4world/data), which is parsed from the game files. After a patch, refresh it with:

```bash
npm run data:sync
```

### Project layout

```
src/lib/aoe4world.ts    AoE4 World API client and match parsing
src/lib/liveMatch.ts    polling hook that detects when a game starts
src/lib/counters.ts     counter engine
src/lib/brief.ts        builds the matchup brief for two civs
src/data/playbooks/     one hand-written playbook per civ
src/data/counter-overrides.json   fixes for matchups the math gets wrong
src-tauri/              desktop shell (Rust)
```

### Writing a playbook

Add `src/data/playbooks/<civ id>.json`, using the civ ids from `src/data/generated/civs.json`. Copy `holy_roman_empire.json` for the format. Keep `status` as `draft` until someone who plays the matchup has checked it, and set `patch` to the patch it was checked on.

## Using AoE4 World

Feudal polls `/players/{id}/games/last` every 15 seconds while it's open, sends a descriptive User-Agent, and does no bulk crawling, following AoE4 World's API guidance. Thanks to the AoE4 World team for the API and data.

## Legal

Age of Empires IV © Microsoft Corporation. Feudal was created under Microsoft's "[Game Content Usage Rules](https://www.xbox.com/en-US/developers/rules)" using assets from Age of Empires IV, and it is not endorsed by or affiliated with Microsoft.

Feudal is and will stay free. Under those rules it can't be sold or carry ads.
