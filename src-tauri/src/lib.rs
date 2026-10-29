use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::Read;
use tauri::Manager;

mod steam;

#[derive(Serialize)]
struct KeybindProfile {
    name: String,
    contents: String,
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

/// Reads the player's AoE4 keybinding profiles so the Keybinds screen can show
/// them. Read-only, and limited to the keyBindingProfiles folder.
#[tauri::command]
fn read_keybind_profiles(app: tauri::AppHandle) -> Result<Vec<KeybindProfile>, String> {
    let dir = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?
        .join("My Games")
        .join("Age of Empires IV")
        .join("keyBindingProfiles");
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };
    let mut profiles = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let is_rkp = path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("rkp"));
        if !is_rkp {
            continue;
        }
        if let Ok(bytes) = std::fs::read(&path) {
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("profile")
                .to_string();
            profiles.push(KeybindProfile { name, contents: decode(&bytes) });
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
/// can replace the running files. The front end only calls this outside games.
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
