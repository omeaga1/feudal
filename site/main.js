// Point the download buttons at the newest installer. If the repo has no
// public release yet (or GitHub's API is unreachable), the buttons keep
// their fallback link to the releases page.
const REPO = "omeaga1/feudal";

async function linkLatestRelease() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return;
  const release = await res.json();
  const assets = release.assets ?? [];
  const installer =
    assets.find((a) => /setup\.exe$/i.test(a.name)) ??
    assets.find((a) => /\.exe$/i.test(a.name)) ??
    assets.find((a) => /\.msi$/i.test(a.name));
  if (!installer) return;

  for (const link of document.querySelectorAll("[data-download]")) {
    link.href = installer.browser_download_url;
  }
  const version = release.tag_name.replace(/^v/, "");
  for (const label of document.querySelectorAll("[data-download-label]")) {
    label.textContent = `Download for Windows (v${version})`;
  }
  const mb = (installer.size / 1024 / 1024).toFixed(1);
  const note = document.querySelector("[data-release-note]");
  if (note) note.textContent = `v${version}, ${mb} MB installer. Windows 10 and 11. Free forever, no ads, no account.`;
}

linkLatestRelease().catch(() => {});
