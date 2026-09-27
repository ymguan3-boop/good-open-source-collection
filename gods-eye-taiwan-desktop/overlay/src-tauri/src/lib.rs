mod cesium_health;
mod gemini;
mod openrouter;
mod resources;
mod secrets;
mod tomtom;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      resources::resource_snapshot,
      secrets::save_api_key,
      secrets::has_api_key,
      secrets::browser_provider_keys,
      cesium_health::validate_cesium_token,
      tomtom::validate_tomtom_key,
      tomtom::tomtom_search,
      tomtom::tomtom_route,
      gemini::gemini_ephemeral_token,
      openrouter::openrouter_json
    ])
    .run(tauri::generate_context!())
    .expect("error while running 上帝之眼・台灣版");
}
