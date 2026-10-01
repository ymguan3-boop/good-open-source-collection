use serde_json::Value;
use crate::secrets::read_key;

#[tauri::command]
pub async fn validate_cesium_token() -> Result<Value, String> {
  let token = read_key("cesium").map_err(|_| "尚未設定 Cesium ion Token".to_string())?;
  // God's Eye View currently uses Cesium ion asset 2275207 for Google Photorealistic 3D Tiles.
  // Testing the endpoint verifies the assets:read capability actually needed by the app.
  let response = reqwest::Client::new()
    .get("https://api.cesium.com/v1/assets/2275207/endpoint")
    .bearer_auth(token)
    .send()
    .await
    .map_err(|e| format!("Cesium ion 連線失敗：{}", e))?;
  let status = response.status();
  let body = response.text().await.map_err(|e| e.to_string())?;
  if !status.is_success() {
    return Err(format!("Cesium ion Token 驗證失敗 {}：{}", status, body));
  }
  let value: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
  Ok(serde_json::json!({
    "ok": true,
    "assetId": 2275207,
    "type": value.get("type").and_then(|v| v.as_str()).unwrap_or(""),
  }))
}
