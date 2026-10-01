# Development status — 2026-09-27

## 2026-09-30 瀏覽器版試用入口

新增專案根目錄 `啟動上帝之眼-瀏覽器版.bat`、Node 啟動腳本與獨立桌面捷徑。批次檔已可啟動／沿用 `127.0.0.1:4173` 本機服務並正常結束；已在瀏覽器實際看到台灣版地圖、使用 `T` 定位台灣、展開工具列及開啟圖資面板。本機 `/api/taiwan/resources` 有回應。此試用入口不啟動 Tauri EXE。預設瀏覽器的自動開啟在目前受限的終端環境未能獨立確認；可直接使用 `http://127.0.0.1:4173/`。Gemini Live、OpenRouter、TomTom 的 Tauri 代理及 Windows 安全金鑰儲存在瀏覽器版不可用。Apex One 對原 EXE 的偵測性質仍未判定。

## 2026-09-29 單一桌面視窗與介面調整

- 台灣版桌面捷徑只開啟或喚回 Tauri 視窗；Vite preview 在隱藏背景程序提供已建置介面及原有 `/api` 路由，不再另開瀏覽器。加入 Tauri single-instance plugin；連續啟動桌面捷徑後，確認原生程序數維持 1，既有視窗可聚焦。
- 圖資、檔案及專案載入時顯示可見的狀態提示；OSM 查詢使用 AbortController。Ctrl+S 停止可取消的載入、導航、語音和鏡頭飛行，並捨棄尚未回傳的 AI 回應。已在宜蘭示範範圍透過 `/api/overpass` 載入道路、鐵路、水系、水域與海岸線五類圖資。
- 右上角改為透明齒輪展開顏料盤選單，含「快捷鍵」說明。左側工具列去背並統一按鈕寬度；面板縮窄、半透明，打開時 Cesium 地圖維持全幅。560×440 視窗中工具列改為橫排，面板置於底部。
- 前端 `npm run build`、Rust `cargo build --offline`、桌面捷徑啟動與再次喚回均已驗證；網頁畫面已檢查 1280×720 及 560×440。第三方即時資料來源與 Gemini Live 的實際金鑰連線未在本次驗收範圍內。

## 2026-09-28 介面與啟動確認

- 使用者指定的透明標題圖與圓形 ICON 已套用；桌面捷徑與 Tauri EXE 使用 `gods-eye-taiwan-v4.ico`，舊版捷徑仍保留舊版路徑與圖示。
- 原版「設定地圖與資料服務」面板整合 Gemini Live、OpenRouter 欄位及申請連結；瀏覽器模式標示桌面版限制，台灣版設定與原版金鑰面板不再重疊。
- 五個內建基礎圖層分別使用橘、黃、青、藍、紫色，圖資清單亦有對應色標。
- 桌面啟動腳本使用專屬 WebView2 資料夾；冷啟動與再次喚回的原生視窗均有回應。網頁版以 390px 與 1280px 檢查標題、快捷鍵、工具列與圖資面板間距；API 實際連線仍須各服務金鑰與即時資料來源進一步驗收。

## v0.2 這次更新

- OSM audit freshness：
  - memory TTL 15 min
  - disk TTL 1 h
  - boundary TTL 24 h
  - 強制 fresh probe + `osm3s.timestamp_osm_base` UI
- CCTV：
  - 保留上游 active frame 10 s cadence
  - runtime freshness probe
  - 僅 `X-CCTV-Source: upstream-image` 判定為直接上游最新 snapshot
  - Street View / synthetic 明確標示 fallback
- 桌面捷徑啟動或沿用隱藏的本機 provider service，開啟或喚回單一 Tauri 視窗；保留 `/api/cctv`、`/api/overpass` 等服務。安全金鑰、TomTom、OpenRouter、Gemini Live 代理使用 Tauri 模式。硬體計數器缺少資料時會標示未提供。
- Gemini Live：
  - `@google/genai` 2.24.0
  - model `gemini-3.8-live`
  - Windows Credential Manager 保存 Gemini 長效 Key
  - Rust 取得 ephemeral token
  - WebView Live Audio + transcript
  - GIS tools：list_layers / fly_to_taiwan / fly_global / create_buffer
- OpenRouter 保留。

## 已做靜態驗證

- 上游 `main` 與 `UPSTREAM.lock` commit 一致。
- Taiwan overlay 所需 `src/main.js` / Overpass / CCTV patch anchors 均存在於目前上游。
- 新 `ui.js` 已通過 `node --check`。
- CCTV upstream source code確認 frame response `no-store`、成功上游 frame header `X-CCTV-Source: upstream-image`、active cadence 10 秒。

## 仍須在實際 Windows 安裝後做 runtime 驗收

- Rust/Tauri `cargo check` / 啟動。
- Google Gemini Live microphone + ephemeral token 真實連線。
- 至少 3 支 CCTV runtime 抽查；第三方 camera 是否在線取決於畞下 provider。
- Intel/NVIDIA/AMD GPU telemetry。
# 2026-09-30 瀏覽器版更新

瀏覽器入口為 `http://127.0.0.1:4175/`。新增 OpenRouter／Gemini Live 本機記憶體金鑰代理、Whisper.cpp 語音輸入、JSON 專案、標註量測及啟動時停止即時圖層還原。服務與 API 金鑰按鈕在瀏覽器模式改為直接開啟台灣版設定面板。

官方 2025 年全臺 20 公尺 DTM 已下載並核對 SHA-256，原始 GeoTIFF 756,870,860 bytes，EPSG:3826；`/api/taiwan/dtm-2025` 已回傳宜蘭 0.1° 視窗的 7,728 個高程樣點（120 公尺抽樣間距）。這是本機格網抽樣顯示，尚非 Cesium 地形網格。NLSC 官方 3D Tiles 清單 GET 實得 35 筆建物服務，宜蘭 tileset 根索引 GET 200；官方 EMAP2 WMS 宜蘭測試圖磚回傳 200 `image/png`。載入按鈕已改為全臺參考圖、視野 DTM、縣市 3D 建物和可用視野 OSM 向量的按需流程。無法存取官方清單時會標示使用 2026-09-30 備援，不隱瞞資料時間。網頁圖磚及全部子模型仍需實際畫面驗收。

Node 本機服務採用 Windows 系統 CA 憑證後，NLSC 35 筆官方服務清單可即時取得（無須使用備援）；瀏覽器中手動將宜蘭建物 tileset 加入圖層。宜蘭完整海岸範圍的 OSM 查詢有 85 個原始 way，瀏覽器實際載入 238 個海岸線圖徵。原本的 502 是 Node TLS 憑證鏈驗證失敗造成，沒有停用 TLS 驗證。

使用者提供的 GeoLibre `map.geolibre.json` 已完成解析驗證：7 圖層、4,082 筆圖徵、4 個預設顯示，保留主要顏色與線寬、讀取地圖範圍。宜蘭海岸線手動載入改以全縣海岸範圍查詢；公開 Overpass 是否成功及畫面連續性仍依當下服務實測。Chrome 模式的 AI 金鑰、語音及 3D Tiles 可見度仍需在使用者瀏覽器實際操作確認。

瀏覽器實際操作確認「服務與 API 金鑰」開啟台灣版金鑰面板；GeoLibre 範例可匯入 7 圖層並套用預設可見狀態。「載入內建全部圖資」已實際加入全臺 NLSC 參考圖、宜蘭視野的 5,839 個 DTM 樣點和宜蘭縣 3D Tiles 圖層；DTM 畫面只渲染 584 個點，保留完整樣點作為高程統計來源，以降低 RAM/GPU 負擔。系統 RAM 達 94% 時會停止後續 OSM 向量查詢並顯示原因。官方 3D Tiles 根索引與圖層加入已驗證，所有子圖磚在不同視角的實際可見性尚未逐一驗收；公開 OSM 向量仍可能受當下服務速度限制。

第一次完整一鍵載入的 OSM 結果：鐵路 3,764 筆，其餘 4 類在 20 秒上限內未完成。已將一鍵向量查詢限制在畫面中心 0.5 度，等待上限調整為 35 秒後重新建置並重試；單項載入仍照原本目前視窗處理。全臺 EMAP2 WMS 是可隨縮放查圖的影像參考服務，不能據此宣稱已下載全臺可分析的道路／水系向量。

第二次一鍵載入結果：河川／水系中心線 9,000 筆、面狀水域 1,317 筆成功；道路、鐵路、海岸線於 35 秒內未回應。圖資面板逐項顯示這些結果，按鈕恢復可操作。前一次曾成功載入鐵路及單獨載入宜蘭海岸線，說明公開 Overpass 回應不穩定；未能驗證同次載入五類可分析向量全部成功。

另將鏡頭移至宜蘭市（約北緯 24.757、東經 121.753）並放大後，瀏覽器畫面可見密集建物模型幾何，不只是在圖層清單出現名稱；這是宜蘭縣官方 3D Tiles 線上圖磚在該視角的視覺驗證，尚未逐縣驗證覆蓋及模型精度。

## 本次追修：原版 API UI、AI、鐵路、DTM 與專案

原版 keySetup 初始化會因正式服務缺少 `/api/setup/status` 而移除 UI；已提供同來源本機僅回報 presence 的狀態路由，AI 寫入仍使用記憶體代理。OpenRouter／Gemini 在原版 UI 可輸入，其餘原版欄位沿用既有設定。中文 `X-Title` 改為 ASCII `X-OpenRouter-Title`，保留 UTF-8 JSON 對話。

已隨附免登入官方鐵路 3,175 筆（台鐵 2,607、高鐵 134、捷運 405、輕軌 29），版本／授權／SHA-256 留於 catalog；全臺鐵路不依賴 Overpass 或 TDX 憑證。圖資列表不重複列出內建圖層，來源更新取代舊圖層；影響範圍仍為子項目。

DTM 路徑直接取原始 20m 格網，宜蘭測試路徑得到 124 個樣點、有效涵蓋 100%、地形長度約 2,444.47m；0.01° 多邊形取得 2,847 個有效樣點、20m 間距。GeoTIFF RasterType 為 PixelIsPoint，原始 tiepoint 座標即第一格樣點，無需半格偏移。大型多邊形上限約 50,000 個包圍框取樣點，路徑至多 2,001 點，明示間距；不是工程測量。

使用附件 map.geolibre.json 完成 7 層／4,082 圖徵／4 可見層、重複匯入仍 7 層、metadata 保留及再次匯出檢查。AI 會收到專案／圖層用途、欄位、數值統計與資料限制。回歸腳本全部通過，正式 Vite build 成功；AI 真實供應商回覆與 Gemini Live 仍需使用者重新輸入有效金鑰後驗證。服務重啟會清除本機記憶體 AI 金鑰。

瀏覽器實際 QA：原版服務對話框可顯示兩個 AI 密碼輸入欄位與免費模型更新；鐵路載入及更新維持 3,175 筆。附件專案實際匯入並重複開啟後仍為 7 個專案圖層（另有手動載入鐵路與測試量測）。未載入 DTM 顯示圖層時，宜蘭 10.976km 距離量測取得 550 個高程樣點、約 20m 間距、100% 有效涵蓋；地形路徑 10.984km，上升 103.3m、下降 110.6m，畫面顯示結果及限制。尚未輸入真實 AI Key，未聲稱真實 AI 回覆驗收完成。


## 2026-09-30 後續九項修正（瀏覽器版）

- 取代先前的服務記憶體金鑰方案：所有原版輸入欄位開放，DPAPI CurrentUser 加密保存在使用者 LocalAppData，重新開啟沿用；AI 金鑰不回傳，Google/Cesium 僅走本機 runtime。未變更 Windows 執行原則。
- OpenRouter 對話改為 SSE，縮小上下文、限定目前專案／單層摘要，在首段文字之前的暫時故障使用免費 router 備援；Ctrl+S 可中止。模型清單排除音訊／影像生成模型。專案切換後不沿用上一個專案的對話資料。
- Gemini Live 修正 SDK convenience getter 與 inlineData 重複播放；插話中斷時清除播放佇列，保留瀏覽器回音消除。
- 專案匯入先解析所有圖層再取代，停止即時資料，CCTV 拒絕相機／URL／程式自動啟用。匯出後提供繼續或清除，完整 JSON Blob 保存於 Dexie 成果，支援切換及重新下載；圖層分析關係與 AI 解讀跟隨匯出。
- 來源清單涵蓋向量、DTM、3D Tiles 與 JSON 匯入，影響範圍／AI 解讀分層顯示。各繪圖工具可選色、顯示節點，點回起點閉合。收合／展開採同一尺寸對齊，齒輪選單縮為 272px 集中排列。
- 已驗：現有 verify-ai-gis-fixes 腳本、真實附件 7 層／4,082 圖徵、DTM 原格網線／面分析、3,175 筆官方鐵路。加密測試使用獨立假金鑰目錄，確認新程序可解密，磁碟沒有明文。SSE 備援與 UTF-8 分段解碼使用模擬供應商。
- UI 已驗：11 個服務輸入框可編輯；專案載入無 CCTV；匯出／清除／成果還原；粉紅多邊形 3 節點與點回起點完成。DTM 實測 5,556 個樣點、高程 0.2–11.1 公尺、平均 5.4 公尺，面積 2.2280 平方公里。畫面證據在 logs/qa-20260930。
- 尚未真實驗收：有效 OpenRouter 金鑰的供應商回覆、有效 Gemini Live 的音訊與使用者喇叭／麥克風回音。服務重啟前的記憶體金鑰無法自動移轉，使用者需在新版本再儲存一次。

最後一次正式 build 後，實際匯出新版 Blob 成果紀錄並重新載入，確認 7 個圖層及各層說明還原，CCTV 仍未啟用。JSON 的公開 3D Tiles／WMS 服務參照及內建來源識別納入保存；這些服務還原仍須連線。成果清單畫面保存於 logs/qa-20260930/project-results.jpg。
