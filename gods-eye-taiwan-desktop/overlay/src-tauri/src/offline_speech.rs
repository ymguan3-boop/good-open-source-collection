use base64::{engine::general_purpose::STANDARD, Engine};
use std::{fs, path::PathBuf, process::Command, time::{SystemTime, UNIX_EPOCH}};

#[tauri::command]
pub async fn offline_transcribe_audio(app: tauri::AppHandle, wav_base64: String) -> Result<String, String> {
  if wav_base64.len() > 3_000_000 { return Err("錄音超過 30 秒限制".into()); }
  let wav = STANDARD.decode(wav_base64).map_err(|_| "錄音格式不正確")?;
  if wav.len() < 44 || !wav.starts_with(b"RIFF") || &wav[8..12] != b"WAVE" { return Err("需要 16 kHz WAV 錄音".into()); }
  use tauri::Manager;
  let resource_home = app.path().resource_dir().ok().map(|path| path.join("whispercpp"));
  tauri::async_runtime::spawn_blocking(move || transcribe(wav, resource_home)).await.map_err(|e| format!("語音辨識執行失敗：{e}"))?
}

fn transcribe(wav: Vec<u8>, resource_home: Option<PathBuf>) -> Result<String, String> {
  let exe_dir = std::env::current_exe().map_err(|e| e.to_string())?.parent().unwrap().to_path_buf();
  let packaged = exe_dir.join("whispercpp");
  let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../vendor/whispercpp");
  let home = if let Some(resource) = resource_home.filter(|path| path.join("bin/whisper-cli.exe").exists()) { resource }
    else if packaged.join("bin/whisper-cli.exe").exists() { packaged } else { dev };
  let cli = home.join("bin/whisper-cli.exe");
  let model = home.join("ggml-tiny-q5_1.bin");
  if !cli.exists() || !model.exists() { return Err("找不到離線語音辨識程式或模型".into()); }
  let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
  let prefix = std::env::temp_dir().join(format!("gev-whisper-{}-{stamp}", std::process::id()));
  let wav_path = prefix.with_extension("wav");
  fs::write(&wav_path, wav).map_err(|e| format!("儲存錄音失敗：{e}"))?;
  let mut command = Command::new(&cli);
  command.current_dir(home.join("bin"))
    .args(["-m", model.to_str().ok_or("模型路徑無效")?, "-f", wav_path.to_str().ok_or("錄音路徑無效")?, "-l", "zh", "-t", "2", "-ng", "-nt", "-otxt", "-of", prefix.to_str().ok_or("輸出路徑無效")?, "-np"]);
  #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
  let result = command.output();
  let txt_path = prefix.with_extension("txt");
  let text = fs::read_to_string(&txt_path);
  let _ = fs::remove_file(&wav_path);
  let _ = fs::remove_file(&txt_path);
  let result = result.map_err(|e| format!("離線語音程式無法啟動：{e}"))?;
  if !result.status.success() { return Err(format!("離線語音辨識失敗，代碼 {:?}", result.status.code())); }
  let text = text.map_err(|e| format!("讀取辨識結果失敗：{e}"))?;
  let text = text.trim().to_string();
  if text.is_empty() { return Err("未辨識到語音，請靠近麥克風再試".into()); }
  Ok(text)
}
