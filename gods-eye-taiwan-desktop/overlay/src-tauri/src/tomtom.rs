use serde_json::Value;
use crate::secrets::read_key;

#[tauri::command]
pub async fn tomtom_search(query: String, lat: Option<f64>, lon: Option<f64>) -> Result<String, String> {
  let key = read_key("tomtom").map_err(|_| "尚未設定 TomTom API Key".to_string())?;
  let q = query.trim();
  if q.is_empty() { return Err("搜尋文字不可為空".into()); }

  let mut url = reqwest::Url::parse(&format!(
    "https://api.tomtom.com/search/2/search/{}.json",
    urlencoding::encode(q)
  )).map_err(|e| e.to_string())?;
  {
    let mut p = url.query_pairs_mut();
    p.append_pair("key", &key);
    p.append_pair("countrySet", "TW");
    p.append_pair("language", "zh-TW");
    p.append_pair("limit", "5");
    if let (Some(lat), Some(lon)) = (lat, lon) {
      p.append_pair("lat", &lat.to_string());
      p.append_pair("lon", &lon.to_string());
    }
  }
  let response = reqwest::Client::new().get(url).send().await.map_err(|e| e.to_string())?;
  let status = response.status();
  let body = response.text().await.map_err(|e| e.to_string())?;
  if !status.is_success() { return Err(format!("TomTom Search {}: {}", status, body)); }
  Ok(body)
}

#[tauri::command]
pub async fn tomtom_route(
  origin_lat: f64,
  origin_lon: f64,
  destination_lat: f64,
  destination_lon: f64,
  travel_mode: Option<String>,
) -> Result<String, String> {
  let key = read_key("tomtom").map_err(|_| "尚未設定 TomTom API Key".to_string())?;
  let mode = travel_mode.unwrap_or_else(|| "car".into());
  let locations = format!("{},{}:{},{}", origin_lat, origin_lon, destination_lat, destination_lon);
  let mut url = reqwest::Url::parse(&format!(
    "https://api.tomtom.com/routing/1/calculateRoute/{}/json",
    locations
  )).map_err(|e| e.to_string())?;
  {
    let mut p = url.query_pairs_mut();
    p.append_pair("key", &key);
    p.append_pair("routeType", "fastest");
    p.append_pair("traffic", "true");
    p.append_pair("travelMode", &mode);
    p.append_pair("routeRepresentation", "polyline");
    p.append_pair("instructionsType", "text");
    p.append_pair("language", "zh-TW");
    p.append_pair("computeTravelTimeFor", "all");
  }

  let response = reqwest::Client::new().get(url).send().await.map_err(|e| e.to_string())?;
  let status = response.status();
  let body = response.text().await.map_err(|e| e.to_string())?;
  if !status.is_success() { return Err(format!("TomTom Routing {}: {}", status, body)); }
  Ok(body)
}

#[tauri::command]
pub async fn validate_tomtom_key() -> Result<Value, String> {
  let raw = tomtom_search("台北車站".into(), None, None).await?;
  let value: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
  let count = value.get("results").and_then(|v| v.as_array()).map(|v| v.len()).unwrap_or(0);
  Ok(serde_json::json!({"ok": count > 0, "resultCount": count}))
}
