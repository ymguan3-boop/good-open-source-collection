# GitHub 發布狀態

2026-10-03：台灣版 v18，發布至 [ymguan3-boop/good-open-source-collection 的台灣版資料夾](https://github.com/ymguan3-boop/good-open-source-collection/tree/main/gods-eye-taiwan-desktop)。使用最新 main 的獨立發布工作區，更新台灣版原始碼與倉庫根 README，保留其他程式與 Git 歷史。

本版保留 v13至v16 累積功能，新增語音圖資範圍確認、可拖曳航機卡與標籤、第一／第三人稱切換修正、對話免費模型輪替、記錄緊湊排版與本機風格備份。安裝方式見 README，驗收見 docs/browser-fixes-v16-20261002.md。

發布檔與 SHA-256 清單由 scripts/package-github.ps1 建立；不含安裝工作區、本機服務金鑰、暫存影像、日誌與官方 DTM 原始格網。官方 DTM 可依 README 另行下載。未重新產出或驗收 Tauri EXE。

v17僅修正語音指定區域載入與請求接續，其他功能保留；見docs/voice-scope-fixes-v17-20261002.md。

v18更新彈性語音圖資範圍回答、完成回報與地點標籤，其他功能保留。實際圖資載入驗收與限制見docs/voice-workflow-fixes-v18-20261003.md；發布仍排除本機測試掛鉤、音檔、畫面與金鑰。
