import { useEffect, useRef, useState } from "react";
import { fetchLastGame, type FetchFn, type Match } from "./aoe4world";

export const POLL_INTERVAL_MS = 15_000;

export type LiveStatus =
  | { kind: "idle" }
  | { kind: "waiting"; lastMatch: Match | null }
  | { kind: "in-game"; match: Match }
  | { kind: "error"; message: string };

/** Decides what to show after each poll. Pure, so it can be unit tested. */
export function nextStatus(match: Match | null): LiveStatus {
  if (match?.ongoing) return { kind: "in-game", match };
  return { kind: "waiting", lastMatch: match };
}

/**
 * Polls AoE4 World while the app is open and reports when a game the player
 * is in starts or ends. Pass null to stop polling.
 */
export function useLiveMatch(profileId: number | null, fetchFn: FetchFn): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>({ kind: "idle" });
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  useEffect(() => {
    if (profileId === null) {
      setStatus({ kind: "idle" });
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const match = await fetchLastGame(fetchRef.current, profileId);
        if (!cancelled) setStatus(nextStatus(match));
      } catch (err) {
        if (!cancelled) setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      }
    };
    void poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [profileId]);

  return status;
}
