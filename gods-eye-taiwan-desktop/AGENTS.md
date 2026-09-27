# 上帝之眼・台灣版 — Agent 安裝規則

本資料夾是可由 Agent 直接安裝的 Windows 本機版原始碼。

## 目標
不要下載預先編譯安裝程式。Agent 應從此開源路徑取得原始碼，在使用者電腦上完成：
1. 檢查必要工具。
2. 準備固定版本的 God's Eye View。
3. 套用台灣版 overlay。
4. 安裝 Node/Rust 相依套件。
5. 本機編譯 Tauri 桌面執行檔（不產生 NSIS/MSI 安裝器）。
6. 將可執行檔複製到 `local-app/`。
7. 使用專案內 `branding/gods-eye-taiwan.ico` 建立桌面捷徑「上帝之眼・台灣版」。
8. 啟動並確認完整地球、T 台灣、G 全球、設定、資源監看皆可用。

## 禁止
- 不要建立第二套地球 Viewer。
- 不要改 Windows Pagefile、GPU 時脈或驅動設定。
- 不要把 OpenRouter Key 寫進 source code。
- 不要刪除 Cesium/provider attribution。
- 不要產生或要求使用者下載預先編譯 installer。

## Windows 必要條件
Agent 先檢查：
- Git
- Node.js：符合上游 `>=24.14 <25` 或 `>=26 <27`
- Rust/Cargo stable
- Microsoft C++ Build Tools（Tauri Windows 編譯）
- Microsoft Edge WebView2 Runtime

若缺少工具，Agent應使用目前系統可用的官方安裝方法（例如 winget）處理；在使用管理員權限前告知使用者。

## 執行
從本資料夾根目錄：
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\agent-install-windows.ps1
```

完成後桌面捷徑會指向：
```
<repo>\gods-eye-taiwan-desktop\local-app\GodsEyeTaiwan.exe
```

捷徑 icon 固定使用：
```
<repo>\gods-eye-taiwan-desktop\branding\gods-eye-taiwan.ico
```

## 驗收
- 桌面有「上帝之眼・台灣版」捷徑。
- 捷徑顯示本專案 icon。
- 雙擊可啟動。
- 預設顯示完整地球。
- T 跳到台灣、G 回全球。
- UI 為繁體中文。
- OpenRouter/Cesium/Google Key 從設定處管理。
- RAM/Swap/GPU/VRAM 面板可開啟。
