
use serde::Serialize;

const SERVICE: &str = "gods-eye-taiwan";

fn entry(name: &str) -> Result<keyring::Entry, String> {
  keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())
}
pub fn read_key(name: &str) -> Result<String, String> {
  entry(name)?.get_password().map_err(|e| e.to_string())
}
#[tauri::command]
pub fn save_api_key(name: String, value: String) -> Result<(), String> {
  let allowed = ["cesium", "google", "openrouter"];
  if !allowed.contains(&name.as_str()) { return Err("Unsupported key name".into()); }
  if value.trim().is_empty() { return Err("Key is empty".into()); }
  entry(&name)?.set_password(value.trim()).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn has_api_key(name: String) -> bool { read_key(&name).map(|v| !v.is_empty()).unwrap_or(false) }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserProviderKeys { google_maps_api_key: Option<String>, cesium_ion_token: Option<String> }

#[tauri::command]
pub fn browser_provider_keys() -> BrowserProviderKeys {
  BrowserProviderKeys {
    google_maps_api_key: read_key("google").ok(),
    cesium_ion_token: read_key("cesium").ok(),
  }
}
