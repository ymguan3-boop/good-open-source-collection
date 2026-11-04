# THREE Particles + Editor｜資安、授權與相容性檢核

**檢查日期：2026-11-04。結論：主引擎可有條件收錄；編輯器僅作上游 Git 參照；不可直接整合 r128 遊戲。**

## 來源與版本
- 主引擎 NewKrok/three-particles：`f54737cabfec5668ac654c712aff0593162ca4ef`；`package.json` 3.0.0，根目錄 MIT LICENSE（Copyright 2021 Istvan Krisztian Somoracz）。
- 編輯器 NewKrok/three-particles-editor：`b6b03b757559236b47eafaf8465176564011a5b6`；`package.json` 2.12.0；**根目錄無 LICENSE，套件也未明確宣告 license**。
- Git 子模組只是**固定上游來源指標**，不是原始碼鏡像或自主授權；使用者的下載仍指向原作者。
- 相依 `three` 要求 r182，與遊戲 r128 不相容；編輯器依賴較多且建置牽涉外部套件，須隔離。

## 本次靜態抽查
1. 檢視主引擎的 `package.json`、`LICENSE`、部署 GitHub Actions、Husky hooks、`scripts/stamp-docs.mjs` 與 `src/js/effects/three-particles/` 核心 TypeScript 模組。抽查核心執行路徑約 39 個檔案，未見明確外傳 API 金鑰、下載惡意程式或執行系統命令之程式模式。這**不是**完整供應鏈掃描。
2. 主引擎 `package.json` 的 `prepare: husky` 是安裝時 Hook 設定；`prepublishOnly` 會建置，`npm ci` 將執行相依套件的生命周期腳本。即使未見惡意仍不應在機敏環境盲目安裝。
3. 主引擎 `.github/workflows/release.yml` 會 npm 發布；Pages 會部署展示頁。這屬上游 CI，不在本收錄倉庫啟動。
4. Editor 的 `.github/workflows/ftp-deploy.yml` 明確包含使用 FTP Secrets 將產物部署至遠端伺服器，以及 semantic-release；`public/index.html` 包含 Google Tag Manager／Google Fonts 外部載入。**這不是惡意行為證據**，但不能當離線、完全無資料外連的編輯器。
5. Editor `rollup.config.js` 的 `spawn('npm', ...)` 用於本機開發服務；`scripts/compile-theme.js` 寫入暫存檔並刪除。沒有足夠依據認定此二者為惡意。
6. 沒有實際執行 antivirus、多引擎掃描、npm audit、全部依賴樹比對、Windows Defender、瀏覽器網路行為與漏洞滲透測試；不可以用「檢查過、百分之百無毒」表述。

## 收錄策略與殘餘風險
- 使用兩個**固定 SHA 的 Git 子模組**。不在母倉庫保存 `node_modules`、構建產物、FTP 帳密、Token 或超大型素材。
- Editor 因缺 LICENSE 不能視為已授權 MIT；對外發佈其修改版前先取得作者明確授權。其 Git 指標是來源參照，不等於完成再散布權利確認。
- 初步風險：引擎**低至中**（因依賴與安裝腳本）；編輯器**中**（授權疑義、上游 CI 外部部署與外部資源）；直接整合舊遊戲的相容性風險**高**。
- 優先採用隔離靜態 PoC，將是否安裝／執行留給有明確執行環境、可監測網路的測試者。
- **未實測即不得宣稱通過。** 倘若未來完成實測，報告需紀錄瀏覽器版本、GPU、FPS、錯誤日誌、網路請求與版本 SHA。
