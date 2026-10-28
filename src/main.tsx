import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource-variable/inter";
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "./styles.css";

// The desktop webview doesn't open target="_blank" links by itself, so send
// them to the default browser.
if (isTauri()) {
  document.addEventListener("click", (event) => {
    const link = (event.target as HTMLElement).closest?.("a[target=_blank]") as HTMLAnchorElement | null;
    if (!link?.href.startsWith("http")) return;
    event.preventDefault();
    void openUrl(link.href);
  });
}

// Unit and landmark icons load from AoE4 World. A missing one becomes a
// lettered tile instead of a broken image.
document.addEventListener(
  "error",
  (event) => {
    const img = event.target as HTMLImageElement;
    if (img.tagName !== "IMG" || img.dataset.fallback) return;
    img.dataset.fallback = "1";
    const letters = (img.alt || "?")
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    img.src = `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1e222b"/><text x="20" y="25" font-family="sans-serif" font-size="14" font-weight="700" fill="#d9a74a" text-anchor="middle">${letters}</text></svg>`,
    )}`;
  },
  true,
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
