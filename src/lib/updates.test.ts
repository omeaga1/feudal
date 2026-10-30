import { describe, expect, it } from "vitest";
import type { FetchFn } from "./aoe4world";
import { checkForUpdate, compareVersions, updateStage, type Release } from "./updates";

const reply =
  (status: number, body: unknown): FetchFn =>
  async () =>
    new Response(JSON.stringify(body), { status });

describe("update check", () => {
  it("compares versions numerically", () => {
    expect(compareVersions("v0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
    expect(compareVersions("0.1", "0.1.1")).toBeLessThan(0);
  });

  it("picks the setup installer and its digest", async () => {
    const release = {
      tag_name: "v0.3.0",
      html_url: "https://github.com/omeaga1/feudal/releases/tag/v0.3.0",
      assets: [
        { name: "Feudal_0.3.0_x64_en-US.msi", browser_download_url: "https://example.com/a.msi", digest: "sha256:aa" },
        { name: "Feudal_0.3.0_x64-setup.exe", browser_download_url: "https://example.com/b-setup.exe", digest: "sha256:bb" },
      ],
    };
    expect((await checkForUpdate(reply(200, release), "0.2.0"))?.installer).toEqual({ url: "https://example.com/b-setup.exe", sha256: "sha256:bb" });
    const noDigest = { ...release, assets: [{ ...release.assets[1], digest: null }] };
    expect((await checkForUpdate(reply(200, noDigest), "0.2.0"))?.installer).toBeUndefined();
  });

  it("reports only newer releases and stays quiet on errors", async () => {
    const release = { tag_name: "v0.2.0", html_url: "https://github.com/omeaga1/feudal/releases/tag/v0.2.0" };
    expect(await checkForUpdate(reply(200, release), "0.1.0")).toEqual({ version: "0.2.0", url: release.html_url });
    expect(await checkForUpdate(reply(200, release), "0.2.0")).toBeNull();
    expect(await checkForUpdate(reply(404, {}), "0.1.0")).toBeNull();
    expect(await checkForUpdate(async () => Promise.reject(new Error("offline")), "0.1.0")).toBeNull();
  });
});

describe("update prompt", () => {
  const release: Release = {
    version: "0.6.0",
    url: "https://github.com/omeaga1/feudal/releases/tag/v0.6.0",
    installer: { url: "https://github.com/omeaga1/feudal/releases/download/v0.6.0/Feudal_0.6.0_x64-setup.exe", sha256: "sha256:ab" },
  };
  const idle = { desktop: true, inGame: false, phase: "idle" as const };

  it("shows nothing when up to date", () => {
    expect(updateStage(null, idle).kind).toBe("none");
  });

  it("offers the update instead of installing it", () => {
    expect(updateStage(release, idle).kind).toBe("ready");
  });

  it("holds the offer until the game ends", () => {
    expect(updateStage(release, { ...idle, inGame: true }).kind).toBe("after-game");
  });

  it("falls back to the release page", () => {
    expect(updateStage(release, { ...idle, desktop: false }).kind).toBe("download");
    expect(updateStage(release, { ...idle, phase: "failed" }).kind).toBe("download");
    expect(updateStage({ ...release, installer: undefined }, idle).kind).toBe("download");
  });

  it("shows progress once the player accepts", () => {
    expect(updateStage(release, { ...idle, phase: "installing" }).kind).toBe("installing");
  });
});
