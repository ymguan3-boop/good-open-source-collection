
use serde_json::{json, Value};
use crate::secrets::read_key;
use std::time::Duration;
use serde::Serialize;

#[derive(Serialize)]
pub struct ChatReply { content: String, model: String }

#[tauri::command]
pub async fn openrouter_chat(model: String, fallback_models: Vec<String>, messages: Vec<Value>) -> Result<ChatReply, String> {
  let key = read_key("openrouter").map_err(|_| "尚未設定 OpenRouter API Key".to_string())?;
  if model.len() > 160 || !model.contains('/') { return Err("請先選擇有效的 AI 模型".into()); }
  if messages.is_empty() || messages.len() > 24 { return Err("對話筆數超過限制，請重新開啟對話".into()); }
  let mut models = vec![model.clone()];
  // OpenRouter accepts at most three entries in `models`.
  for fallback in fallback_models.into_iter() {
    if fallback.len() <= 160 && fallback.contains('/') && !models.contains(&fallback) { models.push(fallback); }
    if models.len() >= 2 { break; }
  }
  if models.len() < 3 && !models.iter().any(|item| item == "openrouter/free") { models.push("openrouter/free".to_string()); }
  let mut safe_messages = vec![json!({"role":"system","content":"你是上帝之眼台灣版的空間資訊助理。使用繁體中文。可以說明地圖與資料，但未透過程式工具實際執行的操作不可宣稱已完成。回答精簡，對資料來源與不確定性如實說明。"})];
  for message in messages {
    let role = message.get("role").and_then(Value::as_str).unwrap_or("");
    let content = message.get("content").and_then(Value::as_str).unwrap_or("");
    if !matches!(role, "user" | "assistant") || content.is_empty() || content.chars().count() > 4000 {
      return Err("對話內容格式不正確或過長".into());
    }
    safe_messages.push(json!({"role":role,"content":content}));
  }
  let client = reqwest::Client::builder().connect_timeout(Duration::from_secs(8)).timeout(Duration::from_secs(45)).build().map_err(|e| e.to_string())?;
  let mut response = None;
  for attempt in 0..2 {
    let sent = client.post("https://openrouter.ai/api/v1/chat/completions")
      .bearer_auth(&key)
      .header("X-OpenRouter-Title", "Gods Eye Taiwan")
      .json(&json!({"models":models,"messages":safe_messages}))
      .send().await;
    match sent {
      Ok(res) if (res.status().is_server_error() || res.status().as_u16() == 429) && attempt == 0 => {
        std::thread::sleep(Duration::from_millis(850));
      }
      Ok(res) => { response = Some(res); break; }
      Err(_) if attempt == 0 => std::thread::sleep(Duration::from_millis(850)),
      Err(e) => return Err(format!("AI 對話連線失敗：{e}")),
    }
  }
  let res = response.ok_or("OpenRouter 沒有回應")?;
  let status = res.status();
  let value: Value = res.json().await.map_err(|e| format!("AI 回應解析失敗：{}", e))?;
  if !status.is_success() {
    let detail = value.pointer("/error/message").and_then(Value::as_str).unwrap_or("服務拒絕請求");
    return Err(format!("OpenRouter {}：{}", status, detail));
  }
  let content = value.pointer("/choices/0/message/content").and_then(Value::as_str).map(str::to_owned)
    .ok_or_else(|| "OpenRouter 回應沒有文字內容".to_string())?;
  Ok(ChatReply { content, model: value.get("model").and_then(Value::as_str).unwrap_or(&model).to_string() })
}

#[tauri::command]
pub async fn openrouter_key_status() -> Result<Value, String> {
  let key = read_key("openrouter").map_err(|_| "尚未設定 OpenRouter API Key".to_string())?;
  let client = reqwest::Client::builder().connect_timeout(Duration::from_secs(8)).timeout(Duration::from_secs(20)).build().map_err(|e| e.to_string())?;
  let res = client.get("https://openrouter.ai/api/v1/key").bearer_auth(key).send().await.map_err(|e| format!("OpenRouter 金鑰狀態連線失敗：{e}"))?;
  let status = res.status();
  let value: Value = res.json().await.map_err(|e| format!("OpenRouter 金鑰狀態解析失敗：{e}"))?;
  if !status.is_success() { return Err(format!("OpenRouter {}：{}", status, value.pointer("/error/message").and_then(Value::as_str).unwrap_or("服務拒絕請求"))); }
  let data = &value["data"];
  Ok(json!({"connected":true,"isFreeTier":data["is_free_tier"],"usage":data["usage"],"usageDaily":data["usage_daily"],"limit":data["limit"],"limitRemaining":data["limit_remaining"]}))
}

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
    .header("X-OpenRouter-Title", "Gods Eye Taiwan")
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

#[tauri::command]
pub async fn openrouter_free_models() -> Result<Vec<Value>, String> {
  let client = reqwest::Client::new();
  let res = client.get("https://openrouter.ai/api/v1/models")
    .header("X-OpenRouter-Title", "Gods Eye Taiwan")
    .send().await.map_err(|e| e.to_string())?;
  let status = res.status();
  let value: Value = res.json().await.map_err(|e| e.to_string())?;
  if !status.is_success() { return Err(format!("OpenRouter {}: {}", status, value)); }
  value.get("data").and_then(Value::as_array)
    .map(|models| models.iter().filter(|model| {
      let pricing = &model["pricing"];
      ["prompt", "completion"].iter().all(|key| {
        pricing.get(*key).and_then(Value::as_str)
          .and_then(|price| price.parse::<f64>().ok()) == Some(0.0)
      })
    }).cloned().collect())
    .ok_or_else(|| "OpenRouter models 回應缺少 data 清單".into())
}
