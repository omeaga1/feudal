import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Clock, Download, RefreshCw, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import pkg from "../../package.json";
import { appFetch } from "../lib/http";
import { checkLatest, updateStage, type InstallPhase, type Release } from "../lib/updates";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const TOAST_ID = "feudal-update";

/**
 * Tells the player when a new Feudal is out and installs it only when they
 * click Update. Checked at startup and every 30 minutes. A toast offers the
 * update once per version, outside games only, and the rail keeps an Update
 * button until they take it. During a game the offer waits, so nothing pops
 * up or relaunches mid-match. If installing fails, a link to the release stays.
 * Below it, the running version and a "Check for updates" button.
 */
export function UpdateNotice({ safeToInstall }: { safeToInstall: boolean }) {
  const [release, setRelease] = useState<Release | null>(null);
  const [phase, setPhase] = useState<InstallPhase>("idle");
  const offered = useRef<string | null>(null);

  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const current = isTauri() ? getVersion() : Promise.resolve(pkg.version);
    const check = () =>
      void current
        .then((v) => checkLatest(appFetch, v))
        .then((r) => !cancelled && r.kind === "update" && setRelease(r.release));
    void current.then((v) => !cancelled && setVersion(v));
    check();
    // Feudal often stays open between games, so look again now and then.
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const checkNow = async () => {
    if (!version || checking) return;
    setChecking(true);
    const result = await checkLatest(appFetch, version);
    setChecking(false);
    if (result.kind === "error") {
      toast.error("Couldn't check for updates", { description: "GitHub didn't answer. Try again in a minute." });
    } else if (result.kind === "current") {
      toast.success(`You're up to date`, { description: `Feudal ${version} is the latest version.` });
    } else {
      // Offer it again even if the player waved off the toast earlier.
      offered.current = null;
      setRelease({ ...result.release });
    }
  };

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

  return (
    <div className="update-area">
      {notice()}
      <div className="update-meta">
        {version && <span className="app-version">v{version}</span>}
        {stage.kind === "none" && (
          <button className="update-check" type="button" onClick={() => void checkNow()} disabled={!version || checking}>
            <RotateCw className={checking ? "spin" : undefined} size={12} aria-hidden="true" />
            {checking ? "Checking…" : "Check for updates"}
          </button>
        )}
      </div>
    </div>
  );

  function notice() {
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
}
