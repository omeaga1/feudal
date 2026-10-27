import { describe, expect, it } from "vitest";
import type { FetchFn } from "./aoe4world";
import { checkForUpdate, compareVersions } from "./updates";

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

  it("reports only newer releases and stays quiet on errors", async () => {
    const release = { tag_name: "v0.2.0", html_url: "https://github.com/omeaga1/feudal/releases/tag/v0.2.0" };
    expect(await checkForUpdate(reply(200, release), "0.1.0")).toEqual({ version: "0.2.0", url: release.html_url });
    expect(await checkForUpdate(reply(200, release), "0.2.0")).toBeNull();
    expect(await checkForUpdate(reply(404, {}), "0.1.0")).toBeNull();
    expect(await checkForUpdate(async () => Promise.reject(new Error("offline")), "0.1.0")).toBeNull();
  });
});
