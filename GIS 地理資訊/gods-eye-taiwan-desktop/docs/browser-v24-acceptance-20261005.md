# v24 瀏覽器版修改與驗收（2026-10-05）

## 狀態與驗收範圍

本批次依使用者六項追修需求修改既有 Taiwan Overlay，保留同一 Cesium Viewer 與瀏覽器入口。以下明確區分真實服務／場景、DOM／工具替身及人工項目。**目前仍有待補驗收，不標示全部工作完成。**正式建置與本機部署結果見下表；GitHub 狀態見 GITHUB-STATUS.md。人工裝置與長時間壓力驗收尚未全數完成。

前次完整成果見 [v23 驗收](browser-v23-followup-20261004.md)；CCTV／航機／原有圖資的歷史驗收仍保留，不把舊結果當作本版已全部重測。

## 修改內容與主要檔案

|模組|本次內容|主要檔案|
|---|---|---|
|語音|四種回覆角色、自然語氣、原生音訊排程；保存後重新啟動已啟用 session|`voiceProfiles.js`、`voiceSettings.js`、`geminiLive.js`|
|地點 HUD|實際名稱、自適應寬度、緩慢閃爍、三秒移除、重複飛行取消舊 timer|`labelStyles.js`、`geminiLive.js`|
|導航|只顯示完整 GLB、移除模型圖示／文字、三色分交通方式保存|`navigation.js`、`navigationDisplay.js`、六個車身材質變體|
|浮動視窗|既有工具列、航機、導航、記錄與金鑰視窗共用拖曳／−縮小／□展開、有界置頂|`floatingPanelManager.js`、`floatingPanels.css`、`ui.js`、`chatArchive.js`、`providerSettings.js`|
|空拍|兩模式不同顏色、合併 AI 規劃按鈕、範圍預載、有限距離障礙查詢、拍攝介面隱藏、Esc 不自動下載|`cinematicCamera.js`、`cinematicCameraPanel.js`、`aerialDrone.js`、`aerialSceneReadiness.js`、`aerialBoundedPicking.js`、`aerialCollisionSystem.js`|
|必要重啟|工作區／對話保存後重載 Viewer；JSON 專用附檔；保存失敗不重載|`applicationRestart.js`、`providerSettings.js`、`ui.js`、`chatArchive.js`|
|文件／重製|目前操作、架構、授權與本文件；原模型材質重製|`README.md`、`ARCHITECTURE.md`、`DEVELOPMENT-STATUS.md`、`THIRD_PARTY_NOTICES.md`、`scripts/build-vehicle-colors.py`|

新增執行模組包含 `voicePcmPlayback.js`、`voiceProfiles.js`、`applicationRestart.js`、`aerialSceneReadiness.js`、`aerialBoundedPicking.js`；新模型為 `taiwan-car-{blue,red,white}.glb`、`taiwan-scooter-{blue,red,white}.glb`。原始車／機車／無人機 GLB 及 Blender 原稿保留。

## 已完成驗收

|項目|方法與結果|限制|
|---|---|---|
|工具列六選項視窗|真實瀏覽器逐項開啟、縮小至約 46 px、展開與標題拖曳：PASS|其他專屬視窗及不同解析度仍列於補驗收項目|
|霓虹地點 HUD|真實瀏覽器標籤約 254×94 px，顯示名稱，約 3.2 秒後消失：PASS|3 秒為程式計時，觀測與畫面排程會有少量差距|
|HUD 生命周期|替身計時器檢查三秒、慢閃 alpha、重複啟動只一個 timer、飛行前取消、移除釋放：PASS|不冒充實體語音操作|
|兩款 Gemini 四角色|同一保存 Key，`gemini-3.8-live`／`gemini-3.1-flash-live-preview` × 四角色：8/8 回傳真實原生 PCM|未使用實體麥克風；自然程度及兒童角色需主觀聆聽|
|語音政策與播放|20/20 SDK／音訊／provider 替身案例：PASS|不是本批次真實 Gemini ASR，也不是實體喇叭驗收|
|宜蘭手繪空拍|真實 NLSC 建物＋台灣地形、約 114 m 手繪路徑、OpenRouter 規劃與 97 點幾何預檢通過；約 15 秒影片完成並存入記錄：PASS|單一路徑抽驗；不是整縣完整建物或所有長路徑證明|
|最終手繪版本|弧長取樣優化後再抽真實 71 m 路徑，48 個位置及連續路段通過並可開拍：PASS|不同於前一條114m路徑，沒有把不同路徑點數當作效能對照|
|自由空拍與影片|真實 64 px 機身可見，拖曳後螢幕位置640→740px、原點改變；合併確認起飛、49秒錄影後Esc停止，1280×720預覽及記錄：PASS|本次懸停抽驗，所有方向鍵與不同來源另列人工|
|拍攝介面|真實拍攝中的shell可見元素只剩tw-topbar；右上Esc提示；停止後還原：PASS|保留必要圖資 attribution；另補隱藏 #toast，原生 CSS 模擬開始 hidden／停止 visible 通過；零延遲不保證|
|聲線設定保存|真實UI四角色可選，男聲保存後讀回male，測後還原女聲：PASS|已關閉麥克風時不擅自開啟|
|金鑰設定視窗|真實開啟、46px縮小、展開及橫向拖曳：PASS；修正舊Modal樣式造成主shell被隱藏|未重新輸入或改寫使用者真實Key|
|導航材質變體|6/6 GLB 只改 paint 材質；所有網格、binary buffer、輪胎／玻璃／燈具維持原樣：PASS|實際白色機車近／遠渲染已抽驗；其他色彩人工確認|
|導航控制邏輯|10 項替身檢查：顏色立即套用、兩交通方式分別保存、無 billboard／label、minimumPixelSize 且無 maximumScale：PASS|真實路線六種交通方式／顏色組合已檢查；全組合主觀視覺另列人工|
|共同視窗／provider 接入|17 項 DOM 替身：縮小保留工作、展開、拖曳限界、有界 z、handler 釋放；provider 同 host、X 原流程、parent 還原：PASS|真實金鑰視窗已通過縮小／展開／拖曳；沒有代填使用者 Key|
|重啟與附檔|替身重啟順序、同時要求合併、保存失敗不 reload、可重試；實際 JSZip 打包 MD＋`restart-project.json`：PASS|另通過同一重啟協調器的真實頁面重載與記錄保存；沒有代填 Key|

|導航真實渲染|TomTom 路線、汽車／機車三色 URI 與設定保存共六組；白色機車 200 m／5000 m 俯視可見完整模型，無模型專屬 billboard／label：PASS|遠距採純顯示縮放及抬高，經緯度／路線不變；其他色彩主觀確認另列人工|
|真實必要重啟|觸發正式重啟協調器，頁面重載，記錄仍有重新啟動前工作區與 restart-project.json：PASS|驗收未重新輸入使用者真實 Key；實際保存 Key 的條件分支有邏輯測試|
|正式 4175 頁面|真實正式 dist 啟動、四角色選單及縮小／展開 PASS；bundle 掃描不含四個 QA 掛鉤標記|沒有驗收按鈕；保持語音未啟動|
|最終建置／邊界|全新固定上游＋Overlay：1222 modules、46.25 秒 build PASS；905 modules／60 portable entries 邊界檢查 PASS|大型 bundle 的既有 chunk 提示保留，不影響建置成功|

本機原始 JSON、合成音訊、截圖及 QA 掛鉤保留在未發布的驗收資料夾，不作為 GitHub 必備執行檔。以上表格提供可公開的測試方式與結果摘要。

## 故障原因與改善方式

### 障礙資料一直等待

「畫面已看到建物」不代表最高細節的整條查詢範圍已載入。Cesium 官方說明 `allTilesLoaded` 只表示當次視野符合 SSE 的圖磚已載入；cache 也會淘汰非當前視野圖磚，不能以此宣稱整縣模型已完整備妥。[Cesium3DTileset 官方說明](https://cesium.com/learn/cesiumjs/ref-doc/Cesium3DTileset.html)

本機檢視及實測發現，最高細節 picking 的離屏相機可保留過大的 far，讓射線涉及過多圖磚。新增適配器限制本次 preload／pick 的查詢距離、開拍前預載路徑範圍及保存已驗證的連續路段認證。沒有要求使用者重新勾選相同圖資，也沒有以 AI 或假地形跳過幾何檢查。`sampleHeightMostDetailed`／查詢支援及 exclusions 仍依既有 Cesium scene 能力處理。[Scene 官方說明](https://cesium.com/learn/cesiumjs/ref-doc/Scene.html)

適配器含私有介面，僅允許已驗證的 Cesium **1.138.0** 與介面形狀，異動時回報 UNKNOWN；租約結束還原原值。版本保護與維護要求見 [ARCHITECTURE.md](../ARCHITECTURE.md)。不能以這次 114 m 路徑成功保證任意來源、遠距或長路徑永遠可拍。

### 拍攝過程串流造成停頓

目前使用拍攝範圍預載、短暫 cache／移動請求政策租約與已驗證路段認證，減少拍攝期間重複最高細節網路查詢。Resource Governor 持續管理快取、解析度與更新頻率。官方圖資離線、硬體不足及超出已準備範圍仍可能停頓；不能保證零延遲。使用者可先確認較小拍攝範圍及較短路徑，再分段錄影；未知幾何仍會阻擋。

### Key／風格保存後套用

Google／Cesium 憑證需重建 Viewer 時保存工作區及對話，再自動重新載入；原工作區匯出為真正的 `restart-project.json`。OpenRouter／TomTom Key 由本機新請求使用；Gemini 角色／風格／Key 重新連線已啟用 session 即可，不自動開啟未啟用麥克風。保存工作失敗會留在原視窗並明示金鑰已儲存但重啟未完成。

## 待補驗收與人工操作清單

- 自由空拍：本次已驗模型顯示、拖曳、合併起飛、懸停錄影、Esc、預覽與保存；請人工操作 W/S/A/D/I/K/J/L、Ctrl 調整角度，以及不同地形／來源的阻擋。
- 拍攝：兩模式隱藏介面與停止還原已抽驗；請人工檢查長路徑、切換視窗、失焦、不同攝影角度及長時間錄影。
- 服務金鑰：視窗操作及真正頁面重載／工作保存已抽驗；日後由使用者更新有效 Google／Cesium Key 時確認重建地圖。AI 角色／風格以重新連線已啟用 session 套用。
- 導航：六種交通方式／顏色設定及白色機車近遠渲染已抽驗；請人工確認其他五組完整模型的外觀，摘要拖曳／縮小／展開及不同解析度。
- 語音：請在使用者裝置實際說話、插話及聆聽四角色自然程度；兒童角色為成年預設聲線配合角色語氣，沒有假稱獨立兒童模型。兩模型原生音訊成功不代表實體麥克風驗收。
- 回歸：CCTV 本機／選用雲端流程、12 路與空拍拍攝同時使用、飛機第一／第三人稱、OSM、NLSC 特定區域對齊、JSON 匯入／匯出、不同 viewport 及長時間記憶體／GPU 使用。本版未重新完成全部歷史壓力驗收。

語音其他功能人工清單沿用 [voice-v22-manual-checklist](voice-v22-manual-checklist-20261004.md)，其中舊模型額度判斷已由 v23 修正。

## 相依、授權、API 與費用

本批次沒有新增執行套件、外部服務 API 或必要付費依賴。原創 Canvas HUD、六個車身材質變體及重製腳本採專案 MIT；既有 Cesium Apache-2.0、JSZip MIT、Dexie Apache-2.0、YOLOX Apache-2.0、ONNX Runtime MIT 及供應商 attribution 保留。Gemini／OpenRouter／地圖服務沿用既有條款及額度，選用付費模型仍可能計費。[完整第三方說明](../THIRD_PARTY_NOTICES.md)

CPU／GPU 降級沿用 Resource Governor 及 CCTV WebGPU → WASM、Tiny → Nano／減少背景推論。空拍不依賴雲端 GPU；高壓時降低解析度、更新頻率與圖磚預算，不以降低碰撞要求取代驗證。

|確認項目|目前答案|
|---|---|
|電影空拍核心免費／無 AI Key 可手動使用|YES|
|CCTV 本機辨識免費／無 AI Key 可使用|YES（本批次未重新完成 12 路回歸）|
|電影空拍與 CCTV 各有獨立浮動視窗|YES|
|視窗支援拖曳／縮小／隱藏／展開|YES；本版真實六工具列視窗已抽驗，其餘補驗中|
|是否已完成所有必要驗收|NO；待補項目列於上節|
|是否已確認所有既有功能均未受影響|NO；仍需完成回歸，不代表已發現全部功能故障|

README、架構、第三方授權與開發狀態已更新。發布不包含 QA 掛鉤、Key、音訊、工作區備份或本機日誌；工作區備份僅留在使用者瀏覽器與本機記錄。
