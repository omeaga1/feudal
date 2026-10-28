import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import pkg from "../../package.json";
import { appFetch } from "../lib/http";
import { checkForUpdate, type Release } from "../lib/updates";

type Phase = "idle" | "installing" | "failed";

const CHECK_EVERY_MS = 30 * 60 * 1000;

/**
 * Keeps Feudal up to date. Checked at startup and every 30 minutes; when a
 * newer release is out, the desktop app downloads and installs it on its own,
 * but only once AoE4 World confirms no game is running (or no profile is
 * linked), then relaunches. If that fails, a link to the release stays.
 */
export function UpdateNotice({ safeToInstall }: { safeToInstall: boolean }) {
  const [release, setRelease] = useState<Release | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      const current = isTauri() ? getVersion() : Promise.resolve(pkg.version);
      void current
        .then((version) => checkForUpdate(appFetch, version))
        .then((r) => !cancelled && r && setRelease(r));
    };
    check();
    // Feudal often stays open between games, so look again now and then.
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!release?.installer || !isTauri() || !safeToInstall || phase !== "idle") return;
    setPhase("installing");
    invoke("install_update", { url: release.installer.url, sha256: release.installer.sha256 }).catch(() => setPhase("failed"));
  }, [release, safeToInstall, phase]);

  if (!release) return null;
  if (phase === "installing") return <span className="update">Updating to {release.version}…</span>;
  return (
    <a className="update" href={release.url} target="_blank" rel="noreferrer">
      Feudal {release.version} is out
    </a>
  );
}
