use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::io::Read;
use std::path::PathBuf;
use tauri::Manager;

mod steam;

#[derive(Serialize)]
struct KeybindProfile {
    name: String,
    contents: String,
    /// Last modified time in ms since the epoch; the newest profile is most
    /// likely the one the player has selected in game.
    modified: Option<u64>,
}

/// Decodes a profile file, which may be UTF-8 or UTF-16 with a byte order mark.
fn decode(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&units);
    }
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    String::from_utf8_lossy(bytes).into_owned()
}

/// Every Documents folder AoE4 might save to. The known-folder lookup follows
/// OneDrive and custom redirection; the rest cover PCs where that lookup fails
/// or the game wrote to the un-redirected folder.
fn documents_dirs(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(dir) = app.path().document_dir() {
        dirs.push(dir);
    }
    for var in ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"] {
        if let Some(root) = std::env::var_os(var) {
            dirs.push(PathBuf::from(root).join("Documents"));
        }
    }
    if let Ok(home) = app.path().home_dir() {
        dirs.push(home.join("Documents"));
        dirs.push(home.join("OneDrive").join("Documents"));
    }
    dirs
}

/// Reads the player's AoE4 keybinding profiles so the Keys screen can show
/// them. Read-only, and limited to keyBindingProfiles folders.
#[tauri::command]
fn read_keybind_profiles(app: tauri::AppHandle) -> Result<Vec<KeybindProfile>, String> {
    let mut seen = HashSet::new();
    let mut profiles: Vec<KeybindProfile> = Vec::new();
    for docs in documents_dirs(&app) {
        let dir = docs.join("My Games").join("Age of Empires IV").join("keyBindingProfiles");
        let key = std::fs::canonicalize(&dir).unwrap_or_else(|_| dir.clone());
        if !seen.insert(key) {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let is_rkp = path
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| e.eq_ignore_ascii_case("rkp"));
            if !is_rkp {
                continue;
            }
            let Ok(bytes) = std::fs::read(&path) else {
                continue;
            };
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("profile")
                .to_string();
            let modified = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64);
            // The same profile in two Documents folders: keep the newer copy.
            if let Some(existing) = profiles.iter_mut().find(|p| p.name == name) {
                if modified > existing.modified {
                    *existing = KeybindProfile { name, contents: decode(&bytes), modified };
                }
                continue;
            }
            profiles.push(KeybindProfile { name, contents: decode(&bytes), modified });
        }
    }
    profiles.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(profiles)
}

/// Where Feudal's installers are published. The updater downloads nothing else.
const RELEASE_PREFIX: &str = "https://github.com/omeaga1/feudal/releases/download/";

/// Downloads a release installer and checks it against the SHA-256 digest
/// GitHub lists for the asset.
fn download_installer(url: &str, sha256: &str, dest: &std::path::Path) -> Result<(), String> {
    if !url.starts_with(RELEASE_PREFIX) || !url.ends_with("-setup.exe") {
        return Err("not a Feudal installer".into());
    }
    let mut bytes = Vec::new();
    ureq::get(url)
        .call()
        .map_err(|e| e.to_string())?
        .into_reader()
        .take(200 * 1024 * 1024)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    let digest: String = Sha256::digest(&bytes).iter().map(|b| format!("{b:02x}")).collect();
    if !digest.eq_ignore_ascii_case(sha256.trim_start_matches("sha256:")) {
        return Err("the download didn't match its checksum".into());
    }
    std::fs::write(dest, &bytes).map_err(|e| e.to_string())
}

/// Updates Feudal in place: downloads the new installer, runs it in passive
/// mode (a progress bar, no clicks) with relaunch, and quits so the installer
/// can replace the running files. The front end only calls this when the
/// player clicks Update, and never during a game.
#[tauri::command]
async fn install_update(app: tauri::AppHandle, url: String, sha256: String) -> Result<(), String> {
    let dest = std::env::temp_dir().join("Feudal-update-setup.exe");
    let path = dest.clone();
    tauri::async_runtime::spawn_blocking(move || download_installer(&url, &sha256, &path))
        .await
        .map_err(|e| e.to_string())??;
    std::process::Command::new(&dest)
        .args(["/P", "/R", "/UPDATE"])
        .spawn()
        .map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

// Feudal never touches the game process. Everything it knows about a match
// comes from the public AoE4 World API, fetched through the HTTP plugin. The
// only local files it reads are the player's keybinding profiles and Steam's
// list of accounts signed in on this PC, and the only thing it writes is its
// own update installer, to the temp folder.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_keybind_profiles,
            install_update,
            steam::detect_steam_accounts,
            steam::steam_sign_in
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
