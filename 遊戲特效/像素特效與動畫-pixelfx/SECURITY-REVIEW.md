# pixelfx 資安與授權檢核（繁體中文）

- **查核日期**：2026-11-04
- **上游**：https://github.com/patch-gg/pixelfx
- **固定 commit**：a84159688af3ca37a4be05a0d422b94451b2e24e
- **主要授權**：MIT；另有字型例外
- **結論**：可**有條件收錄**，但不能宣稱沒有病毒或已通過完整資安驗證。

## 靜態檢查範圍與結果

1. 檢閱 package.json、package-lock.json、src/core、tools、gallery、Claude Code Skill 與 .github/workflows/gallery.yml 等程式結構及關鍵檔案。
2. 搜尋與敏感環境變數、憑證外傳、遠端下載執行、child_process、eval、HTTP 連線等相關的可疑模式；**沒有在本次抽檢與搜尋中發現明確惡意外傳邏輯**，但不能取代全檔審計與動態沙箱。
3. 程式本身 package.json 未宣告 preinstall/postinstall；**依賴 esbuild 含安裝腳本**，因此不可推論 npm ci 不會執行任何安裝程式。
4. tools/lib/fxlib.mjs 的子程序呼叫用於選用的 ffmpeg 動畫匯出；仍須信任實際安裝的 ffmpeg 程式。
5. Claude Code Skill 可指示 AI 執行 Node.js 及產生／修改檔案；未見明確資料竊取指令，但若賦予高權限，仍存在一般 Agent 指令與供應鏈風險。
6. 未執行完整依賴 CVE 掃描、防毒引擎掃描、網路行為監測或全部效果逐檔人工稽核。

## 本收錄版的處理

- **本機展示伺服器**：修改 tools/serve.mjs，指定僅監聽 127.0.0.1，限制為 gallery／src 相關檔案，拒絕隱藏路徑；未要求外網公開部署。
- **專有字型**：上游 gallery/fonts/PatchPixel-Regular.woff2 依 gallery/fonts/NOTICE.md 不在 MIT 範圍內；此收錄版**排除字型檔案**，並調整 gallery/style.css 與 tools/build-gallery.mjs 使用系統備援字型。
- **展示 GIF**：上游 docs/readme/acts.gif 及 montage.gif 以官方固定版本 URL 引用，不在此倉庫重新複製。
- **自動執行**：不設定自動安裝、不啟用 Claude Code Skill、不建立部署流程或自動更新。
- **授權文件**：保留 LICENSE、NOTICE.md 與 gallery/fonts/NOTICE.md 說明著作權限制。

## 殘餘風險與建議

- 使用 npm ci、外部 ffmpeg 或 Claude Code Skill 前，應評估執行環境與最低權限；勿在包含機敏金鑰的專案中直接接受不熟悉的 AI 指令。
- 本次伺服器是減少已知暴露風險的**原始碼修正**，不等於已經執行滲透測試；不要對外開啟服務。
- 上游版本更新後**不可直接覆寫本收錄版**；應先檢視差異、重新測試授權與安全。
- 本收錄版不是上游官方分支，改動的中文 README、字型處理及安全修正不應歸責於原作者。

## 有關原始程式碼的完整性

本倉庫保留上游固定版本的原始程式與開發工具，將根目錄 README 中文化，另外保存 README.upstream.md。排除 3 個非程式本體的二進位媒體／字型資產：2 個展示 GIF 與 1 個保留權利的 woff2 字型。這些排除不會刪除特效的程式化實作，但演示圖片改以官方 URL 顯示。