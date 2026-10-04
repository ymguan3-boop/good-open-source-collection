# 瀏覽器版本整理與清理紀錄（2026-10-04）

## 狀態

瀏覽器安裝／建置流程、相依套件與指定來源的可回復封存已完成。原先永久刪除命令被自動安全審查拒絕（只回報 `rejected: blocked by policy`）；使用者接著明確改為可回復封存。依新授權使用 PowerShell 原生 Move-Item，沒有永久刪除檔案。正式建置與真實畫面驗收由主流程接續。

## 已完成變更

|項目|實際結果|
|---|---|
|`scripts/prepare-upstream.mjs`|保留固定上游；阻擋覆寫既有工作區；不因其他資料夾服務正在執行而阻擋新資料夾安裝|
|`scripts/prepare-upstream.ps1`|只啟動 Node.js 準備流程，檢查結束代碼|
|`scripts/apply-overlay.mjs`|任何複製前核對固定 commit 與未套用；不複製 src-tauri 或整份原生 branding；保留網頁 PNG、fonts／LICENSE、ui-icons；所有既有本機 providers 保留|
|`scripts/install-browser.mjs`|首次安裝只使用 Git／Node／npm，驗證 browser runtime 與無 Tauri dependency|
|根 `package.json`|dev／build／preview 沿用安裝工作區；install:browser、prepare:upstream、start、check:boundaries；移除 npm 自動 prepare lifecycle|
|`overlay/package.additions.json`|移除 Tauri API／CLI／native scripts，保留 Gemini、GIS、Dexie、JSZip、ONNX Runtime；dev／preview 只綁回送位址並使用系統 CA|
|安裝工作區 `package.json`／`package-lock.json`|Tauri dependency、lock entries 與 native scripts 均為 0；browser runtime 標記正確|
|套件整理|`npm install --package-lock-only --ignore-scripts` 成功；`npm prune --ignore-scripts` 移除 3 個套件；ONNX Runtime 保留|
|`AGENTS.md`／`ARCHITECTURE.md`|更新成瀏覽器版本與本機 provider 架構|

npm 輸出仍有 1 項 low severity 依賴公告，本次未自動升級或執行 audit fix。

## 實際可回復封存清單

下列來源在操作前已確認完整絕對路徑位於本專案 `gods-eye-taiwan-desktop` 內；每個目的路徑亦核對位於指定封存根下。已使用 Move-Item 移出專案，逐項驗證來源不存在、封存目的存在。封存位置為 `D:\CODEX用\上帝之眼台灣版封存\browser-only-20261004-103438`，位於專案外，祖先目錄未發現 .git。相同磁碟的封存保留檔案容量，不宣稱釋放磁碟空間。

|相對路徑|用途|狀態|
|---|---|---|
|`overlay/src-tauri`|舊原生原始碼|已封存，可還原|
|`.work/upstream/src-tauri`|舊原生工作區／編譯產物|已封存，可還原|
|`scripts/agent-install-windows.ps1`|原生安裝流程|已封存，可還原|
|`scripts/start-gods-eye-taiwan.ps1`|原生啟動器|已封存，可還原|
|`scripts/create-desktop-shortcut.ps1`|原生捷徑|已封存，可還原|
|`scripts/rebuild-desktop-shortcut.ps1`|原生捷徑重建|已封存，可還原|
|`scripts/launching.html`|原生啟動說明|已封存，可還原|
|`.work/osm-national-v11`|已轉成正式圖資後的 OSM 暫存|已封存，可還原|
|`.work/town-boundaries-v12.zip`|已轉成正式行政界後的原始壓縮暫存|已封存，可還原|
|`.work/upstream/src/taiwan/taiwan`|無 imports 引用的舊巢狀原生模組備份；不是目前台灣 Overlay|已封存，可還原|

## 舊捷徑檢查

桌面 `上帝之眼-台灣版.lnk` 的 Target 為 Windows PowerShell，Arguments 精確指向本專案的 `scripts/start-gods-eye-taiwan.ps1`，WorkingDirectory 亦為本專案。已確認屬於舊原生入口，已封存至封存根的 `desktop/上帝之眼-台灣版.lnk`，原桌面位置已無該捷徑。

瀏覽器捷徑、其他專案的「上帝之眼」捷徑均未更動。

## 保留清單

- `release/`：發布者後續使用。
- `logs/` 所有 Chrome profile 與使用者網站資料。
- `%LOCALAPPDATA%/GodsEyeTaiwan` 的金鑰與設定。
- `overlay/public/models`、模型權重、ONNX runtime assets、License／provenance。
- 官方 DTM、Whisper 執行檔／模型與正式固定版圖資。
- `branding/icon-master.png`：瀏覽器 favicon；現行工具列 PNG、ui-icons、fonts 及授權。
- `UPSTREAM.lock`、上游來源與第三方授權。

## 已執行檢查

- prepare／apply-overlay／install-browser 的 `node --check`：PASS。
- prepare-upstream.ps1 的 PowerShell Parser：PASS。
- 根及 Overlay package JSON：PASS。
- installed dependency／lock／script 檢查：Tauri entries 0，ONNX 保留。
- NLSC／地形三檔已同步至安裝工作區並通過語法檢查。
- NLSC／地形 mock 邏輯 QA：同載、倍率協調、官方 matrix 保留、SSE／cache／壓力恢復等 PASS；不等於真實 3D 視覺驗收。

未在本次整理中重跑既有工作區 Overlay、未執行完整 build、未提交 Git 或發布 GitHub。正式建置與畫面驗收由本次主流程接續記錄。

## 新安裝驗收方式

在全新程式資料夾使用 `node scripts/install-browser.mjs`，再執行：

```powershell
npm.cmd --prefix .work/upstream run check:boundaries
npm.cmd --prefix .work/upstream run build
node scripts/start-gods-eye-browser.mjs
```

新工作區必須以 `UPSTREAM.lock` 固定 commit 為基礎；不可把 apply-overlay.mjs 重套至目前已安裝工作區。


## 封存 Manifest 與還原

封存根保存 `MANIFEST.json`，逐項列出 11 個來源／目的絕對路徑及驗證結果；本機驗收副本為 `.work/qa-v21/browser-cleanup-manifest.json`。原生原始碼與暫存保留於封存根的 `project/`，資料夾結構與原專案相同。

還原某個項目前，先確認 Manifest 中的來源位置目前不存在；不要覆蓋後續新增的工作。例如還原原生原始碼檔案（此操作不會切回原生 Runtime）：

```powershell
$taskArchive = 'D:\CODEX用\上帝之眼台灣版封存\browser-only-20261004-103438'
$taskProject = 'D:\CODEX用\上帝之眼台灣版\gods-eye-taiwan-desktop'
$taskRestoreTarget = Join-Path $taskProject 'overlay/src-tauri'
if (Test-Path -LiteralPath $taskRestoreTarget) { throw '目標已存在，請先人工比對，不覆寫。' }
Copy-Item -LiteralPath (Join-Path $taskArchive 'project/overlay/src-tauri') -Destination $taskRestoreTarget -Recurse
```

其他項目依 Manifest 的 source／archive 配對還原；桌面捷徑可從封存 `desktop/` 複製回原桌面位置。此次安裝套件已轉為瀏覽器版本，單純還原舊原始碼不會自動重新啟用原生版本。


## 模型備份整理

另將3個 Blender 自動 `.blend1` 備份移至同一封存根的 `model-backups/`，逐件 SHA-256 核對。可編輯 `.blend`、GLB、重製腳本與預覽均保留。沒有永久刪除。最新正式建置及驗收結果見 v22 驗收文件。
