use serde_json::{json, Value};
use crate::secrets::read_key;

#[tauri::command]
pub async fn gemini_ephemeral_token() -> Result<String, String> {
  let key = read_key("gemini")
    .map_err(|_| "尚未設定 Gemini API Key，請先到設定貼上 Google AI Studio 免費 API Key。".to_string())?;

  let body = json!({
    "uses": 1,
    "liveConnectConstraints": {
      "model": "models/gemini-3.8-live"
    }
  });

  let response = reqwest::Client::new()
    .post("https://generativelanguage.googleapis.com/v1beta/auth_tokens")
    .header("x-goog-api-key", key)
    .header("Content-Type", "application/json")
    .json(&body)
    .send()
    .await
    .map_err(|e| format!("Gemini 臨時權杖連線失敗：{}", e))?;

  let status = response.status();
  let value: Value = response.json().await
    .map_err(|e| format!("Gemini 臨時權杖回應解析失敗：{}", e))?;

  if !status.is_success() {
    return Err(format!("Gemini 臨時權杖取得失敗 {}：{}", status, value));
  }

  value.get("name")
    .and_then(|v| v.as_str())
    .map(str::to_owned)
    .ok_or_else(|| "Gemini 臨時權杖回應缺少 name".to_string())
}
