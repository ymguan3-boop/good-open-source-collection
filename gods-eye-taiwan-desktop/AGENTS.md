# 上帝之眼・台灣版 — Agent 安裝與驗收規則

本資料夾採「原始碼 + Agent 本機安裝」模式。

## 安裝目標

1. 檢查 Git、Node.js、npm、Rust/Cargo、Microsoft C++ Build Tools、WebView2。
2. 執行 `scripts/prepare-upstream.ps1`，取得 `UPSTREAM.lock` 指定 God's Eye View。
3. 套用 Taiwan overlay。
4. `npm install`。
5. `cargo check --release --manifest-path .\src-tauri\Cargo.toml`。
6. 執行 `scripts/create-desktop-shortcut.ps1` 建立「上帝之眼・台灣版」桌面捷徑。
7. 捷徑必須使用 `branding/gods-eye-taiwan.ico`。
8. 捷徑啟動 `scripts/start-gods-eye-taiwan.ps1`；該腳本以 `npx tauri dev --release --no-watch` 啟動本機 provider service + Tauri 視窗。

## 為什麼不能只啟動純靜態 EXE

上游的 CCTV、OSM Overpass、天氣等功能依賴 `/api/...` provider middleware。若只打開純靜態 build，這些即時功能會消失。Source+Agent 安裝模式因此保留本機 provider service。

## 必須驗收

- 預設顯示完整地球。
- `T` 跳台灣，`G` 回全球。
- UI 為繁體中文。
- 設定可管理 Cesium / Google / OpenRouter / Gemini。
- RAM / Swap / GPU / VRAM 面板可使用。
- 「圖資 → 檢查 OSM 新鮮度」可取得 `osm3s.timestamp_osm_base`；若上游失效應誠實顯示錯誤/備援，不得假稱最新。
- 「圖資 → 抽查 CCTV 最新畫面」能顯示每支 sample 的 `X-CCTV-Source`。只有 `upstream-image` 可判定為直接上游 snapshot；Street View / synthetic 只能標示備援。
- CCTV 原版面板可正常開啟；active still 約 10 秒刷新一次。
- 若使用者已提供 Gemini API Key，Gemini Live 能取得 ephemeral token、開啟麥克風、回傳語音，且「列圖層 / 台灣 / 全球 / Buffer」至少各抽測一項。
- OpenRouter 舊功能不得因 Gemini 加入而失效。

## 禁止

- 不建立第二套 globe viewer。
- 不把 Gemini/OpenRouter 長效 Key 寫到 JS 或 repo。
- 不把 CCTV fallback 當成即時 CCTV。
- 不刪除 Cesium/OSM/provider attribution。
- 不自動修改 Windows Pagefile、GPU 時脈、驅動或系統級效能設定。
- 不產生預先編譯 installer 作為必要交付物。


## 內建基礎圖資驗收

Agent 安裝後需另外驗收：
- 先移動到台灣任一縣市尺度。
- 「圖資 → 內建基礎圖資」分別載入道路、鐵路、水系。
- 每一類必須成為獨立 layer，不得只是底圖樣式。
- 圖層可隱藏／顯示／更新／移除。
- 全球或過大視窗載入時應被輕量化保護阻擋。
- 內建 layer 的 source 應標示 OpenStreetMap / Overpass。
- NLSC WFS 只顯示官方代碼與「需申請」說明，不得把需授權資料偷偷內嵌。
- 省電／平衡／效能模式切換後，內建圖層載入預算應跟著改變。
