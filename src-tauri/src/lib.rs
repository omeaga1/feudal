use serde::Serialize;
use tauri::Manager;

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

// Feudal never touches the game process. Everything it knows about a match
// comes from the public AoE4 World API, fetched through the HTTP plugin. The
// only local files it reads are the player's keybinding profiles.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![read_keybind_profiles])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
