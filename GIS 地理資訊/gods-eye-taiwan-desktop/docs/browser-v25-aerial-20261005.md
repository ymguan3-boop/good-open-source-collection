# v25 空拍規劃、自由移動與標籤驗收（2026-10-05）

## 範圍與狀態

本版只修改瀏覽器 Overlay 與既有 Node Provider。影片、加密金鑰、使用者記錄及本機 QA 證據不納入 GitHub。本次修正已完成的抽驗與尚待人工／長時間驗收分列；不宣稱所有區域、來源、設備與實體麥克風驗收完成。

## 原因與修正

1. OpenRouter模型並非都支援結構化輸出；舊流程直接解析單次回答，格式不符合即中斷。現在按能力選 JSON schema／JSON object，不支援時用嚴格 parser。解析純JSON、fence、文字包裹與數字字串；空值、非法參數、越界仍拒絕。格式失敗自動換免費候選，最多6個／120秒；前端最多3輪意圖／格式修正，可取消。401不盲目輪替；明確選的付費模型只作該輪第一個候選，備援皆免費。
2. AI只決定有限拍攝參數，XY由本機沿使用者確認的路徑編譯。實測障礙衝突時保留XY、依測得高程調高後重新檢查。UNKNOWN只補圖資最多2次，不再次詢問AI猜測安全；資料仍不足則不開拍。
3. 自由模式舊逐段憑證被新方向覆蓋，並因12秒時效重複失效。改保留最多20筆來源簽章有效的走廊；六方向起飛檢查不是完整安全立方體。逐1公尺移動子段要求兩端同在某個已驗膠囊內，確保整個安全體積不穿越未知區域；新方向提前檢查，靠近邊界平滑減速。
4. 按鈕配色被 taiwan.css 的 #tw-shell 高優先度覆寫；已調整樣式範圍。手繪紫、自由綠；暫停黃、停止／刪除紅、匯出藍、儲存青。放置游標grab、拖曳grabbing，放開／失焦／取消恢復；晚到地形取樣不重複加高度。
5. 地點改為深色矩形白字、實際地標名稱及自動寬度，緩慢閃爍5秒後移除。無霓虹框、圖示或氣泡；相同圖層只有一組生命週期，移除會清計時器。
6. 啟動金鑰讀取完成後若底圖已變更，略過較晚的預設底圖切換，避免覆寫NLSC拍攝場景。取消亦涵蓋初始自由走廊檢查與Provider模型清單期間的斷線。

## 官方研究依據與建議

- [OpenRouter Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs)：支援取決於模型／供應商。使用嚴格schema及require_parameters，並保留本機範圍驗證與免費備援；不能假定所有列出的模型都能回傳同一JSON。
- [Cesium3DTileset](https://cesium.com/learn/cesiumjs/ref-doc/Cesium3DTileset.html)：tilesLoaded/allTilesLoaded為目前視野及SSE條件，不能當全路徑已下載證明。先預載有限拍攝範圍、保存實際幾何認證、受Resource Governor限制快取／細節；網路與硬體仍可能造成延遲。
- [Scene](https://cesium.com/learn/cesiumjs/ref-doc/Scene.html)：most-detailed查詢與當前LOD即時取樣用途不同；未知幾何保守阻擋。線上圖資不能以「畫面已顯示」替代整條路徑驗證。建議先完成預檢後開拍，長路徑分段及使用720p、較低速度；本版已把前方預檢與有效走廊重用納入程式。

## 模組／故障注入驗收

| 項目 | 結果 | 證據（本機未發布） |
|---|---:|---|
|後端格式、能力選擇、免費備援、價目、取消、timer／reader清理、上限|16 PASS|logs/qa-v25/aerial-backend.json|
|前端參數／幾何修正、UNKNOWN重試、取消、XY限制、無Key、本機高度抬高|11 PASS|logs/qa-v25/planning-workflow.json|
|拖曳／游標／晚到取樣／樣式生命週期|8 PASS|logs/qa-v25/aerial-ui.json|
|自由核心實際座標移動、有效憑證重用、等待邊界減速、取消與晚到結果|9 PASS|logs/qa-v25/free-motion.json|
|既有碰撞／憑證回歸|7 PASS|logs/qa-v25/collision-regression.json|
|直線完整範圍、端點、L形、heading與最終99%進度|7 PASS|logs/qa-v25/long-ray.json|
|重複街道取樣合併、undefined／NaN、深度缺失、單點及取消保守性|7 PASS|logs/qa-v25/missing-surface.json|
|矩形繪製／寬度／包行／五秒／取消生命週期|7 PASS|logs/qa-v25/label-tests.json|

上述使用真實核心／Cesium數學、部分來源與輸入替身，不是外部服務或全設備實測。

## 真實瀏覽器／服務抽驗

- 真實免費OpenRouter規劃2次通過：65公尺34位置；57公尺30位置，均檢查地形、3D建物及連續路段，顯示可開拍。第二次實際模型 liquid/lfm-2.5-2.6b:free。
- 57公尺手繪實際完成9.23秒，完整抵達終點，1920×1080 WebM產生並存記錄；影片metadata duration可能Infinity，因此JSON的duration為null，不以該欄作成功依據。第一條錄影在開發伺服器更新時被重新整理，未列完成錄影。
- Google真實場景自由移動錄影16.33秒：W23.63m、A13.58m、S17.54m、I7.75m、K21.65m（每鍵2.5秒＋放開後0.6秒，含慣性，因此不是純某軸／固定速率）。已驗走廊1→10筆；停止後pending=false，1280×720影片可播放，readyState4且paused=false。
- NLSC宜蘭建物＋真實台灣地形＋NLSC正射：來源同載、failed0；UI當下RAM約80–96%，Governor資源保護，圖磚快取可能限制實際細節，沒有改成無限快取。自由錄影五方向均有實際位移，初版轉向仍有邊界等待，進一步優化與補驗結果見下節。
- 無人機真實拖曳後投影位置從(640,351)移至約(748,355)，高度約107.74m不重加80m；主Canvas為grab。控制按鈕computed confirmRoute=rgb(100,64,120)、自由與停止配色可見。

## 最新補驗

- 標籤真實畫面呈現164×40px深色矩形白字；5.2秒時圖層已移除。文字實際顯示宜蘭縣審計室，已保存畫面與生命週期證據。
- 已核對Cesium 1.138的Picking與Traversal實作；每個原始直線段改用正反向完整有限ray，48公尺段由24條降至2條，地形仍密取樣。此為同一正交拾取API能力下的查詢合併，並非工程級物理碰撞保證。
- 最後版NLSC五方向實際錄影14.95秒：W 16.76m、A 5.42m、S 25.81m、I 2.95m、K 7.80m。已驗走廊1→4；A首次轉向遇短暫已驗邊界等待，S/I/K取樣時warning為空且持續移動，不宣稱完全零等待。影片1280×720、readyState4、paused=false可播放；停止後pending=false及憑證清空。
- 多點路徑已完成最高細節batch高度查詢後，缺建物高度欄位的逐點補查由最後完整雙向wide檢查承接；單點surface仍補查。NaN、深度缺失、失敗／逾時及來源變動不能發憑證。這是減少相同查詢，不以即時LOD替代最高細節。
- 最後正式Vite build PASS（1224 modules、1分20秒）；import／package boundaries PASS（908 modules、60 portable entries）。已保留原有大型bundle警告；未額外改動上游分包架構。

## 修改檔案

- overlay/src/taiwan/labelStyles.js、geminiLive.js、ui.js
- overlay/src/taiwan/cinematicCameraPanel.js、cinematicCamera.js、aerialCollisionSystem.js、floatingPanels.css、aerialFlightPlanner.js
- overlay/server/providers/taiwanChat.js、planningModels.js
- README.md、ARCHITECTURE.md、DEVELOPMENT-STATUS.md、THIRD_PARTY_NOTICES.md、GITHUB-STATUS.md

新增：overlay/src/taiwan/aerialAiPlanner.js、aerialFreeSpace.js、overlay/server/providers/aerialPlanningOutput.js及本驗收Markdown。

## 相依與費用

沒有新增第三方套件、外部API、必要付費依賴、訂閱或Camera API。原創模組為本專案MIT；沿用Cesium Apache-2.0與瀏覽器MediaRecorder。自動選擇免費模型只在既有OpenRouter可用額度內工作，不能保證所有免費provider都可用。無AI Key仍能本機結構化規劃與自由空拍；沒有免費provider或Key無效不偽裝AI成功。

## 人工待補清單

- 長距離、複雜街廓、夾縫、山坡／河道；每次需要資料足夠才起飛。
- 拍攝途中新方向、加減速／大角度轉向，慢網路與來源圖磚失敗時的體感；不宣稱全程零等待或完整下載全縣。
- 720p／1080p長時間影片、匯出播放、RAM/GPU回復；CCTV與電影空拍同時開啟壓力。
- 實體麥克風、角色自然度、環境回音、實際語音導引與地點標籤五秒的主觀可讀性，沿用docs/voice-v22-manual-checklist-20261004.md。

## 免費核心答覆

電影空拍核心完全免費：YES。無AI API Key電影空拍仍可用：YES。CCTV本機辨識完全免費及無Key可用：YES（沿用前版，本次未改辨識）。獨立浮動視窗、拖曳、縮小、隱藏、再次展開：YES（沿用共同管理）。是否破壞既有功能：已抽驗範圍未發現；完整回歸仍待人工，不以未驗項目回答保證NO。
