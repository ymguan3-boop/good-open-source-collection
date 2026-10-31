# FreeLLMAPI 固定版本安全檢核（2026-10-31）

**結論：附條件收錄原始碼；不公開部署；未認證安全。**

## 1. 標的與邊界

- 上游：https://github.com/tashfeenahmed/freellmapi
- Tag：`v0.16.14`
- Commit：`5127fee51ba97ad112915ebe227ba13df461a266`
- 程式架構：Node.js/TypeScript、Electron 桌面、OpenAI 相容 API 代理。
- 來源型態：Git submodule 固定 commit；不獨立複製整個上游檔案，不會在本資料集自動啟動程式。
- 授權：上游 MIT；第三方依賴與外部模型服務條款另行確認。

## 2. 已做的重點檢視

| 項目 | 已見證據／發現 | 判斷 |
|---|---|---|
| MIT 授權 | 上游 `LICENSE` | 可合法重製、再散布，須保留原作者聲明 |
| 歷史漏洞 | [Issue #35](https://github.com/tashfeenahmed/freellmapi/issues/35)：2026-05 通報認證、CORS、限流及查詢等問題 | 維護者 2026-05-31 表示 #40、#146、#151 修補；並非獨立滲透驗證 |
| 後台認證 | `server/src/middleware/requireAuth.ts`、`server/src/app.ts` 掛載管理 API 驗證 | 已看見保護機制 |
| 速率限制 | `server/src/middleware/rateLimit.ts` | 已看見 /v1 與管理端限制 |
| 金鑰保護 | `server/src/lib/crypto.ts`、`SECURITY.md` 使用 AES-256-GCM 與 ENCRYPTION_KEY | 需防止金鑰、資料庫及備份外洩 |
| 日誌敏感資訊 | `server/src/lib/log-redaction.ts` | 有遮罩設計，未做實際滲漏測試 |
| 獨立伺服器介面 | `server/src/lib/config.ts` 預設 HOST=`::` | 可能接受非本機請求；本機測試應設 HOST=127.0.0.1 |
| Docker 網路 | `docker-compose.yml` 預設只發佈 `127.0.0.1:3001` | 容易因改為 0.0.0.0 而暴露 |
| 桌面網路 | `desktop/src/main.ts` 預設 `127.0.0.1`、LAN opt-in | 仍需本機防火牆與更新驗證 |
| Claude 本機權限 | `.claude/settings.local.json` 允許若干 Git/刪除命令模式 | 不應直接採納為本資料集的 Agent 權限 |
| 更新與供應鏈 | `desktop/src/updater.ts`、`electron-builder.yml` 具更新機制 | 固定版本收藏不啟用更新或執行安裝器 |
| 外部免費模型 | 路由到第三方 API，非全部本機推論 | 供應商可能記錄、留存或用於訓練請求內容，依各供應商條款 |

### 版本文件不一致

上游 `SECURITY.md` 在檢閱時仍稱 0.13.x 為 current，而官方最新發行已為 0.16.14。不可單靠該文檔判定當前版本安全狀態。

## 3. 未完成與不能保證的事項

- **未執行**完整逐檔惡意行為、惡意提示掃描；未確認所有依賴的 provenance。
- **未執行** `npm audit`、OSV-Scanner、Trivy、Semgrep、CodeQL、VirusTotal 或 Windows Defender 的實際掃描。
- **未進行** Docker/Windows EXE 動態沙箱測試、封包攔截、滲透測試及實體 API 驗收。
- **未證明**全部歷史漏洞在固定 commit 不可重現，也未聲稱該版本無 0day。
- 靜態重點檢閱中沒有足以直接判定植入惡意程式的證據，**不等於證明完全沒有惡意程式**。

## 4. 收錄安全政策

1. 只納入固定 commit 原始碼指標與此報告，**不**公開部署 GitHub Pages、API、桌面 EXE 或 Docker。
2. 不把 `.env`、私密金鑰、SQLite 資料、憑證、測試日志、安裝包添加到本倉庫。
3. 不複製、執行或信任上游 GitHub Actions、`.claude/settings.local.json` 或自動更新程序。
4. 對第三方依賴與授權保持來源署名；不將本專案標成官方分支或已安全驗證。
5. 後續若需真正離線保全，應另以不可變、可核對 SHA-256 的原始碼封存檔再做獨立鏡像（目前**尚未**完成）。
6. 若用於《上帝之眼・台灣版》，機敏地籍／審計資料仍應本機處理，不得因 FreeLLMAPI 在本機就假設雲端模型不會收到資料。

## 5. 本機測試前最低驗收（目前未執行）

- 鎖版 + 確認 tag/commit 符合來源清冊；依賴安全掃描並人工判斷修補。
- 僅 `127.0.0.1`，禁止公網入站；管理登入及 API Key 驗證測試。
- 401/403/429/500、異常超時、取消、日誌金鑰遮罩、意外更新及關機後重啟測試。
- 先用虛構資料做 outbound 流量查驗；確認不同免費供應商的資料條款。
- 正式工作資料須取得授權及去識別化／本機隔離控制。

**最後判定：適合做有風險揭露的「固定版本原始碼收藏」，不代表建議直接部署為網際網路 AI 服務。**
