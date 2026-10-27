import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import pkg from "../../package.json";
import { appFetch } from "../lib/http";
import { checkForUpdate, type Release } from "../lib/updates";

/** A small link in the top bar when a newer Feudal release is out. Checked once at startup. */
export function UpdateNotice() {
  const [release, setRelease] = useState<Release | null>(null);

  useEffect(() => {
    let cancelled = false;
    const current = isTauri() ? getVersion() : Promise.resolve(pkg.version);
    void current
      .then((version) => checkForUpdate(appFetch, version))
      .then((r) => !cancelled && setRelease(r));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!release) return null;
  return (
    <a className="update" href={release.url} target="_blank" rel="noreferrer">
      Feudal {release.version} is out
    </a>
  );
}
