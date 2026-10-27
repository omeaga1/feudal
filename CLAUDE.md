# Feudal

Free Windows companion app for Age of Empires IV. Tauri 2 (Rust shell) + React + TypeScript + Vite. Tests with Vitest.

## Hard rules

- Never read or touch the game: no memory reading, DLL injection, DirectX hooks, packet capture, game file edits, or screen capture/OCR. The owner plays ranked and these are ban risks. Live data comes only from the public AoE4 World API.
- No mid-game interaction features. The app must update itself; the player shouldn't click it during a game.
- Keep the app free, with no ads, and keep the Microsoft "Game Content Usage Rules" notice in the README and app footer.
- Cover every civ and every matchup. Data must track the current patch.

## Commands

- `npm test` runs unit tests; `npx tsc --noEmit` typechecks.
- `npm run data:sync` refreshes `src/data/generated` from aoe4world/data.
- `npm run tauri dev` needs Windows (or Linux with webkit2gtk); CI builds the Windows app.
