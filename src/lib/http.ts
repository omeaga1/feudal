import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { FetchFn } from "./aoe4world";

/**
 * In the desktop app, requests go through Tauri's HTTP plugin so they are not
 * subject to browser CORS rules. In a plain browser (npm run dev) we fall back
 * to window.fetch.
 */
export const appFetch: FetchFn = (url, init) => (isTauri() ? tauriFetch(url, init) : window.fetch(url, init));
