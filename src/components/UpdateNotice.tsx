import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Clock, Download, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import pkg from "../../package.json";
import { appFetch } from "../lib/http";
import { checkForUpdate, updateStage, type InstallPhase, type Release } from "../lib/updates";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const TOAST_ID = "feudal-update";

/**
 * Tells the player when a new Feudal is out and installs it only when they
 * click Update. Checked at startup and every 30 minutes. A toast offers the
 * update once per version, outside games only, and the rail keeps an Update
 * button until they take it. During a game the offer waits, so nothing pops
 * up or relaunches mid-match. If installing fails, a link to the release stays.
 */
export function UpdateNotice({ safeToInstall }: { safeToInstall: boolean }) {
  const [release, setRelease] = useState<Release | null>(null);
  const [phase, setPhase] = useState<InstallPhase>("idle");
  const offered = useRef<string | null>(null);

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

  const stage = updateStage(release, { desktop: isTauri(), inGame: !safeToInstall, phase });

  const install = (r: Release) => {
    if (!r.installer) return;
    toast.dismiss(TOAST_ID);
    setPhase("installing");
    invoke("install_update", { url: r.installer.url, sha256: r.installer.sha256 }).catch(() => {
      setPhase("failed");
      toast.error(`Couldn't install Feudal ${r.version}`, { description: "Download it from the release page instead." });
    });
  };

  useEffect(() => {
    if (stage.kind !== "ready") {
      // A game started: take the offer off screen and make it again after.
      if (stage.kind === "after-game" && offered.current) {
        toast.dismiss(TOAST_ID);
        offered.current = null;
      }
      return;
    }
    const r = stage.release;
    if (offered.current === r.version) return;
    offered.current = r.version;
    toast(`Feudal ${r.version} is available`, {
      id: TOAST_ID,
      description: "Update now? Feudal restarts in a few seconds.",
      duration: Infinity,
      action: { label: "Update now", onClick: () => install(r) },
      cancel: { label: "Later", onClick: () => toast.dismiss(TOAST_ID) },
    });
  }, [stage.kind, release]);

  switch (stage.kind) {
    case "none":
      return null;
    case "installing":
      return (
        <span className="update">
          <RefreshCw className="spin" size={16} aria-hidden="true" />
          Updating to {stage.release.version}
        </span>
      );
    case "ready":
      return (
        <button className="update update-ready" type="button" onClick={() => install(stage.release)} title={`Install Feudal ${stage.release.version}`}>
          <Download size={16} aria-hidden="true" />
          Update to {stage.release.version}
        </button>
      );
    case "after-game":
      return (
        <span className="update update-wait" title="You can update once this game ends">
          <Clock size={16} aria-hidden="true" />
          {stage.release.version} after this game
        </span>
      );
    case "download":
      return (
        <a className="update" href={stage.release.url} target="_blank" rel="noreferrer">
          <Download size={16} aria-hidden="true" />
          {stage.release.version} is out
        </a>
      );
  }
}
