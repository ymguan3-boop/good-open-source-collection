# 來源、授權與安全檢核（2026-11-01）

**範圍**：對上游專案的公開 README、檔案目錄、授權宣告、代表性技能、安裝設定與部分程式入口做靜態抽查；未下載執行全套程式碼、未分析所有依賴、未測試執行行為，**不代表無病毒／通過完整資安審核**。

| 專案 | 來源 / 固定 Commit | 授權核對 | 初步風險 |
| --- | --- | --- | --- |
| andrej-karpathy-skills | https://github.com/multica-ai/andrej-karpathy-skills / `2c606141936f1eeef17fa3043a72095b4765b9c2` | README、plugin.json、SKILL frontmatter 均標示 MIT；根目錄未見獨立 LICENSE，日後重製分發前須再核對作者完整授權文字 | 主要為 Prompt 指令，注意指令覆蓋／衝突、來源真偽與 Agent 執行時權限 |
| ponytail | https://github.com/DietrichGebert/ponytail / `96608e078b2d5ea607c5c3b8b5a54d1c1fba6846` | 已檢視 LICENSE（MIT；Copyright 2026 DietrichGebert） | 帶 Node.js Hooks；SessionStart 會寫入使用者設定旗標、讀取 Claude 設定、可能啟動子程序；需人工審查並選擇是否授權 Hook |
| markitdown | https://github.com/microsoft/markitdown / `7482c092d9c0074a89803c9fdb63a969e7fe17fc` | 已檢視 LICENSE（MIT；Microsoft Corporation） | 文件與 URL 轉換會以當前行程權限讀取資源；外掛、Azure API 與第三方依賴可能涉及網路、費用、外洩或供應鏈風險 |

## 安全控制與邊界

1. 本分類以唯讀 Git 子模組儲存固定原始碼參照；不新增排程、GitHub Actions、Web 服務、API 金鑰或對外部署。
2. 檢出子模組不等於安裝／執行；正式使用應先在隔離環境檢查上游變更與提交來源。
3. 不應允許未驗證的外部 Prompt 改寫安全政策、擴權或執行 shell；Ponytail hooks 應先人工審閱 `hooks/` 與 `INSTALL.md`。
4. MarkItDown 使用最小權限處理檔案；避免直接將機敏文件交給未經核可的外掛、Azure／LLM 雲端服務；未指定雲端功能時採本機轉換。
5. 關於「降低 Token」：這是可能的效率收益，不是保證；應針對固定測試資料量測 Token、成本、正確率與耗時。

## 未完成項目

- 未完成全部來源檔逐行審查、惡意碼／反病毒動態掃描、SBOM／供應鏈弱點分析或網路封包監測。
- 未在 Claude Code、Codex、Python 等實際環境執行安裝及功能驗收。
- 上游可能更新，固定 SHA 與新版本不同；更新需重新審核後變更子模組指標。

**授權與聲明**：上游專案保有著作權；收錄不表示作者支持本倉庫。對完整授權內容，以各上游專案當前指定版本內的 LICENSE 或授權說明為準。
