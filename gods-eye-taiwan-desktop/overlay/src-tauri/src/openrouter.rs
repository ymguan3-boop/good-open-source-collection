
use serde_json::{json, Value};
use crate::secrets::read_key;

#[tauri::command]
pub async fn openrouter_json(model: String, system: String, prompt: String) -> Result<String, String> {
  let key = read_key("openrouter").map_err(|_| "尚未設定 OpenRouter API Key".to_string())?;
  let client = reqwest::Client::new();
  let body = json!({
    "model": model,
    "messages": [
      {"role":"system","content":system},
      {"role":"user","content":prompt}
    ],
    "response_format": {"type":"json_object"}
  });
  let res = client.post("https://openrouter.ai/api/v1/chat/completions")
    .bearer_auth(key)
    .header("X-Title", "上帝之眼・台灣版")
    .json(&body)
    .send().await.map_err(|e| e.to_string())?;
  let status = res.status();
  let value: Value = res.json().await.map_err(|e| e.to_string())?;
  if !status.is_success() { return Err(format!("OpenRouter {}: {}", status, value)); }
  value.pointer("/choices/0/message/content")
    .and_then(|v| v.as_str())
    .map(str::to_owned)
    .ok_or_else(|| "OpenRouter 回應缺少 choices[0].message.content".into())
}
