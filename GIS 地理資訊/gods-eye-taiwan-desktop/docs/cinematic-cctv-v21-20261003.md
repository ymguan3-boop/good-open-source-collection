# v21 電影空拍、CCTV 本機辨識與記錄驗收

日期：2026-10-03。範圍：本機 Overlay 前端 Phase 1。狀態：Phase 1 前端已實作並通過下列本機／瀏覽器驗收；原生 EXE、實體麥克風與長時間穩定性未列為已驗收。

## 修改與新增檔案

本次修改既有檔案（工作目錄另有先前變更，不能將全部 git dirty 清單當作本次變更）：

- `overlay/src/taiwan/ui.js`：入口、移除查核行程、路線樣式、相機工作互斥、CCTV 保存。
- `dataScope.js`、`index.js`：儲存介面注入，保持範圍恢復與篩選，讓 portable source 不再直接存取 localStorage。
- `navigation.js`：虛線顏色／粗細持久設定及相機接管回呼。
- `flightObservation.js`：觀察視角切換前停止電影相機。
- `cameraPath.js`：只有持有相機時停止／取消相機，保留手繪並隱藏播放線。
- `cctvWall.js`、`cctvWallViewer.js`：統一嵌入專屬浮動視窗、12 路串流、凍結結果影格、本機／深度分析、再次辨識／清除／儲存。
- `chatArchive.js`：CCTV 文字及截圖 MD 保存、預覽、匯出；加入共用置頂管理。
- `geminiLive.js`：固定 Camera Command 工具橋接。
- `taiwan.css`：嵌入式 CCTV、框線及緊湊介面。
- `overlay/package.additions.json`、`scripts/apply-overlay.mjs`：ONNX Runtime 相依與本機資產複製。
- `README.md`、`THIRD_PARTY_NOTICES.md`、`DEVELOPMENT-STATUS.md`：功能、授權與驗收狀態。

新增模組：

- `floatingPanelManager.js`、`floatingPanels.css`：共用非模態視窗管理。
- `cinematicCamera.js`、`cinematicCameraPaths.js`、`cinematicCameraPanel.js`：6 模式、平滑路徑、Camera Keyframe、專屬 UI。
- `cinematicVoiceCommands.js`：有限指令解析／執行，不接受 AI JavaScript。
- `cctvLocalVision.js`、`cctvVisionWorker.js`、`cctvVisionMath.js`、`cctvVisionConfig.js`：本機模型推論、前後處理、可配置壅塞。
- `cctvInferenceScheduler.js`、`cctvVisionPanel.js`：輪詢、降載、結果／清除競態與 UI。
- `overlay/public/models/`：官方 Tiny／Nano、同版 ORT Asyncify MJS/WASM、完整授權及雜湊來源。
- 本驗收 Markdown。測試腳本與影像置於 ignored `logs/`／`.work/`，不把測試按鈕發佈至正式前端。

上述 JS 檔案皆位於 `overlay/src/taiwan/`，保留上游架構與固定上游版本。

## 套件、License、API 與費用

|項目|版本／來源|License|必要費用|
|---|---|---|---|
|ONNX Runtime Web|1.30.0，Microsoft 官方 npm|MIT，另附第三方 notices|無|
|YOLOX-Tiny/Nano ONNX|官方 0.1.1rc0 發布|Apache-2.0|無|
|CesiumJS Camera|沿用既有相依|沿用既有授權／notices|電影相機無新增服務費|

沒有新增雲端 API、Camera API、訂閱、Mapbox、LoRA 或付費推論依賴。新增本機靜態模型／WASM 資產 URL；既有 TomTom、底圖、Gemini、OpenRouter 服務仍依原本設定與供應商條件。深度分析保留選用外部 AI，不是本機辨識前提。核心相機與本機辨識在無 AI Key 時仍可操作；Google 等特定底圖的服務條件不能等同核心免費。

來源與校驗見 `overlay/public/models/PROVENANCE.md`／`provenance.json`。Tiny SHA-256 `427cc366d34e27ff7a03e2899b5e3671425c262ea2291f88bb942bc1cc70b0f7`；Nano `c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d`。

## CPU／GPU 降級

- Worker 優先 WebGPU，初始化或推論失敗改 WASM／CPU；WASM 單執行緒，不需跨來源隔離。停止與真正關閉 terminate worker，釋放模型／tensor／影格。
- 省電 1 路／5 秒／Nano；平衡 2 路／3 秒／Tiny；即時 2 路／1.5 秒，硬體能力不足不開放，WASM 時回平衡。
- Governor 壓力改 Nano、1 路／8 秒，背景分頁暫停背景辨識。電影相機更新平時 40 Hz、省電 20 Hz、壓力 10 Hz；影像解析度及圖磚細節沿用現有 Governor。
- 12 路影像與 1–2 個推論槽位不同；每路完成後才起算取樣間隔，沒有承諾 12 路均達固定 FPS。

## 已驗證的結果

### 電影相機

- 實際 Cesium 數學＋mock Viewer：六模式、等距路徑、暫停／恢復／停止、安全高度、零位移 Keyframe、相機未接管時的 stop/destroy 全通過；326 次相機更新。
- 真實瀏覽器／Google photoreal：自由、環繞、航點、沿線、揭露、俯衝及 Keyframe 播放通過；各模式相機接管／暫停／停止恢復輸入通過，252 次實際 postRender。
- 真實 Cesium Terrain＋NLSC 正射環繞、NLSC 3D 建物自由空拍通過；OSM 道路 18,342 筆／46 點沿線、河道 9,881 筆／2 點沿線、官方鐵路 384 筆／21 點沿線通過。
- 真實 TomTom 219 點／12,107 公尺路線：行車 2.2 秒、停止及切换電影沿線通過。全臺真實航機 885282：第三→第一→第三→停止通過；一般 Cesium 輸入在停止後恢復。宜蘭縣範圍當時沒有航機回傳，改以全臺來源驗收，未以合成航機替代。
- 可調顏色與粗細的設定在正式版重開仍沿用；AI 查核行程區塊已移除，手動路線／中途點／導航保留。

### CCTV 模型與排程

- 官方 COCO 照片 23 張 × Tiny/Nano 共 46 次真實 WASM 推論，以 score ≥0.35、IoU ≥0.3 檢查六類均至少一次正確匹配。Tiny：person 3/3、bicycle 3/3、car 2/3、motorcycle 3/3、bus 2/3、truck 5/8；Nano：2/3、3/3、1/3、3/3、2/3、4/8。遮擋與部分車身有漏判，這不是 precision/recall 或台灣 CCTV 準確率。
- 最終同版 Asyncify WASM：12 張真實官方 CCTV 快照，12/12 成功、0 串台、peak concurrency 2，總 8.11 秒，單張約 0.8–1.71 秒。此項為 Node Web WASM 真模型／真影像，不冒稱連續瀏覽器總覽驗收。
- 瀏覽器：1850 支目錄、本頁 12 路取得官方影像；Governor 壓力下 Nano/WebGPU 辨識；部分來源會 `terminated` 後重連，沒有以合成畫面替代。
- 瀏覽器強制無 GPU WASM：同一官方 CCTV，backend=wasm，679.8 ms，汽車 1。
- 取消／停止／重啟測試：12 個排隊／執行中 Promise 全數 Abort，沒有晚到結果，重新啟動可用。
- 清除測試：抑制單路自動取樣、即時 resume 仍不回填舊結果、其他路持續；排隊及執行中的手動 Promise 不懸掛。

### 最新 CCTV 結果功能

- 真實畫面中「清除結果」清空當路結果、保留影像；「再次本機辨識」取得更新時間與統計。
- 「儲存至記錄」後清單顯示 `2026-10-03_19-46-35-161.md`；開啟可見攝影機、位置、來源、時間、六類數量、壅塞、模型／backend，以及同時刻截圖。
- 實際下載 MD 24,602 bytes，核對內嵌 JPEG、汽車數量與判斷時間。CCTV 暫存於所在 browser origin；未自動搬移使用者既有對話。
- 每個深度分析保留其原始影格／時間，即使後續本機再次辨識更新影格，保存時也不將兩次判斷的截圖混用。

### Floating Panel

- 共用 manager 單元：唯一實例、縮小／展開／隱藏／喚回、關閉停止、320×200 viewport clamp、尺寸／模式持久、5000 次 bounded z-index、既有視窗釋放、listener／ResizeObserver 清理通過。
- 實際瀏覽器兩視窗：開啟、resize API、縮小、隱藏、喚回、展開、關閉、重新開啟與單一實例通過。
- 真實指標拖曳及原生 resize 通過：CCTV 380×420→504×467；電影視窗 380×420→334×368。兩者同時存在、點击置頂、縮小／隱藏不終止工作、停止與關閉分開；重複入口沒有新增實例。
- 瀏覽器 viewport 在測試中由 1280×720 改為 665×524，兩視窗仍可見。重新整理後恢復相同位置／大小／expanded 模式：CCTV (153,49,504,467)、電影 (234,69,334,368)。

## 12 路瀏覽器壓力與限制

- 真實 12 路官方串流＋Google 3D＋自由空拍＋Worker 本機推論：12/12 成功、0 失敗、0 串台，11.149 秒；Governor 高負載改 Nano／1 路，67 次 postRender。推論約 61–588 ms。
- 最大畫面間隔 839.7 ms：首次載入與高記憶體負载時有短暫卡頓，不能宣稱全程毫無延遲。一般介面仍可操作；停止後 active=0，沒有晚到完成數。
- 正式 production 最後複驗：12/12 官方畫面、Tiny/WebGPU 單路完成（冷啟動 2,878 ms），保存 `2026-10-03_20-47-44-459.md`，記錄預覽顯示同時刻統計／JPEG。來源 `terminated` 為串流端中斷，仍自動重連；沒有把模型輸出當作官方交通數據。

## 建置、架構與交付核對

- 最終 Vite production build：成功，1,208 模組；保留既有 large chunk／Tauri import 警告。
- `check:boundaries`：兩項檢查皆成功，portableEntries=42。原本失敗來自既有範圍模組直接使用 localStorage 及 Overlay 模組未登錄 ownership。已改 composition 注入儲存，於 installer 明列 dataScope／Turf、NLSC imagery 與台灣 CCTV 模組；沒有改弱檢查器。
- 儲存回歸：無 storage、全臺／宜蘭恢復與寫入、storage 禁用、壞 JSON、地理篩選通過。
- Canonical／安裝 22 個本次模組一致；模型、runtime 及授權資產 canonical／public／dist 相同。正式 JS 不含 QA_V21／qa-v21.js 測試 hook。
- 修改檔案 whitespace 檢查通過（CRLF 視為合法）。README、THIRD_PARTY_NOTICES、DEVELOPMENT-STATUS 已更新。未將先前 dirty 全部當本次變更提交。

## 驗收證據

本機 ignored 證據，非發布必要檔案：

- `logs/qa-v21/browser-results.json`、`browser-first-pass.json`：瀏覽器 camera、GIS、CCTV、導航、航機、控制視窗及有限語音指令結果。
- `logs/qa-v21/panels-before.json`、`panels-after.json`：重開位置一致。
- `logs/qa-v21/final-cctv-record.jpg`：正式版截圖、統計與記錄預覽。
- `logs/qa-cinematic/core-result.json`、`.work/qa-v21/verify-floating.mjs`：相機與管理器檢查。
- `logs/qa-cctv-local/scheduler-real-asyncify-wasm.json`、`scheduler-clear.json`：真模型 12 路及清除競態。

## 明確回答

|必要項目|答案|
|---|---|
|電影空拍核心完全免費使用|YES|
|CCTV 本機辨識完全免費使用|YES|
|沒有任何 AI API Key 時，電影空拍仍可使用|YES|
|沒有任何 AI API Key 時，CCTV 本機辨識仍可使用|YES|
|電影空拍與 CCTV 各有獨立浮動控制視窗|YES|
|控制視窗支援拖曳|YES|
|控制視窗支援縮小|YES|
|控制視窗支援隱藏|YES|
|控制視窗可以再次展開|YES|
|是否破壞既有功能|NO（已測的 GIS／飛機／導航／一般地圖操作範圍）|

## 未宣稱完成的範圍

- 本次未重新打包原生 EXE，也未實測實體麥克風／Gemini 音訊；有限 Camera Command 解析及內部動作已驗證。雲端深度分析保留既有 Provider，未在本批次實際消耗供應商 API 做完整回覆測試。
- 長時間 RAM/GPU leak 壓力測試與全體既有功能逐項全回歸尚未執行；以上是有限時間的 Phase 1 驗收，不宣稱所有硬體及所有來源無風險。關閉／停止的 worker、listener、tensor 釋放以程式檢查與取消／晚到結果測試驗證。
- ByteTrack／車流方向、通過量、停滯、時間軸與 LoRA 屬後續 Phase 2／3，沒有混入本次 Phase 1 完成宣稱。
