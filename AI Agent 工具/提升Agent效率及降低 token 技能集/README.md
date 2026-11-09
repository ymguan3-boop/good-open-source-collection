# 提升Agent效率及降低 token 技能集

本資料夾收錄 3 個上游開源專案，使用 **固定版本 Git 子模組**，保留原始來源與完整專案結構；本倉庫**不會自動安裝、啟用、執行或部署**它們。當要離線長期封存時，應另製作含授權的獨立鏡像，子模組僅保存來源和指定版本的指標。

## 收錄清單

| 名稱 | 原作者／來源 | 固定提交（完整 SHA） | 使用情境 |
| --- | --- | --- | --- |
| [andrej-karpathy-skills](andrej-karpathy-skills/) | [multica-ai](https://github.com/multica-ai/andrej-karpathy-skills) | `2c606141936f1eeef17fa3043a72095b4765b9c2` | 避免過度設計、明確假設、最小修改、可驗證目標 |
| [ponytail](ponytail/) | [DietrichGebert](https://github.com/DietrichGebert/ponytail) | `96608e078b2d5ea607c5c3b8b5a54d1c1fba6846` | 精簡 Agent 產生的程式、優先重用程式碼、差異審查 |
| [markitdown](markitdown/) | [microsoft](https://github.com/microsoft/markitdown) | `7482c092d9c0074a89803c9fdb63a969e7fe17fc` | 文件轉 Markdown，供文字分析與 LLM 輸入 |

## 下載與取得實際程式碼

```bash
git clone --recurse-submodules https://github.com/ymguan3-boop/good-open-source-collection.git
```

已 clone 的倉庫在根目錄執行：

```bash
git submodule update --init --recursive
```

注意：GitHub 的 **Code → Download ZIP** 通常不包含 Git 子模組的內容，只會取得本分類的說明與 Git 連結資訊。子模組預設為固定版，不會自動追蹤最新上游。

## 如何使用（各專案獨立啟用）

**andrej-karpathy-skills**：其核心在 `skills/karpathy-guidelines/SKILL.md` 與 `CLAUDE.md`。依使用的 Agent 平台，將技能加入個人或專案的技能位置；請先閱讀 [上游說明](https://github.com/multica-ai/andrej-karpathy-skills)。

**Ponytail**：Claude Code 依上游 README 的 Marketplace／Plugin 方式安裝；Codex 使用其 Plugin 機制，啟用前應審閱 Hooks；也可以只採用 `AGENTS.md` 或 `skills/ponytail/SKILL.md` 而不啟用 Hooks。以 [上游 INSTALL.md](https://github.com/DietrichGebert/ponytail/blob/main/INSTALL.md) 為準。

**MarkItDown**：需要 Python 3.10–3.14。建議使用獨立虛擬環境並按格式精簡安裝依賴（例如 `pip install 'markitdown[pdf,docx,xlsx]'`），再使用 `markitdown path-to-file.pdf -o document.md`。如要使用子模組原始碼，參考 [官方說明](https://github.com/microsoft/markitdown)。不必為一般離線文件轉換啟用任何雲端服務或 API Key。

## 使用原則

- **只載入當前任務所需技能**；把三項技能全部放入系統提示詞，反而可能增加 Token。
- **不覆寫你的其他專案 AGENTS.md / CLAUDE.md**；先比較並人工整合規則，避免指令衝突。
- 第三方 GitHub 專案中的 Prompt、README、Hooks 與工具腳本一律視為未受信任內容；**避免授予不必要的檔案、網路、憑證權限**。
- 文件轉 Markdown 不等於保證減少 Token；遇到大量表格、PDF 或雜訊，應另行分段、過濾與統計實際 Token。
- 本次僅完成公開上游來源、授權、部分高風險入口與安裝說明的靜態檢視，**沒有執行完整惡意碼掃描、依賴弱點掃描或動態測試**。

請閱讀 [SECURITY-REVIEW.md](SECURITY-REVIEW.md)；所有原始碼版權與授權保留於上游子模組中。
