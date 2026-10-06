# v29 旅程確認執行、手繪刪線及航機修正（2026-10-06）

以 v28 `5c3f83e16401338c2c5e0aa7cbab63be82e474c4` 為基底；獨立發布工作區只更新本批次原始碼、測試、專案文件及倉庫根 README。排除金鑰、票價快取、logs、.work、dist 和本機截圖。

# v28 AI回覆與旅程修正確認（2026-10-06）

以v27發布提交13f98a352315cd9b7cebace7a7ba9cc0aa12d378為基底，獨立發布工作區僅更新本次來源、測試及README／驗收文件。新增12/12、既有35/35及44/44通過；真實AI回覆成功，範例5完整官方旅程仍未取得，限制見[v28驗收](docs/browser-v28-assistant-transit-20261006.md)。發布排除logs、金鑰、.work、dist及票價快取。

# v27 票價引擎與大眾運輸（2026-10-06）

發布基底 main `80103c16595208d096b224c0db41821f1ecbc5ee`，以獨立發布工作區更新本專案及倉庫根README。新增TDX旅程、Blender七運具模型、獨立官方票價引擎、共享偏好、官方來源／日期驗證、可調TTL快取、費用與時間比較及地圖路段票價資訊卡。

核心35/35、後端44/44、可公開規則測試子集29/29及正式建置通過。真實服務與完整未驗清單見 [v27驗收](docs/browser-v27-fare-engine-20261006.md)，並不代表全臺票價完整、全部既有功能或七運具完整旅程已驗收。

發布排除金鑰、票價快取、logs、.work、release、dist、node_modules、官方HTML及測試掛鉤。原生檔案沿用可回復封存；本批次未永久刪除使用者資料。

# v25 版本資訊（2026-10-05）

更新五秒矩形地點標籤、AI 結構化參數／自動修正／免費模型備援、自由移動有效走廊重用、手形拖曳及多色操作按鈕。沒有新增必要付費相依或外部 API。影片仍由使用者自行匯出，Esc不自動下載。

實測、來源與人工待補清單見 [v25 驗收](docs/browser-v25-aerial-20261005.md)。既有語音實體麥克風與長時間壓力未全數完成，未宣稱整體驗收完成。以下保留歷史版本。

# v24 版本資訊（2026-10-05）

發布基底為遠端 main `39fe8d92fc89f46dd6ff3be1dee46482f407225a`，以獨立發布工作區只更新本專案與倉庫根 README 的台灣版說明。

本版更新四種 Gemini 角色與原生音訊播放、霓虹三秒標籤、導航三色完整模型、共用可拖曳／縮小視窗、有限距離障礙查詢、範圍預載、拍攝介面隱藏與必要設定的工作保存／自動重載。Esc 停止影片並預覽／存記錄，不自動下載。沒有新增必要付費相依或外部 API。

真實服務／場景、替身及正式建置的抽驗結果與人工清單見 [v24 驗收](docs/browser-v24-acceptance-20261005.md)。仍有實體麥克風、主觀聲音及長時間回歸未驗，不宣稱所有驗收完成。

本機正式 4175 已換上固定上游＋Overlay 的正式 dist；舊 dist 可回復保存。發布排除 Key、本機設定、QA 掛鉤、音訊、工作區備份、logs、.work、dist、node_modules 及 release。原生檔案沿用已授權的可回復封存，沒有永久刪除。

以下保留歷史資訊。

# v23 版本資訊（2026-10-04）

本批次以遠端 main 3cdb72ceac9b6c4049215619661d2070682fcca7 為發布基底，採獨立工作區；只更新本專案及倉庫根 README，保留其他程式與歷史。

新增瀏覽器專用安裝、CCTV 本機辨識整合、手繪／自由空拍與影片記錄、原創車輛與無人機模型。補修 NLSC 街區高程、導航遠距模型與摘要拖曳、拍攝規劃流程及 Gemini 語音連線設定。

相同 Gemini Key 已通過 3.8、3.1 各4項真實音訊 ASR，撤回原先 Key 全面耗盡診斷；初始化搜尋工具會觸發 quota exceeded，已移除，公開新聞改為註冊 RSS 工具。正式 boundaries 與 build 通過；未測項目及 NLSC特定長路徑查詢逾時見 [v23驗收](docs/browser-v23-followup-20261004.md)、[人工清單](docs/voice-v22-manual-checklist-20261004.md)。

發布排除本機 Key、設定、QA掛鉤、音檔、logs、.work、node_modules、dist、release與官方DTM原始格網。非必要原生檔案已可回復封存，沒有永久刪除使用者資料；見 [清理紀錄](docs/browser-only-cleanup-20261004.md)。

以下為以前發布紀錄。

# GitHub 發布狀態

2026-10-03：台灣版 v18，發布至 [ymguan3-boop/good-open-source-collection 的台灣版資料夾](https://github.com/ymguan3-boop/good-open-source-collection/tree/main/gods-eye-taiwan-desktop)。使用最新 main 的獨立發布工作區，更新台灣版原始碼與倉庫根 README，保留其他程式與 Git 歷史。

本版保留 v13至v16 累積功能，新增語音圖資範圍確認、可拖曳航機卡與標籤、第一／第三人稱切換修正、對話免費模型輪替、記錄緊湊排版與本機風格備份。安裝方式見 README，驗收見 docs/browser-fixes-v16-20261002.md。

發布檔與 SHA-256 清單由 scripts/package-github.ps1 建立；不含安裝工作區、本機服務金鑰、暫存影像、日誌與官方 DTM 原始格網。官方 DTM 可依 README 另行下載。未重新產出或驗收 Tauri EXE。

v17僅修正語音指定區域載入與請求接續，其他功能保留；見docs/voice-scope-fixes-v17-20261002.md。

v18更新彈性語音圖資範圍回答、完成回報與地點標籤，其他功能保留。實際圖資載入驗收與限制見docs/voice-workflow-fixes-v18-20261003.md；發布仍排除本機測試掛鉤、音檔、畫面與金鑰。
