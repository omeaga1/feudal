import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
