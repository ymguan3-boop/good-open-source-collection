# Development status — 2026-10-05

## v24 追修與驗收（最新）

四聲線角色、霓虹三秒地點 HUD、只顯示 GLB 的導航三色、工具列視窗共用拖曳／−縮小／□展開、合併手繪 AI 規劃流程、有限距離 Cesium 障礙查詢、拍攝範圍預載、Esc 不自動下載及必要的設定重啟已實作。

- 真實瀏覽器：六個工具列選項縮小約 46 px、展開與拖曳 PASS；霓虹約 254×94 px、約 3.2 秒消失 PASS。
- 同一 Gemini Key：兩款模型 × 四角色 8/8 原生 PCM PASS；20 項 SDK／音訊／provider 替身 PASS。未驗收實體麥克風及主觀自然程度。
- 真實宜蘭 NLSC＋台灣地形：114 m 手繪路徑、OpenRouter 規劃、97 點幾何檢查與約 15 秒影片存記錄 PASS；不代表全部區域與長路徑通過。
- 六個車身 GLB 只改 paint，網格／binary buffer／其他材質保持完整；導航邏輯 10 項 PASS。
- 既有視窗／provider 共用接入 17 項替身 PASS；重啟、專用 `restart-project.json` ZIP、HUD timer 取消／釋放整合 6 項 PASS。
- 最終手繪 71 m／48 位置幾何檢查與開拍 PASS；自由模型可見／拖曳、49 秒懸停錄影、1280×720 預覽、Esc 停止與記錄 PASS。拍攝時只留品牌與 Esc 提示，保留來源 attribution。
- TomTom 六種交通方式／色彩設定 PASS；白色機車 200 m／5000 m 完整顯示 PASS。遠距使用純顯示縮放與抬高，地理路線不變。
- 真實重啟協調器重載頁面並保存工作區記錄及 JSON 附檔 PASS；未代填真實 Key。
- 正式 build 1222 modules／45.37 秒 PASS，boundary 905 modules／60 portable entries PASS。
- 實體麥克風／主觀聲音、其他模型色彩視覺及長時間回歸仍列人工驗收，不標示所有必要驗收完成。

詳細內容與待補清單見 [v24 驗收](docs/browser-v24-acceptance-20261005.md)。以下各日期與版本保留為歷史紀錄，當前狀態以本節為準。

## v23 最新抽驗（2026-10-04）

同一 Gemini Key 已通過兩款模型各4項真實音訊辨識，3.8另有6項功能／地理歷史／新聞對話。撤回 Key 整體耗盡診斷；移除搜尋初始化設定並修正3.1逐字稿設定。自由／手繪拍攝、影片保存刪除、導航遠距與摘要拖曳、字幕及父子圖磚還原已補驗；NLSC特定長路徑最高細節查詢逾時保持UNKNOWN，不宣稱安全。正式boundaries及build通過。完整範圍、相依、降級及人工清單見 [v23驗收](docs/browser-v23-followup-20261004.md)。

## 歷史開發狀態 — 2026-10-04

## v22 瀏覽器版驗收進行中（2026-10-04）

正式語音工具＋真實圖資adapters抽驗PASS：宜蘭NLSC 3D建物、嘉義市道路4932筆，以及未指定範圍的水系接續「全台灣」75103筆；完成後pending=null。此為文字逐字稿直接進入工具，未經ASR。

最新狀態以本節為準；後面的原生桌面內容為歷史紀錄。本次只保留瀏覽器介面及回送位址 Node providers。原生來源、Rust cache 及舊啟動檔已可回復封存，保留使用者設定、金鑰、Chrome profiles、官方資料與模型。

- 真實宜蘭 NLSC＋台灣地形同載：官方 matrix 不變，實際地形倍率 1，原設定 3 保留；資源壓力限制明示。
- 真實 TomTom 汽車／機車兩段路線、彩色 GLB 行進與停止：PASS。移除行車 GPS／AI 查核行程規劃，保留路線及自訂虛線顏色／粗細。
- CCTV 12 路一鍵本機 WebGPU、Frame A 回呼、同一助理、攝影機／request 去重、JPEG ZIP 與 metadata：PASS；11.87 秒、96 次繪製，最大主執行緒心跳間隔 237.1 毫秒。停止後 active=0。
- 同一真實 CCTV 固定截圖的 Nano／Tiny WASM：PASS，545.4／1157.4 毫秒；關閉 worker，沒有外部影像上傳。
- 手繪／自由空拍 8 項真實場景抽驗 PASS，含 NLSC 屋頂、外牆兩安全端點連續穿越、低FPS放大安全體積阻擋、地形侵入、路徑抬高重檢、播放／暫停／繼續／停止、720p WebM 與實際路徑儲存；轉角、夾縫及真實山坡補驗4項PASS；實際影片記錄播放與ZIP匯出PASS。
- OpenSky兩架真實航機第一／第三人稱往返PASS，同一選取、追蹤模型及安全標示保留。
- 共用浮動視窗 handler、尺寸／位置保存及各狀態：PASS；另通過正式版AI／CCTV原生拖曳及CCTV resize；仍區分合成按鍵與實體操作。
- 語音邏輯 7 類各2項共14 PASS；後續已確認 Google Search 設定導致quota錯誤、3.1特殊ASR設定無回應；相同Key修正後兩款模型各4項真實ASR抽測PASS。未代表實體麥克風驗收。人工清單：docs/voice-v22-manual-checklist-20261004.md。
- 全新固定上游 checkout＋Overlay 套用、npm安裝、boundary檢查與正式build：PASS；npm安裝用 --ignore-scripts。現用最終正式建置1211modules、49.62秒PASS，正式bundle不含QA掛鉤。GitHub發布待真實語音抽驗完成。

必要項目未全數通過前，本批次不標示完成。詳細紀錄見 docs/browser-v22-acceptance-20261004.md。


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

## 2026-10-02 v16 互動與對話修正

已加入語音範圍確認、航機視窗與標籤拖曳、觀察視角切換修正、免費文字模型輪替、記錄緊湊排版及本機風格備份。瀏覽器互動、故障注入與獨立設定保存已檢查；前端建置及 Rust cargo check 結果與原生／麥克風待驗收項目見 [修改紀錄 v16](docs/browser-fixes-v16-20261002.md)。

## 2026-10-02 v17 語音範圍接續

修正待載入請求遺失、scope漏傳、逐字稿與工具事件不同步及繁簡字／同音誤字。事件重播、22縣市解析及實際Gemini Live合成語音抽測通過；載入介面用替身，未以實體麥克風驗收地圖變更。正式建置通過，桌面EXE未重新打包。見 [v17驗收](docs/voice-scope-fixes-v17-20261002.md)。

## 2026-10-03 v18 語音操作工作週期

放寬口語區域回答與縣市簡稱、接續待執行圖資、修正已載入圖層的範圍比較及執行中回合被晚到工具替換的問題。完成後由程式回報實際工作，不重新啟動詢問；地點定位新增可管理、拖曳的標籤。實際Gemini Live合成語音與正式圖資載入器已抽測全臺道路、宜蘭水系、新北市道路；地點標示與拖曳畫面已檢查。未宣稱實體麥克風及桌面版完成驗收。見 [v18驗收](docs/voice-workflow-fixes-v18-20261003.md)。

## v21：電影空拍與 CCTV 本機辨識（2026-10-03）

Phase 1 前端已實作並完成下列驗收：共用 Floating Panel Manager、6 種 Cesium 電影空拍、Camera Keyframe、有限語音工具、本機 YOLOX Tiny/Nano／ORT Worker、推論排程與 Governor 降載。移除 AI 查核行程；行車虛線顏色／粗細可調並保存。CCTV 結果可再次辨識、清除並保存含截圖 MD 至「記錄」。

Google 3D 六模式／暫停／停止／Keyframe、Cesium Terrain、NLSC 建物、道路／河道／鐵路沿線、TomTom 行車與電影切換、真實航機第一／第三人稱、手動地圖輸入恢復已驗。兩個視窗實際拖曳、resize、縮小、隱藏、喚回、置頂、關閉／重開、viewport clamp 及位置保存已驗。

CCTV 真實 WebGPU 與強制 WASM、六類 COCO 抽測、瀏覽器 12 路與 Google 3D 並行（12/12、0 串台）、停止／清除競態、記錄預覽及 MD 下載已驗。高負載最大畫面間隔 839.7 ms，有短暫卡頓，非全程無延遲。最終 production build 及兩項架構邊界檢查成功，正式檔無 QA hook。

原生 EXE 未重新打包；實體麥克風、選用雲端深度分析及長時間 leak 尚未完整實測。ByteTrack／時間軸屬 Phase 2。詳細檔案／授權／實測數字與 YES／NO 見 [v21 驗收](docs/cinematic-cctv-v21-20261003.md)。

最新補充驗收與剩餘項目：[v23](docs/browser-v23-followup-20261004.md)。
