import { invoke, isTauri } from "@tauri-apps/api/core";

/** A Steam account that has signed in on this PC, from Steam's own account list. */
export interface SteamAccount {
  steamId: string;
  personaName: string;
  mostRecent: boolean;
}

/** Steam accounts on this PC, most recent first. Empty outside the desktop app. */
export async function detectSteamAccounts(): Promise<SteamAccount[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<SteamAccount[]>("detect_steam_accounts");
  } catch {
    return [];
  }
}

/** Steam sign-in needs the desktop app, which hosts the return page. */
export const canSignInWithSteam = () => isTauri();

/** Opens Steam's sign-in page in the browser and resolves with the Steam ID once the player signs in. */
export function signInWithSteam(): Promise<string> {
  return invoke<string>("steam_sign_in");
}
