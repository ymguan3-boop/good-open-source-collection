# 架構

## v27 公共運輸與票價模組

`transitPlanning.js` 統一 TripPlanningRequest；`transitPanel.js` 使用同一 Floating Panel Manager，兩種輸入共用一個主要按鈕，完整需求直接由本機 provider 查詢；只有缺漏與歧義才確認。`journeyDisplay.js` 僅操作目前 Viewer 的專屬 DataSource，TripSegments 同時決定路徑與 GLB，與駕車視角／空拍交接相機控制。

`POST /api/taiwan/ai/tdx` 的固定 action 為 status、test、resolve、parse、plan、fare-options、fare-status、fare-update、fare-config。`tdxService.js` 管理 OAuth、快取與時限；`tdxTrip.js` 驗證時間及途經停留；`tdxGeometry.js` 核實官方站序與 Shape，步行／自行車可重用既有 TomTom；`tdxParse.js` 只讓 AI 更新需求，不讓它提供班次或位置。金鑰沿用 DPAPI，不增加明文 env 檔或瀏覽器 token。

未知線形禁止沿線播放、未知票價保留 null。關閉中止請求與模擬，縮小／隱藏保留工作。旅程統計與可選 AI 比較送入既有 AI 空間助理，取消規劃也中止比較串流。背景模型按需載入、退役 Entity 參照最多20件，關閉整個程式時解除 listener／RAF／Governor 訂閱。

`farePreference.js` 是前後端共用乘客／車種／車廂契約；`fareEngine.js` 集中各運具計價與確定性方案比較，`fareWebAdapters.js` 解析高鐵與 YouBike 表格，`tdxFareWeb.js` 解析臺鐵／臺北捷運。`officialFareSources.js` 限定官方來源、公開頁面與 robots 政策，含 origin 排程與 Crawl-delay；`fareCache.js` 保存版本、hash、parser、日期與已驗證單位報價，依設定 TTL 重驗。啟動僅背景檢查過期已使用來源，不抓全網路。每次請求按人數計算，不把 LLM 金額、未核實優惠或快取過期資料標成最新。

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

## v24 視窗、聲線與重新啟動

- `voiceProfiles.js` 以白名單把四種回覆角色映射至既有 Gemini 預設聲線；`voiceSettings.js` 保存角色／模型／風格。`geminiLive.js` 仍只呼叫註冊工具，不執行模型產生的 JavaScript。自然語氣提示與聲線角色不能代替使用者的聆聽驗收。
- `labelStyles.js` 以 Canvas 生成自適應文字寬度的深色矩形白字標籤；每個臨時圖層只有一份閃爍與五秒生命週期。重複地點飛行前取消舊計時器，到達後重啟；移除圖層釋放回呼與計時器。純標籤不屬於 `collisionEnabled` 幾何來源，不使空拍碰撞認證失效。
- `floatingPanelManager.enhanceExisting()` 保留既有對話框及 action handler，加入共同拖曳、縮小與展開。`registerExisting(element,{controls:true})` 將金鑰視窗納入同一 host／有界置頂排序，保留上游 `hidden`／`visible` 與 X 的關閉流程；釋放時還原原父節點。航機標題外包一層 header，避免定時更新文字刪掉控制按鈕。
- `navigationDisplay.js` 選擇車身材質變體；`navigation.js` 分別持久化汽車／機車色彩。原創 GLB 網格與 binary buffer 完全保留，只有烤漆材質改色，沒有整車 tint、額外位置圖示或模型上方文字。
- `applicationRestart.js` 將 Google／Cesium 憑證的必要 Viewer 重建序列化：工作區與對話保存 → 停止工作 → `location.reload()`。重複請求共用 pending promise；保存失敗不停止或重新載入。`chatArchive.js` 以專用 JSON attachments 保存與匯出 `restart-project.json`，不混入空拍影片 metadata。OpenRouter／TomTom 新請求讀取新 Key；Gemini 風格、角色或 Key 只重啟已啟用 session，不自行開啟麥克風。

## v24 空拍範圍準備與 Cesium 查詢相容性

`aerialSceneReadiness.js` 在開拍前沿路徑至多五處視角預載，暫時協調 cache、foveated delay 與移動請求政策，完成後還原鏡頭及相機輸入。快取租約在工作結束釋放；如果 Governor 已改變設定，不覆蓋 Governor 的新值。預載成功僅代表當次視野圖磚準備，不代表官方建物資料完整。

`aerialBoundedPicking.js` 是集中隔離的 Cesium **1.138.0** 適配器。最高細節 picking 的離屏相機若使用過大 far，可沿射線掃描過多圖磚並等待很久；適配器把該次查詢限制為需要的有限距離，涵蓋 preload 與最終 pick。它讀取 `_picking`、`_pickOffscreenView`、`_mostDetailedRayPicks` 等私有介面，因此有以下保護：

- 先核對確切 `Cesium.VERSION` 與介面形狀；不支援時回報未知，不繞過碰撞檢查。
- 非同步查詢使用每個 scene 的單一租約，其他查詢仍執行時拒絕開始；失敗僅清理本次建立的查詢，保留其他呼叫者工作。
- `finally` 還原原 far；未修改上游 Cesium 原始碼或供應商圖磚。
- 更新 Cesium／上游前需重新驗證 preload、pick、取消、逾時與還原；`UPSTREAM.lock` 仍固定 `b210ab0fe4d71c7faa0268134e0aa5f3c53fc7fe`。

`aerialCollisionSystem.js` 建立當次路徑範圍的幾何認證，檢查地形、可查詢建物與連續路段；`cinematicCamera.js` 沿已驗證路段移動，減少每幀重複最高細節網路查詢。來源或幾何變更使認證失效，未知時停止／懸停。自由空拍離開準備範圍仍需檢查。這不是完全下載或凍結線上圖資，也不保證硬體與串流全程零延遲。

錄影期間 `gev-tw:aerial-capture-ui` 僅隱藏操作介面，保留程式標題及 Esc 提示；結束後恢復。Esc 不觸發下載，影片完成仍保存本機記錄。只有手動匯出按鈕下載 WebM。

## v25 規劃參數與已驗空間

`aerialPlanningOutput.js` 定義有限的 `aerial-parameters-v1` JSON schema／parser，按模型支援能力選 structured output 或 JSON object，不支援時使用嚴格本機 parser。格式不合法、越界或空值不當成功；後端最多六候選／120秒，自動備援僅免費。斷線前後都檢查 response 狀態，避免已取消仍推論。一般 AI 空間對話維持既有文字格式。

`aerialAiPlanner.js` 只送拍攝意圖、八個標量與安全回饋；平面位置保留使用者確認的軌跡，本機編譯高度。`aerialFlightPlanner.js` 最多三輪合法參數修正，幾何未知只補資料兩次；測得障礙高程後可本機抬高再驗證，不把模型回答當安全依據。取消訊號涵蓋串流與起飛預檢。

`aerialFreeSpace.js` 保存最多20筆實際驗證的 swept corridor。逐一公尺子段要求兩端在同一已驗膠囊內，利用凸集合確認整段機身體積；沒有把六方向走廊稱為完整安全立方體。來源簽章更新即失效；新方向提前四秒距離查詢，接近已驗邊界平滑減速，尚未完成則留在已驗範圍。停止、暫停、關閉取消查詢並防止晚到結果復活資源。

啟動時讀取金鑰完成後，若使用者已切換底圖，略過較晚抵達的預設底圖切換，避免覆寫正在準備的 NLSC 拍攝場景。


### v26 票價來源與車種確認

`tdxFareWeb.js` 是可替換的官方網站票價 adapter，固定官方來源白名單、禁止跨站重新導向、限定讀取大小／逾時、24小時快取。只從票價表匹配精確起訖與票種；頁面資料不執行，不採用頁面指令。`tdxService.js` 優先 TDX，缺價再補查；連續站內轉乘以整段票價處理。

`traTrainType` 為使用者需求欄位，不由 AI 猜測。臺鐵候選先確認車種，後端以已知車種或唯一日期／起訖／時刻班次核實，與需求不符或無法核實者不得當作成功方案。來源、票種、fetchedAt由後端回傳至既有AI空間助理；unknown不能變成0元。


## 2026-10-06 臺鐵官方票價補查

沿用 `tdxFareWeb.js` 新增臺鐵官方票價試算 adapter。實際車種已核實且使用者已確認後，從官方頁面讀取車站代碼、車種選項與一次性表單驗證值，僅送出一般單程票、成人全票、一般座位的試算；不訂票、不付款。僅接受同起訖、同車種與同日期的唯一金額，12 秒總時限、每頁 500 KB、24 小時最多 32 組報價快取，取消及來源失敗保留未知。表單 Cookie／驗證值只在這次請求記憶體，不回傳 UI 或存入資料庫。官方來源：<https://www.railway.gov.tw/tra-tip-web/tip/tip001/tip114/query>。沒有新增第三方套件、長效金鑰或收費訂閱。班次來自 TDX，補價來源另標為臺鐵官方網站；官方試算採最短里程，實際票價依票面及運行里程。


2026-10-06 時間追修：TDX MaaS 的 depart 是理想時間，連未來指定時間也可能回傳必須提早步行的候選。現在「現在出發」及「指定最早出發」均使用下限後10分鐘的理想搜尋時間，仍以原本出發下限過濾真實候選；指定抵達時間不加此窗口。沒有修改官方時刻、沒有宣稱所有班次窮舉，仍為單次最多三個候選。新增此條件回歸後66/66 PASS。


2026-10-06 AI 比較資料追修：公共運輸只送三個方案的完整結構化摘要、每段班次／起訖／票價與來源，排除地圖座標陣列與表單修改前的原始語句。若路段摘要超過預算，整筆改為明示的方案摘要模式；不得截斷 JSON 使後續方案被誤認缺漏。實測發現原本座標陣列使方案 B/C 遭截斷的問題，已修正。追修回歸為39+28＝67/67 PASS；臺鐵跨線線形及七運具完整真實驗收與發布仍待完成。
