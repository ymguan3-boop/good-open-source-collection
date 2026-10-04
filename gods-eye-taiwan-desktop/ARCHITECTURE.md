# 架構

本版本為瀏覽器介面搭配本機 Node.js provider service；不需要原生桌面 Runtime、Rust、Visual Studio 或 WebView2。

```text
God's Eye View upstream（UPSTREAM.lock 固定版本）
        │
        ├── 既有 Cesium Viewer / 圖層 / 相機 / providers
        │
Taiwan Overlay
        ├── 繁體中文工具列與圖資管理
        ├── JSON 專案 / GIS / 標籤 / 記錄
        ├── AI 空間助理 / Gemini Live 語音控制
        ├── Resource Governor
        ├── Cinematic Camera
        └── CCTV 本機辨識 / 選用雲端深度分析
        │
Vite 本機服務（127.0.0.1:4175）
        ├── 原有 /api/cctv /api/overpass 等資料來源
        ├── 台灣 NLSC / DTM / TomTom / CCTV providers
        ├── OpenRouter / Gemini Live / Whisper.cpp 代理
        ├── Windows 資源計數器
        └── DPAPI CurrentUser 金鑰與本機風格設定
        │
Chrome 瀏覽器 / 瀏覽器捷徑
```

## 原始碼與安裝工作區

- `overlay/` 保存台灣版可維護原始碼、圖資、模型及 providers。
- `.work/upstream` 是固定上游與 Overlay 套用後的安裝工作區。
- `scripts/install-browser.mjs` 在新工作區下載上游、套用 Overlay、安裝 npm 套件及建置網頁。
- `scripts/apply-overlay.mjs` 在任何寫入前檢查固定 commit 及未套用狀態，不可在既有安裝重跑。
- 根目錄 `npm run dev/build/preview` 直接使用既有工作區，不重新下載或重套 Overlay。
- `scripts/start-gods-eye-browser.mjs` 啟動／沿用本機 provider service，再開啟 Chrome。

底圖、CCTV、OSM 和 AI 服務依賴本機 HTTP providers。雙擊 HTML 或 GitHub Pages 純靜態部署無法提供完整功能。

## 程式啟動與金鑰邊界

`src/main.js` 由安裝腳本加入台灣版啟動掛鉤：

1. 本機 `/api/taiwan/ai/runtime` 提供 Google Maps／Cesium 瀏覽器 SDK 所需設定。
2. 呼叫上游 `createStandaloneApplication()`。
3. 等待 `application.start()` 完成，取得既有 `components.scene.viewer`。
4. 呼叫 `installTaiwanEdition()` 安裝台灣介面，不建立第二個 Viewer。

`taiwanCredentialStore` 使用 Windows DPAPI CurrentUser 加密保存服務金鑰。OpenRouter／Gemini／TomTom 長效金鑰由本機 providers 使用，不回傳前端、不寫入 JSON 專案或發布內容。公開狀態路由只提供 presence；加密檔案變更後重新讀取，避免舊程序沿用快取。

本機服務只綁定回送位址，敏感台灣 API 檢查來源與 Host。瀏覽器設定檔、LocalAppData 金鑰、風格與使用者記錄不屬於可清理建置產物。

## 圖資範圍與模型顯示

`dataScope.js` 保存選定範圍、官方縣市界及範圍篩選；儲存介面由瀏覽器組合層注入，portable sources 不直接依賴 `localStorage`。飛機、船舶、CCTV 與地震沿用相同明確範圍。

NLSC 建物保留官方 ECEF 來源及原始 modelMatrix，不以相機、屋頂或縣市包圍球推算平移。buildingGeometry.js 解讀街區模型真正頂點底面；buildingAlignment.js 逐圖磚比較目前地形，透過 Cesium 公開 tile.transform 套用可還原的局部展示高程差，不把單一街區差值套用全縣。一次一項、最多256個可見圖磚，資料不一致保留原值，未壓縮模型之外不猜測；地形切換重新取樣，關閉還原 transform。幾何變更使空拍安全認證失效，拍攝中暫停高度校正。`taiwanRelief.js` 與 `buildingDisplay.js` 協調同載：地形使用真實高程 1 倍，保留使用者指定倍率；建物關閉後恢復倍率。兩個圖層可獨立顯示。

建物預設詳細策略 SSE 2，省電 SSE 4；高壓時暫降細節並限制 cache。多個可見服務共享建物 cache 預算。`getLoadingStats()` 提供請求／處理／resident 圖磚、失敗、memory-adjusted SSE 與壓力狀態。`allTilesLoaded` 只代表當前視野及細節等級，不代表整個縣市每棟建物完整載入。

## Resource Governor

Governor 控制應用程式工作量，不修改硬體時脈、驅動或 Windows 分頁檔：

- `viewer.targetFrameRate`、`viewer.resolutionScale`。
- 3D Tiles SSE、cache、overflow。
- 電影相機更新頻率。
- CCTV 排程頻率、同時推論數與 Tiny／Nano 模型策略。

RAM ≥ 88%、Swap ≥ 75% 或 VRAM ≥ 88% 啟動保護；低於恢復門檻後解除，避免反覆切換。一般地圖操作優先，背景 CCTV AI 在高壓時暫停。

## 共用浮動視窗

`floatingPanelManager.js` 管理電影空拍、CCTV 等 non-modal 視窗，提供唯一 ID 實例、拖曳、resize、縮小、隱藏、展開、關閉及有界置頂排序。AI 空間助理亦使用同一可拖曳及可調尺寸視窗；飛機卡註冊共同置頂管理。

縮小與隱藏只改 UI，保留工作；停止保留 UI 並停止工作；關閉停止工作及釋放資源。位置、尺寸與模式在本機保存，viewport 改變時拉回可見範圍。

## 電影空拍與 CCTV

電影運鏡只保留手繪空拍軌跡與自由空拍，由 Cesium Camera、本機平滑路徑與動畫更新完成。aerialFlightPlanner 產生有限結構資料；aerialCollisionSystem 在移動前對機身安全體積查詢最高細節地形／建物與連續路段，未知時阻擋。aerialRecording 只複製地圖畫布錄製 WebM；路徑、影片及 metadata 存入既有記錄。手動操作不依賴 AI Key；語音只呼叫已註冊的 Camera Command，不執行模型產生的 JavaScript。

CCTV 本機流程為畫面 → YOLOX ONNX Worker → 分類／Bounding Box → 設定檔門檻統計。影像保留於本機，不因缺少 AI Key 而禁用。CCTV 視窗只保留監看與一鍵辨識，固定 Frame A 及完整結果送至同一 AI 空間助理。僅本機 Tiny→Nano 皆失敗時，依使用者指定流程改用免費外部模型；結果明示辨識方式。在助理追問事故、積水等語意問題時，顯示外部服務提示後分析同一截圖。停止／關閉取消工作；畫面與結果按 camera ID 對應，不串台。

## 語音操作工作週期

逐字稿 → 需求／待補請求 → 確認必要缺漏 → 共用工具列操作 → 核對結果 → 播報完成 → 等待下一個指令。

- `voiceScope.js` 支援全臺與 22 縣市、可唯一判定的簡稱；「新竹」「嘉義」需區分縣市。
- `layerVoiceActions.js` 接續待補範圍及候選確認；完整圖資＋區域直接執行。模型自行填寫的範圍不取代使用者確認。
- `geminiLive.js` 保留逐字稿與執行中回合，處理事件晚到、去重、取消與停止。已完成結果不當成新使用者請求再次生成。
- `labelAnnotations.js` 使用既有 Viewer handler 放置及拖曳標籤，更新 GeoJSON 座標。
- 語音風格與文字風格分開，透過瀏覽器儲存與本機版本備份合併；成功保存才回報。

## 專案與記錄

JSON 專案保存圖層、樣式、來源、分析與標註；匯入先解析，再替換目前工作區並停用即時 feeds。Dexie 保存本機工作資料，JSZip 用於多筆 Markdown 記錄匯出。對話記錄暫存在目前瀏覽器，清除網站資料前應匯出。

## 清理與驗收

清理範圍與實際結果見 `docs/browser-only-cleanup-20261004.md`。不清理 release、Chrome profile、使用者金鑰、官方 DTM、模型或 Whisper。建置／語法／邏輯測試不等於真實 3D 畫面、來源可用性與使用者麥克風驗收；各項需分別記錄。

## v23 語音與規劃服務

Gemini Live 以本機 DPAPI Key 取得單次短效 token，前端使用 v1beta SDK。geminiLivePolicy.js 白名單只允許兩款使用者指定模型。3.8 可帶語言與詞彙提示；3.1 使用基本 inputAudioTranscription。Google Search 不隨 Live 初始化，近期新聞透過有限 search_public_news → 本機 /voice-news → 公開新聞 RSS；外部內容只作資料，不可成為工具指令。/gemini-status 不消耗生成額度，不虛構限額；/gemini-models、/gemini-probe 為本機受限診斷，不回傳長效 Key。

OpenRouter /planning-models 取得所有文字模型，/chat-stream 的 planning 選项明確選定模型才可使用該付費模型。一般對話及所有自動備援仍維持 max_price=0。AI 僅回傳固定版本與有限欄位，不可改手繪 XY，不執行模型生成程式；本機碰撞再次驗證通過才啟用開拍。
