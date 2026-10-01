# 上帝之眼・台灣版 — Agent 安裝與驗收規則

本資料夾採「原始碼 + Agent 本機安裝」模式。

## 安裝目標

1. 檢查 Git、Node.js、npm、Rust/Cargo、Microsoft C++ Build Tools、WebView2。
2. 執行 `scripts/prepare-upstream.ps1`，取得 `UPSTREAM.lock` 指定 God's Eye View。
3. 套用 Taiwan overlay。
4. `npm install`。
5. `npm.cmd run build` 與 `cargo build --manifest-path .\src-tauri\Cargo.toml`，產出可啟動的正式介面與桌面程式。
6. 執行 `scripts/create-desktop-shortcut.ps1` 建立「上帝之眼-台灣版」桌面捷徑。
7. 捷徑使用版本化圖示 `branding/gods-eye-taiwan-v4.ico`，避免 Windows 沿用舊圖示快取。
8. 捷徑啟動 `scripts/start-gods-eye-taiwan.ps1`；該腳本啟動或沿用以 `vite preview` 提供正式介面與 `/api` 的隱藏本機服務，只顯示一個 Tauri 桌面視窗。原生程式不存在或立即退出時顯示錯誤，不另開瀏覽器。啟動失敗須記錄於 `logs/desktop-launch.log`。

## 為什麼不能只啟動純靜態 EXE

上游的 CCTV、OSM Overpass、天氣等功能依賴 `/api/...` provider middleware。HTML 介面仍須透過本機 Vite provider service 開啟，不能直接雙擊 `index.html`。瀏覽器模式可透過本機服務讀取 RAM、分頁檔與 Windows GPU 計數器，並以只綁定本機的服務代理 OpenRouter、Gemini Live 和 Whisper.cpp；瀏覽器輸入的服務金鑰以 Windows DPAPI CurrentUser 加密保存至使用者 LocalAppData；長效 AI 金鑰不回傳至前端或寫入 JSON 專案。瀏覽器模式以 DPAPI 儲存金鑰，透過只綁定本機的 TomTom 代理提供搜尋、路線及即時交通；Tauri 的 Credential Manager 能力需另行驗收。

目前另有瀏覽器版試用入口 `啟動上帝之眼-瀏覽器版.bat`，由 Node.js 啟動或沿用只綁定 `127.0.0.1:4175` 的既有 Vite provider service，再直接呼叫 Google Chrome。此入口不執行 Tauri EXE；不要以瀏覽器可載入推論先前 Apex One 對 EXE 的偵測為誤判。桌面上另建「上帝之眼-台灣版(瀏覽器)」捷徑，不取代原桌面版捷徑。

## 必須驗收

- 預設顯示完整地球。
- `T` 跳台灣，`G` 回全球。
- UI 為繁體中文。
- 設定可管理 Cesium / Google / OpenRouter / Gemini / TomTom。
- RAM / Swap / GPU / VRAM 面板可使用。
- OSM 不做背景更新或提醒；只有使用者手動按「更新」才查詢最新可用資料；「載入」使用隨附全臺固定版。
- 「圖資 → 查看 OSM 資料時間」只在手動觸發時取得 `osm3s.timestamp_osm_base`；若上游失效應誠實顯示錯誤/備援，不得假稱最新。
- 「圖資 → 抽查 CCTV 最新畫面」能顯示每支 sample 的 `X-CCTV-Source`。只有 `upstream-image` 可判定為直接上游 snapshot；Street View / synthetic 只能標示備援。
- CCTV 原版面板可正常開啟；active still 約 10 秒刷新一次。
- Cesium ion Token：儲存後執行「驗證 Cesium Token」，必須實際通過 ion asset 2275207 endpoint；重啟後 runtimeConfig 必須把 Token 傳入上游 `cesiumToken`。
- TomTom API Key：儲存後執行「驗證 TomTom Key」；至少完成一次台灣地點搜尋與一次行車路線。
- 手動導航驗收：指定起訖點 → 顯示路線 → 查看整條路線 → 導航視角；若 Windows Location Services 可用，再測「開始導航／停止導航」。
- 若使用者已提供 Gemini API Key，Gemini Live 能取得 ephemeral token、開啟麥克風、回傳語音，並抽測「顯示行車路線 / 導航視角 / 開始導航」至少一項。
- OpenRouter 舊功能不得因 Gemini 加入而失效。

## 禁止

- 不建立第二套 globe viewer。
- 不把 Gemini/OpenRouter/TomTom 長效 Key 寫到 JS 或 repo。
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
- OSM 預設載入內建全區固定版，線型依視野索引顯示，街區視野不均勻抽樣。「更新」才按範圍逐區查詢，部分及失敗結果須標示。已隨附官方全臺鐵路可在全球視野載入。
- OSM layer 的 source 依固定版或線上更新標示 OpenStreetMap / Geofabrik 或 Overpass；官方鐵路標示國土測繪中心開放資料及固定版本。
- NLSC WFS 顯示官方代碼與「需申請」說明；政府開放資料授權允許下載的鐵路線型可隨附，須保留來源、版本、授權與 SHA-256，不得混同需授權 WFS。
- 省電／平衡／效能模式切換後，內建圖層載入預算應跟著改變。

## v12新增驗收

- 道路與水系在街區尺度顯示全部相交完整線段，移動相機會重建視野，保留全部分析向量。
- 縣市界22筆、鄉鎮市區界368筆，可選縣市／全台，顏色、隱藏及刪除可操作。
- TomTom路況線1.3像素，封路2像素，移動點位依即時速度比例示意，明示非逐車定位。
- 瀏覽器首次安裝可執行node scripts/install-browser.mjs，不需Rust；桌面版仍另行驗收。
