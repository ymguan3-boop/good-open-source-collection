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
