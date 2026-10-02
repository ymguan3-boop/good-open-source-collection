use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};
static SETTINGS_LOCK: Mutex<()> = Mutex::new(());

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseStyle { value: String, updated_at: String }
fn location() -> Result<PathBuf, String> {
    let base = std::env::var_os("LOCALAPPDATA").ok_or("找不到 Windows 使用者設定資料夾")?;
    Ok(PathBuf::from(base).join("GodsEyeTaiwan").join("response-style.json"))
}
fn valid(setting: &ResponseStyle) -> bool {
    let time = setting.updated_at.as_bytes();
    setting.value.chars().count() <= 2000 && time.len() == 24 && time.iter().enumerate().all(|(i, c)| match i {
        4 | 7 => *c == b'-', 10 => *c == b'T', 13 | 16 => *c == b':', 19 => *c == b'.', 23 => *c == b'Z', _ => c.is_ascii_digit()
    })
}
fn read_file() -> Result<Option<ResponseStyle>, String> {
    match fs::read(location()?) {
        Ok(bytes) => { let value: ResponseStyle = serde_json::from_slice(&bytes).map_err(|_| "本機風格設定格式不正確")?;
            if !valid(&value) { return Err("本機風格設定格式不正確".into()); } Ok(Some(value)) },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err("無法讀取本機對話風格設定".into())
    }
}
#[tauri::command]
pub fn read_response_style() -> Result<Option<ResponseStyle>, String> {
    let _lock = SETTINGS_LOCK.lock().map_err(|_| "本機風格設定忙碌")?;
    read_file()
}
#[tauri::command]
pub fn write_response_style(setting: ResponseStyle) -> Result<ResponseStyle, String> {
    if !valid(&setting) { return Err("風格設定格式不正確".into()); }
    let _lock = SETTINGS_LOCK.lock().map_err(|_| "本機風格設定忙碌")?;
    if let Some(existing) = read_file()? { if existing.updated_at >= setting.updated_at { return Ok(existing); } }
    let path = location()?;
    fs::create_dir_all(path.parent().ok_or("本機風格設定路徑不正確")?).map_err(|_| "無法建立本機風格設定資料夾")?;
    let temporary = path.with_file_name("response-style.native.tmp");
    let bytes = serde_json::to_vec(&setting).map_err(|_| "風格設定格式不正確")?;
    fs::write(&temporary, bytes).map_err(|_| "無法寫入本機對話風格設定")?;
    fs::rename(&temporary, &path).map_err(|_| "無法儲存本機對話風格設定")?;
    Ok(setting)
}
