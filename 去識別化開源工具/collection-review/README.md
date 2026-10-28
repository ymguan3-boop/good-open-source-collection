# 去識別化工具安全檢核（2026-10-28）

- 官方上游：https://github.com/dean9703111/data-deidentification
- 固定來源：1f7b9298f94a9728cf6d181f84cfcce48c39d968
- 已檢查：完整上游檔案盤點、文字程式碼靜態模式、敏感資訊、符號連結與大檔案、npm 正式依賴公開弱點、MIT 授權及必要檔案。
- 量化結果與具體路徑參考 full-upstream-static-security.json 和 npm-production-audit.json 以及 npm-all-dependencies-audit.json。
- upstream-full/ 是包含原作者開發工具及 AI Skill 文件的完整原始碼備份，僅當資料儲存；不自動執行、安裝或部署。原有 source/ 及網站靜態檔未變更。
- 未完成動態沙箱、完整人工逐行複核、全部依賴套件程式碼反編譯或正式滲透測試。自動靜態掃描無法保證沒有惡意行為。
- 使用真實個資前，務必以虛構資料進行離線測試，人工覆核遮罩品質，並重新檢查外部網路請求及依賴套件弱點。
- 原作者程式 MIT，保留 LICENSE、來源與版權資訊。
