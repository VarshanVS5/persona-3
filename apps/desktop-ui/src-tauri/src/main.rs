// Project ATLAS desktop shell (Tauri 2).
// Owns only: the native window, and reading/writing the UI's non-secret settings file in the
// app data directory. It launches no processes and performs no Windows automation (Req 22.2).
// STATUS: written but NOT compiled in the authoring environment (Rust toolchain was missing).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";
// Settings are a few hundred bytes. Refuse anything larger so the UI cannot be used to fill the disk.
const MAX_SETTINGS_BYTES: usize = 16 * 1024;

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data directory unavailable: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create app data directory: {e}"))?;
    Ok(dir.join(SETTINGS_FILE))
}

/// Returns the settings JSON text, or None when no settings file exists yet (first launch).
#[tauri::command]
fn load_settings(app: AppHandle) -> Result<Option<String>, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("cannot read settings: {e}"))
}

/// Writes settings atomically (temp file + rename) so a failed write never corrupts the last good file.
#[tauri::command]
fn save_settings(app: AppHandle, contents: String) -> Result<(), String> {
    if contents.len() > MAX_SETTINGS_BYTES {
        return Err("settings too large".into());
    }
    // The file must be valid JSON; the UI validates the schema.
    serde_json::from_str::<serde_json::Value>(&contents).map_err(|e| format!("settings are not valid JSON: {e}"))?;
    let path = settings_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, contents.as_bytes()).map_err(|e| format!("cannot write settings: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("cannot replace settings: {e}"))?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_settings, save_settings])
        .run(tauri::generate_context!())
        .expect("error while running Project ATLAS");
}
