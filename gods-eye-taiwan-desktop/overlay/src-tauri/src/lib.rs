mod cesium_health;
mod gemini;
mod openrouter;
mod offline_speech;
mod resources;
mod secrets;
mod tomtom;

#[tauri::command]
fn open_provider_key_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
  use tauri_plugin_opener::OpenerExt;
  const ALLOWED: &[&str] = &[
    "https://developers.google.com/maps/documentation/tile/get-api-key",
    "https://developers.google.com/maps/documentation/places/web-service/get-api-key",
    "https://platform.openai.com/api-keys",
    "https://aisstream.io",
    "https://firms.modaps.eosdis.nasa.gov/api/map_key/",
    "https://developer.tomtom.com",
    "https://my.tomtom.com/",
    "https://ion.cesium.com/tokens",
    "https://opensky-network.org",
    "https://thespacedevs.com",
    "https://openrouter.ai/settings/keys",
    "https://aistudio.google.com/apikey",
  ];
  if !ALLOWED.contains(&url.as_str()) {
    return Err("不允許的金鑰申請網址".into());
  }
  app.opener().open_url(url, None::<String>).map_err(|error| error.to_string())
}

#[tauri::command]
fn restart_after_key_save(app: tauri::AppHandle) {
  app.request_restart();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _, _| {
      use tauri::Manager;
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
      }
    }))
    .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
    .invoke_handler(tauri::generate_handler![
      open_provider_key_url,
      restart_after_key_save,
      resources::resource_snapshot,
      secrets::save_api_key,
      secrets::has_api_key,
      secrets::browser_provider_keys,
      cesium_health::validate_cesium_token,
      tomtom::validate_tomtom_key,
      tomtom::tomtom_search,
      tomtom::tomtom_route,
      gemini::gemini_ephemeral_token,
      gemini::gemini_live_status,
      offline_speech::offline_transcribe_audio,
      openrouter::openrouter_chat,
      openrouter::openrouter_key_status,
      openrouter::openrouter_json,
      openrouter::openrouter_free_models
    ])
    .run(tauri::generate_context!())
    .expect("error while running 上帝之眼・台灣版");
}
