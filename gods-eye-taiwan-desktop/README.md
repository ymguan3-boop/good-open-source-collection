# 上帝之眼・台灣版

以 God's Eye View 與 CesiumJS 為核心的繁體中文 3D 地圖、圖資管理及 AI 空間分析程式。修改者：官毅明。

本專案提供原始碼與本機安裝流程。推薦使用 Windows 瀏覽器版；亦保留 Tauri 桌面版。本機服務只綁定 `127.0.0.1`，不可直接雙擊 HTML，也不是 GitHub Pages 純靜態網站。

## 下載

[程式資料夾](https://github.com/ymguan3-boop/good-open-source-collection/tree/main/gods-eye-taiwan-desktop)

可在倉庫首頁選「Code → Download ZIP」（下載壓縮檔），解壓縮後進入 `good-open-source-collection-main\gods-eye-taiwan-desktop`；或執行：

```powershell
git clone https://github.com/ymguan3-boop/good-open-source-collection.git
cd good-open-source-collection\gods-eye-taiwan-desktop
```

## 首次安裝瀏覽器版（推薦）

### 必要環境

- Windows 10／11 64 位元。
- [Git](https://git-scm.com/downloads/win)。
- [Node.js](https://nodejs.org/en/download)：24.14 以上的 24.x，或 26.x；內含 npm。
- Google Chrome、可用的 WebGL 與音訊裝置。
- 網路：首次下載上游及相依套件、使用線上底圖與 API 時需要。

瀏覽器版不需要 Rust、Visual Studio 或 Tauri EXE。

在專案資料夾開啟 PowerShell，執行：

```powershell
node .\scripts\install-browser.mjs
```

安裝程式依 `UPSTREAM.lock` 取得鎖定上游、套用台灣版、安裝套件及建立正式介面；所需時間取決於網路與電腦。若已有安裝工作區會停止，不刪除既有設定。首次安裝完成後雙擊：

```text
啟動上帝之眼-瀏覽器版.bat
```

它會啟動／沿用本機圖資服務，再以 Chrome 開啟 `http://127.0.0.1:4175`。金鑰與網站資料使用同一個本機入口保存；請避免切換到不同連接埠。啟動紀錄在 `logs/browser-launch.log`。

### 交由 Agent 安裝

可把本資料夾交給 Codex 或 Claude Code，輸入：

> 請讀取 AGENTS.md，使用 scripts/install-browser.mjs 安裝瀏覽器版，再啟動「啟動上帝之眼-瀏覽器版.bat」。請確認正式介面可開啟及圖資可載入，保留既有設定與金鑰。

### Tauri 桌面版（選用）

另需 Rust stable／Cargo、Microsoft C++ Build Tools 及 WebView2。由 Agent 依 `AGENTS.md` 檢查環境，再執行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\agent-install-windows.ps1
```

桌面捷徑為「上帝之眼-台灣版」，圖示使用 `branding/gods-eye-taiwan-v4.ico`。本次版本以瀏覽器驗收，未重新驗收 Tauri EXE；瀏覽器可用不代表防毒對 EXE 的偵測屬誤判。

## 更新既有安裝

先匯出 JSON 專案並關閉程式與本機服務。建議將新版原始碼放入另一個全新資料夾，執行上述首次安裝流程，再匯入專案；本機 DPAPI 金鑰仍存於同一 Windows 使用者的 LocalAppData。請保留舊資料夾直到確認專案、網站資料與圖資正常，成果紀錄不會由資料夾複製自動搬移。

## 服務與金鑰

右上齒輪 →「設定」→「服務與 API 金鑰設定」，輸入需要的服務金鑰並儲存。未設定必需金鑰時，按「載入」會提示「未輸入金鑰」。

|服務|用途|
|---|---|
|Google Maps／Cesium ion|Google 擬真3D、Bing影像及全球地形；可用資產依金鑰權限與服務方案|
|TomTom|地標搜尋、行車路線與即時路況|
|OpenRouter|文字對話與圖層AI分析，可選模型與自訂回覆風格|
|Gemini Live|即時語音與地圖操作，模型 `gemini-3.8-live`|
|AISStream、NASA FIRMS、OpenSky等|船舶、熱點、飛機等各來源功能|

金鑰以 Windows DPAPI CurrentUser 加密保存在本機使用者目錄；關閉程式後可沿用。AI／TomTom長效金鑰由本機服務保管，不回傳前端或匯出JSON。Google／Cesium瀏覽器SDK必須使用對應憑證，請在供應商設定適當權限。服務額度與可用性以供應商為準，「對話無上限」僅代表取消本程式次數限制。

## 圖資與行政界

「圖資載入範圍」只有一個選單，包含全台灣與22縣市。選取後按「套用／切換範圍」，各圖資獨立載入、隱藏、更新、改色或移除。

|圖資|來源與版本|全台筆數|
|---|---|---:|
|道路中心線|OSM／Geofabrik，來源截至2026-09-30 20:22:42 UTC|573,905|
|河川／水系中心線|同上|75,103|
|面狀水域|同上，含多重多邊形及孔洞|58,882|
|海岸線|同上，含外島|1,626|
|鐵路|國土測繪中心官方固定版，2026-09-30下載|3,175|
|縣市界|國土測繪中心 `COUNTY_MOI_1090820`|22|
|鄉鎮市區界|國土測繪中心 `TOWN_MOI_1120317`，2026-10-01下載|368|

道路／水系已改用空間索引，移動或放大地圖時重新載入相交線段。街區尺度（視野跨度不超過0.16度）顯示完整來源線段，不再從全台均勻抽樣；區域／全台尺度顯示主要道路與河川，以保留連續性與降低記憶體負擔。完整向量仍供分析，說明中可查目前視野與顯示筆數。OSM完整來源版本不等於真實世界已完整建檔。

預設「載入」使用隨附固定版，不需OSM金鑰；「更新」才手動查詢Overpass，不做背景替換。線上部分失敗會顯示缺漏，可按「載入內建固定版」還原。縣市界約11公尺、鄉鎮市區界約5公尺顯示簡化，非地籍或法定界址；行政界來源與授權見 [國土測繪中心下載頁](https://maps.nlsc.gov.tw/pro/download.jsp)。

「一鍵隱藏所有圖資」保留Google擬真3D；Bing等底圖可再次載入。`Ctrl+S` 會取消工作、關閉各功能及原版UI圖層，只保留Google擬真3D；儲存專案請用「專案／成果」按鈕。

## 即時交通、導航與CCTV

- TomTom使用真實車速相對於順暢速度的比例，綠色順暢、黃色變慢、紅色壅塞、紫色封路；路況細線一般1.3像素，封路2像素。
- 恢復原版風格的移動點位，依路況比例呈現快慢。點位是車流示意，非個別車輛定位或車輛數量；封路不產生移動點位。路況每兩分鐘更新，移動視野會查詢新區域。
- 起訖點可用TomTom搜尋，路線顯示名稱、距離、時間與轉向指示；「行車視角沿路線」可播放沿路低角度相機，不需GPS。定位導航另需使用者授權裝置位置。
- 「分析」中的CCTV可載入全台國道目錄、圈選或一鍵開啟總覽。每頁12路同時更新，可換頁、暫停、重連與關閉；來源離線逐路提示，不用合成影像代替。全台目錄不代表同時開啟1800多路。

## 專案、標註、分析與AI

- 匯入／匯出JSON，專案圖層可切換顯示、排序、刪除及改色。成果紀錄保存在目前網站資料，清除網站資料會移除紀錄，請另存下載檔。
- 標註與量測：先選工具、填色、框線與粗細，再繪製；圓形可指定半徑，多邊形顯示頂點。每個成果可排序、刪除，說明與AI分析置於可展開的子層級。
- 完成繪製後，手動加入已載入圖資、確認子圖層，再計算／AI解析。缺少可計數建物向量時顯示未知，不把Google擬真3D影像直接當作可計數的建物清冊。
- 全球地形與官方20m DTM分開取樣／標示，未取得真實高程時不填入虛構數據。官方DTM為大型選用下載，相關腳本在 `scripts/install-official-dtm.ps1`，不隨Git打包。
- AI空間助理可伸縮、清除對話、保存自訂風格，表格與粗體直接顯示格式。Gemini優先使用台灣中文與繁體中文逐字稿；真實API中文音訊已驗證，實際麥克風回音／語言仍需在使用者裝置確認。
- 左側工具列可收合，原版UI保留；`T`台灣、`G`全球，CCTV不使用`Ctrl+C`快捷鍵。

## 開發與重新建置

```powershell
npm.cmd --prefix .work/upstream run build
```

原始碼以 `overlay/` 覆蓋鎖定上游，首次安裝使用 `scripts/apply-overlay.mjs`；不要對已套用的工作區重複執行完整套用。沒有伺服器服務的GitHub Pages無法直接執行本程式。

大型OSM資料可由 `scripts/download-national-osm.mjs` 手動重建；需Python、osmium4.2與shapely2.1.2，非一般使用者的執行需求。下載來源、日期、SHA-256與授權保存在 `overlay/src/taiwan/data/` 的metadata。

## 打包、故障排除與授權

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-github.ps1
```

打包排除 `.work`、快取、日誌、`node_modules`、DTM及金鑰，產出逐檔SHA-256清單。請解壓縮後以Git提交原始碼，不直接把大型ZIP當成倉庫檔案。

- 畫面仍是舊版：按`Ctrl+F5`；確認網址為`127.0.0.1:4175`。
- 無法啟動：查看`logs/browser-launch.log`，檢查Node版本、Chrome及連接埠；避免將本機服務暴露到外網。
- 圖資未顯示：確認範圍／圖層顯示狀態／金鑰權限；道路與水系放大到街區查看全部線段。
- API額度不足或來源離線：以供應商回覆為準；不將快取冒稱最新。

程式授權見 [LICENSE](LICENSE)，第三方程式、圖資與服務見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。OSM／Geofabrik資料使用ODbL；行政界與鐵路使用政府資料開放授權條款第1版。保留原作者與來源標示。

本次瀏覽器驗收紀錄：[v11](docs/browser-fixes-v11-20261001.md)、[v12](docs/browser-fixes-v12-20261002.md)。
