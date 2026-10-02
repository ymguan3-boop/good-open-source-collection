
use serde_json::{json, Value};
use crate::secrets::read_key;
use std::time::Duration;
use serde::Serialize;

#[derive(Serialize)]
pub struct ChatReply { content: String, model: String }

fn free_text_model(value: &Value) -> bool {
  let zero = |field: &str| value["pricing"][field].as_f64().or_else(|| value["pricing"][field].as_str().and_then(|p| p.parse::<f64>().ok())) == Some(0.0);
  let name = format!("{} {}", value["id"].as_str().unwrap_or(""), value["name"].as_str().unwrap_or("")).to_lowercase();
  zero("prompt") && zero("completion") && value["architecture"]["output_modalities"].as_array().is_some_and(|items| items.iter().any(|item| item.as_str() == Some("text"))) && !["safety", "guard", "moderation", "embedding", "lyria"].iter().any(|word| name.contains(word))
}

fn final_chat_text(content: &str) -> String {
  let mut text = content.to_string();
  for tag in ["think", "analysis"] {
    loop {
      let lower = text.to_ascii_lowercase();
      let Some(start) = lower.find(&format!("<{tag}>")) else { break; };
      let end = lower[start..].find(&format!("</{tag}>")).map(|n| start+n+tag.len()+3).unwrap_or(text.len());
      text.replace_range(start..end, "");
    }
  }
  text.trim().to_string()
}

#[tauri::command]
pub async fn openrouter_chat(model: String, fallback_models: Vec<String>, messages: Vec<Value>) -> Result<ChatReply, String> {
  let key = read_key("openrouter").map_err(|_| "尚未設定 OpenRouter API Key".to_string())?;
  if model.len() > 160 || !model.contains('/') { return Err("請先選擇有效的 AI 模型".into()); }
  if messages.is_empty() || messages.len() > 24 { return Err("對話筆數超過限制，請重新開啟對話".into()); }
  let mut safe_messages = vec![json!({"role":"system","content":"你是上帝之眼台灣版的空間資訊助理。使用繁體中文，只輸出最終回答。可以說明地圖與資料，但未實際執行的操作不可宣稱已完成。回答精簡，對資料來源與不確定性如實說明。"})];
  for (index, message) in messages.into_iter().enumerate() {
    let role = message.get("role").and_then(Value::as_str).unwrap_or("");
    let content = message.get("content").and_then(Value::as_str).unwrap_or("");
    let host_context = role == "system" && index == 0;
    if !(matches!(role, "user" | "assistant") || host_context) || content.is_empty() || content.chars().count() > if host_context { 24000 } else { 4000 } {
      return Err("對話內容格式不正確或過長".into());
    }
    safe_messages.push(json!({"role":role,"content":content}));
  }
  let client = reqwest::Client::builder().connect_timeout(Duration::from_secs(8)).timeout(Duration::from_secs(45)).build().map_err(|e| e.to_string())?;
  let mut models = vec![model.clone()];
  // Catalog-derived fallbacks; do not trust client-supplied prices or retry the same router.
  if let Ok(response) = client.get("https://openrouter.ai/api/v1/models").timeout(Duration::from_secs(12)).send().await {
    if response.status().is_success() {
      if let Ok(catalog) = response.json::<Value>().await {
        if let Some(items) = catalog["data"].as_array() {
          let mut free: Vec<String> = items.iter().filter(|item| free_text_model(item)).filter_map(|item| item["id"].as_str().map(str::to_owned)).collect();
          free.sort_by_key(|id| if fallback_models.contains(id) { 0 } else if id.contains("qwen") || id.contains("gemma") { 1 } else { 2 });
          for id in free { if !models.contains(&id) { models.push(id); } }
        }
      }
    }
  }
  if !models.iter().any(|id| id == "openrouter/free") { models.push("openrouter/free".to_string()); }
  let started = std::time::Instant::now();
  let mut attempts = 0;
  for candidate in models {
    let remaining = Duration::from_secs(240).saturating_sub(started.elapsed());
    if remaining.is_zero() { break; }
    attempts += 1;
    let sent = client.post("https://openrouter.ai/api/v1/chat/completions").timeout(remaining.min(Duration::from_secs(45)))
      .bearer_auth(&key).header("X-OpenRouter-Title", "Gods Eye Taiwan")
      .json(&json!({"model":candidate,"provider":{"max_price":{"prompt":0,"completion":0,"request":0}},"messages":safe_messages,"max_tokens":1800,"reasoning":{"effort":"low","exclude":true}})).send().await;
    let Ok(response) = sent else { continue; };
    if response.status().as_u16() == 401 { return Err("AI 金鑰無效，請重新儲存金鑰".into()); }
    if !response.status().is_success() { continue; }
    let Ok(value) = response.json::<Value>().await else { continue; };
    let reason = value.pointer("/choices/0/finish_reason").and_then(Value::as_str).unwrap_or("");
    if matches!(reason, "error" | "content_filter") { continue; }
    let content = final_chat_text(value.pointer("/choices/0/message/content").and_then(Value::as_str).unwrap_or(""));
    if content.is_empty() { continue; }
    return Ok(ChatReply { content, model: value.get("model").and_then(Value::as_str).unwrap_or(&candidate).to_string() });
  }
  Err(format!("已自動嘗試 {attempts} 個免費模型，仍未取得正常文字回覆；可能額度不足或服務忙碌，請稍後重試。"))
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
