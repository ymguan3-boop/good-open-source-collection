use serde_json::{json, Value};
use crate::secrets::read_key;
use std::time::Duration;

#[tauri::command]
pub async fn gemini_ephemeral_token() -> Result<String, String> {
  let key = read_key("gemini")
    .map_err(|_| "尚未設定 Gemini API Key，請先到設定貼上 Google AI Studio 免費 API Key。".to_string())?;

  // Some API projects reject liveConnectConstraints at auth_token even though
  // the optional field appears in examples. The Live session selects the model.
  let body = json!({ "uses": 1 });

  let client = reqwest::Client::builder()
    .connect_timeout(Duration::from_secs(8))
    .timeout(Duration::from_secs(25))
    .build()
    .map_err(|e| format!("Gemini 連線初始化失敗：{}", e))?;
  let response = client
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
    let detail = value.pointer("/error/message").and_then(Value::as_str).unwrap_or("服務拒絕請求，請檢查金鑰與帳號權限");
    return Err(format!("Gemini 臨時權杖取得失敗 {}：{}", status, detail));
  }

  value.get("name")
    .and_then(|v| v.as_str())
    .map(str::to_owned)
    .ok_or_else(|| "Gemini 臨時權杖回應缺少 name".to_string())
}

#[tauri::command]
pub async fn gemini_live_status() -> Result<String, String> {
  gemini_ephemeral_token().await.map(|_| "Gemini Live 金鑰可取得臨時權杖".to_string())
}
