# 瀏覽器版 v22 驗收紀錄

日期：2026-10-04（台灣時間）。狀態：本頁記錄 v22 的已測結果，最新追修及發布狀態以 [v23 補充驗收](browser-v23-followup-20261004.md) 為準。

## 範圍與實際環境

只保留瀏覽器介面及本機 Node providers；沿用固定上游 b210ab0fe4d71c7faa0268134e0aa5f3c53fc7fe。現用入口 127.0.0.1:4175；本機隔離驗收 4176，所有 QA 掛鉤、合成音訊及原始測試輸出都在忽略目錄，不放入正式建置或發布。測試期間 Intel Iris Xe、RAM 約88–95%，Resource Governor 啟用保護。這不是各硬體或各城市的效能／精度保證。

## 已通過的真實來源驗收

|項目|結果與實際證據|
|---|---|
|宜蘭 NLSC＋台灣地形|兩圖層 visible=true、tileset.show=true；官方 modelMatrix 不變。原設定3倍保留，同載採真實1倍高程。畫面已看到大量建物。圖磚 failed=0，部分仍處理中；RAM 壓力下細節被限制，不能宣稱每棟完整。|
|TomTom汽車／機車|各一次真實兩段路線，1183公尺、30座標；3D汽車／機車 GLB2均HTTP成功，1.5秒行進約33.26／31.06公尺。停止釋放RAF及模型。|
|虛線樣式|兩種交通模式保留使用者 color=#369cff、width=2，均為PolylineDashMaterialProperty；可自由調顏色／粗細。行車GPS已移除。|
|CCTV12路|12/12官方畫面，一鍵本機YOLOX-Nano WebGPU；12個唯一requestID與攝影機對應，0串台，沒有以雲端替代列為成功。|
|CCTV固定Frame A|結果截圖逐件等於按下時影像；同一結果只回呼一次；來源、攝影機、尺寸、取得／接收／完成時間保留，攝影機時鐘未提供就標未知。|
|CCTV與助理|完整結果進同一AI空間助理；再次辨識、未送出輸入保留、框顯示切換及固定截圖放大已抽查。|
|CCTV記錄|真正IndexedDB保存與UI匯出ZIP：295884bytes、12JPEG、Markdown及cctv-metadata.json；JPEG逐件等於原固定影像，Markdown不含base64。|
|12路回應|11870.5毫秒、96次Cesium繪製；最大render間隔670.2毫秒、主執行緒心跳最大237.1毫秒；peakConcurrency=1，停止active=0。為12路監看加逐張排程辨識，不是12路同時持續YOLO。|
|CPU降級|同一固定CCTV截圖強制WASM：Nano545.4ms，Tiny1157.4ms；結果皆汽車2，worker釋放，外部影像上傳0。|
|六分類|本機輸出行人／自行車／汽車／機車／公車／卡車6欄；本次官方畫面出現汽車、機車、公車辨識值。其餘類別沒有標註真值，尚不能驗收各類準確率。|

本機結果明示事故、積水、施工與阻斷無法判定；單張物件數及畫面占用率不是官方流量或車速。

## 電影空拍真實幾何抽驗

|案例|結果|證據|
|---|---|---|
|真實官方屋頂取樣|PASS|官方高度查詢49點；屋頂162.79公尺，地形29.00公尺；不是法定建物高度。|
|NLSC 屋頂安全體積|PASS|幾何查詢 UNSAFE，1樣點，1衝突。|
|外牆兩個安全端點間連續穿越|PASS|UNSAFE；兩端各自通過，再檢查46樣點連續路段。|
|低FPS加大安全體積不沿用舊認證|PASS|UNKNOWN；加大安全體積須重新查詢，未知時不允許移動。|
|真實地形侵入阻擋|PASS|幾何查詢 UNSAFE，1樣點，1衝突。|
|v22 舊版穿越建物路徑提高高度重新檢查|歷史 PASS|避開地形／建物：安全路徑高度提高至至少 176 公尺（原最低 157 公尺），49樣點與連續路段重檢PASS。|
|NLSC地形同載手繪播放暫停繼續停止與錄影|PASS|720p 1280×720，WebM 171141bytes，3.55秒，11個實際軌跡點；續拍位移6.17公尺；控制恢復、預覽線0。|
|自由空拍起飛與有限鍵盤前進|PASS|放置／起飛檢查／啟動／合成W按鍵前進／停止；不表示實體鍵盤驗收。|

另已確認真實宜蘭西側地形422.63／421.48／418.81公尺，205樣點路徑侵入被阻擋；90公尺單影格連續安全走廊通過。轉角與夾縫補驗PASS：最高細節3公尺網格確認兩方向邊界／兩側建物，小安全體積1.5公尺通過，而8／10公尺機身安全體積UNSAFE。這是實際幾何測試，不是測量輪廓。

v23 不再本機自動改高程放行；先檢查使用者計畫，不可行才由使用者修改或選用 AI 修正，重檢通過後人工開拍。

碰撞使用最高細節地形／3D Tiles及已註冊模型安全體積，在移動前檢查連續路段。資料未知阻擋；不隱藏NLSC或改成假地形。不保證官方未提供或缺漏模型；使用Cesium私有ray API，升級Cesium需重新驗收。

真實記錄影片預覽播放PASS（1280×720，0.657秒播放進度）；實際ZIP匯出172749bytes，包含原171141bytes影片、flight-path.geojson與flight-metadata.json。OpenSky的CES5008／THA630兩架真實航機第一／第三人稱往返PASS，同一目標及追蹤模型、安全標示均維持可見。

## 浮動視窗

AI空間助理、電影空拍、CCTV均使用同一Floating Panel Manager。已測真實handler與localStorage：尺寸調整、拖曳事件、縮小、隱藏、叫回、展開、500次置頂仍有界、關閉及重新開啟同一實例。合成Pointer capture是測試替身；原生拖曳：空拍(234,69)→(204,99)；正式4175的AI對話(686,86)→(636,126)、CCTV(207,8)→(252,53)，CCTV原生resize由450×508改為490×538均PASS；跨螢幕操作保留人工驗收。電影`?`位於關閉旁，提供兩種模式說明及各6步實例；正式4175入口與兩模式已實際查看。

## 語音抽驗

正式語音工具＋真實圖資adapters抽驗PASS：宜蘭NLSC 3D建物、嘉義市道路4932筆，以及未指定範圍的水系接續「全台灣」75103筆；完成後pending=null。此為文字逐字稿直接進入工具，未經ASR。

7類每類2項共14程式邏輯PASS。v23 已查出初始化 Google Search 工具導致 quota exceeded；相同 Key 基本語音成功，修正後兩款模型各4項 ASR 抽測成功，3.8 另6項語音問答。先前以錯誤判定整把 Key 額度耗盡的診斷已撤回。未驗收清單：[語音人工驗收](voice-v22-manual-checklist-20261004.md)。

## 建置與清理

- 全新上游Git checkout固定commit，Overlay一次套用成功；npm install --ignore-scripts安裝345套件。
- 全新工作區check:boundaries PASS，890modules／60portableEntries；build1211modules，44.47秒成功，僅既有大chunk提示。沒有安裝原生Runtime。
- 現用工作區最終正式建置1211modules、49.62秒PASS；正式bundle未含QA v22掛鉤。
- 桌面來源、Rust cache及舊原生啟動檔11項移至專案外可回復封存，另封存3個.blend1；SHA及還原說明保留。[清理紀錄](browser-only-cleanup-20261004.md)。沒有永久刪除使用者資料。
- 本機金鑰、Chrome profiles、官方DTM、模型、Whisper保留且不提交。

## 第三方與費用

CesiumJS Apache-2.0、YOLOX Tiny/Nano Apache-2.0、ONNX Runtime Web1.30.0 MIT、Dexie Apache-2.0、JSZip MIT。Blender GPL僅開發工具，原創輸出採本專案MIT；不散布車廠照片或Logo。見THIRD_PARTY_NOTICES及模型provenance。

沒有新增必要付費依賴或外部Camera API。空拍／本機辨識不需要AI Key；沿用既有本機AI代理，選用外部免費AI仍需使用者自己的有效Key及額度。原有底圖服務條款與額度維持適用。

CPU/GPU策略：WebGPU→單執行緒WASM；高壓Tiny→Nano、最多1路、背景暫停；空拍auto720p、降低copyFPS與鏡頭更新頻率，保持碰撞檢查；3D Tiles資源限制明示。

## 修改檔案與新增檔案

主要修改：ui.js、taiwan.css、chatArchive.js、cctvWall.js、cctvWallViewer.js、cctvVisionPanel.js、cctvInferenceScheduler.js、navigation.js、geminiLive.js、buildingDisplay.js、serviceLayers.js、taiwanRelief.js、floatingPanelManager.js、cinematicCamera.js、cinematicCameraPanel.js、cinematicVoiceCommands.js；browser-only scripts/package/provider整理由同一工作批次處理。

主要新增：cctvChatResult.js、aerialCollisionSystem.js、aerialDrone.js、aerialFlightPlanner.js、aerialRecording.js、scripts/build-map-models.py、3個GLB、可編輯.blend／驗證資料／預覽。完整發布差異見[v22差異清單](v22-change-list.md)（38修改、47新增、25移除原生來源／產生檔）；此處不把所有歷史修改冒稱本次新建。

README／ARCHITECTURE／AGENTS／THIRD_PARTY_NOTICES／DEVELOPMENT-STATUS已更新；GitHub尚未推送。

## 必要項目回答（驗收尚未完成）

|問題|回答|
|---|---|
|電影空拍核心完全免費使用|YES|
|CCTV本機辨識完全免費使用|YES|
|沒有任何AI Key空拍仍可使用|YES（手動本機）|
|沒有任何AI Key本機CCTV仍可使用|YES（直接Worker推論）|
|電影空拍與CCTV各有獨立浮動視窗|YES|
|支援拖曳／縮小／隱藏／再次展開|YES（共用handler與狀態測試PASS）|
|是否破壞既有功能|NO（目前已驗範圍；已抽驗兩架真實OpenSky飛機第一／第三人稱往返；完整回歸仍待人工擴大測試）|
|所有必要驗收已完成|NO|
