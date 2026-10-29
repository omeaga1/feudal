//! Finding the player's Steam account, so they never paste a profile link.
//!
//! Two ways, both outside the game: Steam's own list of accounts that have
//! signed in on this PC (`config/loginusers.vdf`, read-only), and "Sign in
//! through Steam" (Steam's public OpenID login in the player's browser, which
//! hands back only the Steam ID; Feudal never sees a password).

use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};

const OPENID: &str = "https://steamcommunity.com/openid/login";
const CLAIMED_ID_PREFIX: &str = "https://steamcommunity.com/openid/id/";
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SteamAccount {
    pub steam_id: String,
    pub persona_name: String,
    pub most_recent: bool,
}

fn is_steam_id(s: &str) -> bool {
    s.len() == 17 && s.starts_with("7656") && s.bytes().all(|b| b.is_ascii_digit())
}

/// Pulls the quoted tokens out of a VDF file: `"key" "value"`, `"key" {`.
fn vdf_tokens(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                let mut s = String::new();
                while let Some(c) = chars.next() {
                    match c {
                        '\\' => {
                            if let Some(n) = chars.next() {
                                s.push(n);
                            }
                        }
                        '"' => break,
                        _ => s.push(c),
                    }
                }
                tokens.push(s);
            }
            '{' | '}' => tokens.push(c.to_string()),
            _ => {}
        }
    }
    tokens
}

/// Reads Steam's `loginusers.vdf`: one block per account, keyed by Steam ID.
pub fn parse_login_users(text: &str) -> Vec<SteamAccount> {
    let tokens = vdf_tokens(text);
    let mut accounts = Vec::new();
    let mut i = 0;
    while i + 1 < tokens.len() {
        if is_steam_id(&tokens[i]) && tokens[i + 1] == "{" {
            let steam_id = tokens[i].clone();
            let mut fields = HashMap::new();
            i += 2;
            while i < tokens.len() && tokens[i] != "}" {
                if i + 1 < tokens.len() && tokens[i + 1] != "{" && tokens[i + 1] != "}" {
                    fields.insert(tokens[i].to_ascii_lowercase(), tokens[i + 1].clone());
                    i += 2;
                } else {
                    i += 1;
                }
            }
            accounts.push(SteamAccount {
                steam_id,
                persona_name: fields.get("personaname").cloned().unwrap_or_default(),
                most_recent: fields.get("mostrecent").is_some_and(|v| v == "1"),
            });
        }
        i += 1;
    }
    accounts.sort_by_key(|a| !a.most_recent);
    accounts
}

#[cfg(windows)]
fn steam_dirs() -> Vec<std::path::PathBuf> {
    use winreg::enums::HKEY_CURRENT_USER;
    let mut dirs = Vec::new();
    if let Ok(key) = winreg::RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Valve\\Steam") {
        if let Ok(path) = key.get_value::<String, _>("SteamPath") {
            dirs.push(path.into());
        }
    }
    dirs.push("C:\\Program Files (x86)\\Steam".into());
    dirs
}

#[cfg(not(windows))]
fn steam_dirs() -> Vec<std::path::PathBuf> {
    let home = std::env::var("HOME").unwrap_or_default();
    vec![format!("{home}/.steam/steam").into(), format!("{home}/.local/share/Steam").into()]
}

/// The Steam accounts that have signed in on this PC, most recent first.
#[tauri::command]
pub fn detect_steam_accounts() -> Vec<SteamAccount> {
    for dir in steam_dirs() {
        if let Ok(text) = std::fs::read_to_string(dir.join("config").join("loginusers.vdf")) {
            let accounts = parse_login_users(&text);
            if !accounts.is_empty() {
                return accounts;
            }
        }
    }
    Vec::new()
}

fn percent_encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let hex = bytes.get(i + 1..i + 3).and_then(|h| std::str::from_utf8(h).ok()).and_then(|h| u8::from_str_radix(h, 16).ok());
        match (bytes[i], hex) {
            (b'+', _) => out.push(b' '),
            (b'%', Some(v)) => {
                out.push(v);
                i += 2;
            }
            (b, _) => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Steam's login page, set to send the player back to `return_to`.
pub fn login_url(return_to: &str) -> String {
    let realm = return_to.split('/').take(3).collect::<Vec<_>>().join("/");
    let params = [
        ("openid.ns", "http://specs.openid.net/auth/2.0"),
        ("openid.mode", "checkid_setup"),
        ("openid.return_to", return_to),
        ("openid.realm", &realm),
        ("openid.identity", "http://specs.openid.net/auth/2.0/identifier_select"),
        ("openid.claimed_id", "http://specs.openid.net/auth/2.0/identifier_select"),
    ];
    let query: Vec<String> = params.iter().map(|(k, v)| format!("{k}={}", percent_encode(v))).collect();
    format!("{OPENID}?{}", query.join("&"))
}

/// The query parameters from an HTTP request line like `GET /steam?a=b HTTP/1.1`.
pub fn request_params(request_line: &str) -> Option<(String, HashMap<String, String>)> {
    let target = request_line.split_whitespace().nth(1)?;
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    let params = query
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .map(|(k, v)| (percent_decode(k), percent_decode(v)))
        .collect();
    Some((path.to_string(), params))
}

/// The Steam ID that Steam's reply claims, if the reply is for our sign-in.
pub fn claimed_steam_id(params: &HashMap<String, String>, return_to: &str) -> Option<String> {
    if params.get("openid.mode")? != "id_res" || !params.get("openid.return_to")?.starts_with(return_to) {
        return None;
    }
    let id = params.get("openid.claimed_id")?.strip_prefix(CLAIMED_ID_PREFIX)?;
    is_steam_id(id).then(|| id.to_string())
}

/// Asks Steam to confirm that it signed the reply, so a forged one is refused.
fn confirm_with_steam(params: &HashMap<String, String>) -> Result<bool, String> {
    let mut form: Vec<(&str, &str)> = params
        .iter()
        .filter(|(k, _)| k.starts_with("openid.") && k.as_str() != "openid.mode")
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    form.push(("openid.mode", "check_authentication"));
    let body = ureq::post(OPENID)
        .timeout(Duration::from_secs(15))
        .send_form(&form)
        .map_err(|e| e.to_string())?
        .into_string()
        .map_err(|e| e.to_string())?;
    Ok(body.lines().any(|l| l.trim() == "is_valid:true"))
}

fn reply(mut stream: &TcpStream, ok: bool) {
    let (title, text) = if ok {
        ("Signed in", "You're signed in to Feudal. You can close this tab.")
    } else {
        ("Sign-in failed", "Steam didn't confirm the sign-in. Close this tab and try again in Feudal.")
    };
    let html = format!(
        "<!doctype html><meta charset=utf-8><title>{title}</title><body style=\"background:#0d0f13;color:#ece6d8;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0\"><div><h1 style=\"font-weight:700\">{title}</h1><p>{text}</p></div>"
    );
    let _ = write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}",
        html.len()
    );
}

/// Waits on 127.0.0.1 for Steam to send the browser back, then confirms it.
fn wait_for_steam(listener: TcpListener, return_to: &str) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + SIGN_IN_TIMEOUT;
    while Instant::now() < deadline {
        let (stream, _) = match listener.accept() {
            Ok(conn) => conn,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(150));
                continue;
            }
            Err(e) => return Err(e.to_string()),
        };
        stream.set_nonblocking(false).map_err(|e| e.to_string())?;
        stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
        let mut line = String::new();
        if BufReader::new(&stream).read_line(&mut line).is_err() {
            continue;
        }
        let Some((path, params)) = request_params(&line) else { continue };
        if path != "/steam" {
            // The browser also asks for /favicon.ico and the like.
            let _ = stream.shutdown(std::net::Shutdown::Both);
            continue;
        }
        let result = match claimed_steam_id(&params, return_to) {
            Some(id) if confirm_with_steam(&params)? => Ok(id),
            _ => Err("Steam didn't confirm the sign-in".to_string()),
        };
        reply(&stream, result.is_ok());
        return result;
    }
    Err("Sign-in timed out".into())
}

/// Opens Steam's sign-in page in the player's browser and returns their
/// Steam ID once they sign in there.
#[tauri::command]
pub async fn steam_sign_in(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_opener::OpenerExt;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let return_to = format!("http://127.0.0.1:{port}/steam");
    app.opener()
        .open_url(login_url(&return_to), None::<&str>)
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || wait_for_steam(listener, &return_to))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    const VDF: &str = r#""users"
{
	"76561198000000001"
	{
		"AccountName"		"vinny_alt"
		"PersonaName"		"Old Alt"
		"MostRecent"		"0"
	}
	"76561198000000002"
	{
		"AccountName"		"vinny"
		"PersonaName"		"Vinny \"V\""
		"RememberPassword"		"1"
		"MostRecent"		"1"
	}
}"#;

    #[test]
    fn reads_accounts_most_recent_first() {
        let accounts = parse_login_users(VDF);
        assert_eq!(accounts.len(), 2);
        assert_eq!(accounts[0].steam_id, "76561198000000002");
        assert_eq!(accounts[0].persona_name, "Vinny \"V\"");
        assert!(accounts[0].most_recent);
        assert_eq!(accounts[1].persona_name, "Old Alt");
    }

    #[test]
    fn builds_a_login_url_for_the_loopback_return() {
        let url = login_url("http://127.0.0.1:5555/steam");
        assert!(url.starts_with(OPENID));
        assert!(url.contains("openid.return_to=http%3A%2F%2F127.0.0.1%3A5555%2Fsteam"));
        assert!(url.contains("openid.realm=http%3A%2F%2F127.0.0.1%3A5555&"));
    }

    #[test]
    fn reads_the_claimed_id_from_steams_reply() {
        let line = "GET /steam?openid.mode=id_res&openid.return_to=http%3A%2F%2F127.0.0.1%3A5555%2Fsteam&openid.claimed_id=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F76561198000000002 HTTP/1.1";
        let (path, params) = request_params(line).unwrap();
        assert_eq!(path, "/steam");
        assert_eq!(claimed_steam_id(&params, "http://127.0.0.1:5555/steam").as_deref(), Some("76561198000000002"));
        // A reply meant for another sign-in is refused.
        assert_eq!(claimed_steam_id(&params, "http://127.0.0.1:6666/steam"), None);
    }

    #[test]
    fn refuses_a_cancelled_sign_in() {
        let (_, params) = request_params("GET /steam?openid.mode=cancel HTTP/1.1").unwrap();
        assert_eq!(claimed_steam_id(&params, "http://127.0.0.1:5555/steam"), None);
    }
}
