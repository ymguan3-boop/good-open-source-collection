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

## v15 新增驗收

- 載入宜蘭 NLSC 建物，放大、移動視野，低樓層建物不被全球地形遮住；子圖層說明顯示圖磚進度與失敗，不以圖磚數宣稱建物棟數。
- CCTV 預設 auto-free，只允許免費影像模型，429／供應商錯誤自動換免費模型，價格上限零；取消與序列排隊需有效。
- 工具列 sprite 實際顯示「記錄」；儲存對話／清除／風格按鈕樣式一致。
- GitHub 更新只涵蓋台灣版與倉庫根 README；不得提交本機金鑰、日誌、安裝工作區或發布暫存。

## v16 新增驗收

- 語音未指定範圍不能直接載入；模型自行補的 scope 不算使用者指定。同一回合不得自行接受建議。來源只支援全球／全臺時先告知建議；全臺建物不能宣稱完整涵蓋。
- 第一／第三人稱往返後維持原航機選取及可見標示，狀態卡可拖曳；標籤拖曳後相機不移動，JSON 座標同步，取消／失焦會恢復操作。
- 對話空白、429及串流中斷可輪替免費文字模型，失敗片段不混入備援回覆；成功保存才宣稱儲存風格，本機設定不放入 GitHub。
- 記錄勾選框固定小尺寸、清單緊湊；預覽保留程式碼換行與安全 HTML 轉義。

## v17 語音範圍驗收

- 完整圖資＋區域直接載入；未指定才詢問，回答區域後沿用原圖資及操作。
- 檢查逐字稿晚到、分段、繁簡字及已知同音誤字，不以模型自行猜的範圍取代使用者指定。
- 同回合不得重複載入；取消、停止、換新請求與期限清除有效。
- 合成語音服務抽測須區分載入替身與真實地圖驗收，不宣稱實體麥克風驗收完成。

## v18 語音工作驗收

- 完整圖資＋區域（含可唯一判定縣市簡稱）直接載入；區域回答接續原請求，禮貌問句不能被當成拒絕操作。
- 驗收真實工具列圖層：全台灣道路、宜蘭水系、另一縣市道路，檢查實際筆數與圖層範圍，不只用載入替身。
- 執行期間模型工具晚到不遺失結果；完成後只回報實際工作，不重新詢問已提供的條件。
- 地點定位新增可拖曳標籤，標註／專案可管理；取消後不得宣稱完成。
- 所有驗收掛鉤、合成音檔及記憶體檢查限本機隔離服務，不放入正式建置或GitHub。區分合成語音服務驗收與實體麥克風驗收。
