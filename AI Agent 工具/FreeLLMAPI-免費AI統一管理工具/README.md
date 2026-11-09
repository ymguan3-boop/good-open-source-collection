# FreeLLMAPI－免費 AI 統一管理工具（固定版本收藏）

> **收錄性質：原始碼收藏／固定版本 Git submodule，非公開服務、不執行程式、不表示安全驗證通過。**

- 原作者：Tashfeen Ahmed
- 官方倉庫：https://github.com/tashfeenahmed/freellmapi
- 固定版本：`v0.16.14`（官方於 2026-10-30 發布）
- 固定 Commit：`5127fee51ba97ad112915ebe227ba13df461a266`
- 授權：MIT（見 `LICENSE`；完整上游授權位於子模組）
- 用途：統一 LLM API、模型路由、免費額度管理、供應商故障轉移。

## 來源取得方式

這個資料夾下的 `原始碼/` 是 **Git submodule**，固定指向上述 commit。這讓來源版本可被重現，**但不是獨立的離線原始碼備份**；若上游刪除，子模組可能無法再次取得。使用者須先檢視來源與風險後才選擇下載。

```bash
git clone https://github.com/ymguan3-boop/good-open-source-collection.git
cd good-open-source-collection
git submodule update --init -- "FreeLLMAPI-免費AI統一管理工具/原始碼"
git -C "FreeLLMAPI-免費AI統一管理工具/原始碼" rev-parse HEAD
```

最後一行預期為 `5127fee51ba97ad112915ebe227ba13df461a266`。此過程只抓取原始碼、不進行安裝、執行或公開部署。**不要自動執行上游的腳本、安裝依賴、.claude 權限設定或 GitHub Actions**。

## 安全警示

1. 本倉庫未將 FreeLLMAPI 部署到 GitHub Pages、Vercel、Docker、公開網站或對外 API。
2. 未將任何實際 API Key、`.env`、資料庫、加密金鑰及使用者資料提交。
3. 上游程式包含 `.claude/settings.local.json`，請勿自動採納其命令權限；需重新審核。
4. 若將來在本機測試，應只綁定 `127.0.0.1`、使用受控版本、保留管理驗證與限流，且不傳送敏感審計或個資到未核准雲端模型。
5. **本次僅完成重點靜態審查，未完成完整弱點／惡意程式鑑識或可執行檔安全驗證。**

請閱讀 [風險檢核](collection-review/SECURITY-REVIEW.md) 及 [來源清冊](collection-review/SOURCE-MANIFEST.json)。

## 更新政策

只在經人工重查來源版本、授權、依賴弱點及風險後才升級固定 submodule commit；不得自動追蹤 `main` 或 `latest`，不得自動執行 upstream workflow。
