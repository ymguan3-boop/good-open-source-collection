# 上帝之眼・台灣版

以 **God's Eye View + CesiumJS** 為唯一 3D 地球核心的繁體中文、輕量化本機桌面版。

**修改者：官毅明**

## 下載與安裝

本專案採用 **下載開源原始碼 → 交給 Agent 在本機完成安裝** 的方式，不提供預先編譯安裝程式作為主要交付方式。

專案位置：

`ymguan3-boop/good-open-source-collection/gods-eye-taiwan-desktop`

GitHub：

`https://github.com/ymguan3-boop/good-open-source-collection/tree/main/gods-eye-taiwan-desktop`

### 一般使用者：Download ZIP

1. 開啟 `https://github.com/ymguan3-boop/good-open-source-collection`
2. 點 **Code → Download ZIP**。
3. 解壓縮後進入 `good-open-source-collection-main\gods-eye-taiwan-desktop`。
4. 將該資料夾交給可操作本機終端機的 Agent。
5. 對 Agent 說：

> 請依照本資料夾 AGENTS.md 安裝「上帝之眼・台灣版」。請執行 scripts/agent-install-windows.ps1，完成必要環境檢查、上游準備、相依套件安裝、Rust/Tauri 檢查、桌面捷徑建立，並啟動驗證 OSM、CCTV、Gemini Live 與資源監控。

Agent 會建立桌面捷徑 **上帝之眼・台灣版**；圖示直接使用專案內 `branding/gods-eye-taiwan.ico`。

### Git Clone

```powershell
git clone https://github.com/ymguan3-boop/good-open-source-collection.git
cd good-open-source-collection\gods-eye-taiwan-desktop
powershell -ExecutionPolicy Bypass -File .\scripts\agent-install-windows.ps1
```

## 為什麼桌面版會啟動本機 Provider Service？

God's Eye View 的 OSM Overpass、CCTV、天氣與部分即時資料使用 `/api/...` 本機代理。為了保留這些能力，本專案桌面捷徑不是只打開一個純靜態 WebView，而是執行：

```powershell
scripts\start-gods-eye-taiwan.ps1
```

該腳本以 Tauri release profile + `--no-watch` 啟動本機 provider service 與桌面視窗。這可避免開發用檔案監看，同時保留 CCTV/OSM 等即時服務。

## OpenStreetMap 更新方式

- 底圖：官方 OpenStreetMap tile source。
- 道路／鐵路／水系等分析向量：透過 Overpass API。
- **不做背景更新，也不顯示定期更新提醒。**
- 使用者在「內建基礎圖資」按「載入」或「更新」時，台灣版會帶入強制更新標記，略過本機 fresh cache，取得當下可用的最新 OSM / Overpass 資料。
- 「圖資 → 查看 OSM 資料時間」只有在使用者手動按下時才查詢 `osm3s.timestamp_osm_base`。
- 未手動更新時，既有圖層維持目前專案中的版本，不會在背景自動替換。
- 若公共 Overpass mirrors 暫時失效，介面應誠實顯示錯誤或備援狀態，不得把 stale 資料標示為最新。

## CCTV 最新畫面檢核

God's Eye View 的 active CCTV snapshot 預設約每 10 秒重新要求 frame，frame response 使用 `Cache-Control: no-store`。

「圖資 → 抽查 CCTV 最新畫面」會直接抽查 `/api/cctv/frame/...`，並讀取 `X-CCTV-Source`：

- `upstream-image`：直接取得 CCTV 上游最新 snapshot，可標示為目前畫面。
- `streetview`：Google Street View 備援，不是即時 CCTV。
- `synthetic`：合成備援，不是即時 CCTV。
- `live-media` / `hls-pull`：影片串流類型，由原版 CCTV 播放器處理。

第三方 CCTV 來源可能臨時離線，因此程式只在實際收到 `upstream-image` 時才標示「直接上游」，不會把備援畫面誤稱為最新 CCTV。

## Gemini 3.8 Live

設定頁新增 **Gemini API Key（Google AI Studio）**。

- Live model：`gemini-3.8-live`
- 長效 API Key：只存 Windows Credential Manager。
- Tauri/Rust 後端用長效 Key 向 Google 建立短效 ephemeral token。
- WebView 只取得 ephemeral token，直接連 Gemini Live。
- 一個圓形 Live 按鈕：按一次開始、再按一次停止。
- 初版可用語音工具：
  - 列出目前 GIS 圖層
  - 跳到台灣
  - 回完整地球
  - 對指定 GeoJSON 圖層建立 Buffer

Google Free Tier 的實際額度、可用地區與資料使用條件以 Google 當期官方政策為準。

## API Key 管理

全部集中在 **設定 → 服務與 API**：

- **Cesium ion Token**：啟動時從 Windows Credential Manager 讀回，再傳入 God's Eye View 的 `cesiumToken`。設定頁可按「驗證 Cesium Token」，實際測試目前上游使用的 ion Google Photorealistic 3D Tiles asset。
- Google Maps
- OpenRouter
- Gemini
- **TomTom API Key**：只由 Rust 後端讀取，用於地點搜尋與行車路線。

OpenRouter / Gemini / TomTom 長效 Key 不寫進 source code。Cesium / Google 因瀏覽器地圖 SDK 需要會傳入 WebView，因此應使用最小權限與 provider / URL 限制。

## 內建桌面 Icon

- 正式 icon：`branding/gods-eye-taiwan.ico`
- 品牌 master：`branding/icon-master.png`

更新 icon 後可執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\rebuild-desktop-shortcut.ps1
```

## 基本操作

- 預設：完整 3D 地球
- `T`：台灣視角
- `G`：全球視角
- `Ctrl + S`：儲存專案狀態
- 圖資：載入資料、檢核 OSM/CCTV 新鮮度
- 分析：Turf GIS 分析
- AI：OpenRouter 分析 + Gemini Live
- 設定：API Key / GPU / RAM / VRAM 策略

## 授權

台灣版自有 overlay 採 MIT License。God's Eye View、OpenStreetMap 與第三方圖資/API/模型/服務仍遵循各自授權與使用條款。


## 內建基礎圖資：道路／鐵路／水系分層

台灣版現在提供「內建基礎圖資」目錄，先用 OpenStreetMap / Overpass 將目前視窗範圍拆成真正獨立圖層：

- 道路中心線
- 鐵路
- 河川／水系中心線
- 面狀水域
- 海岸線

這些不是把整張底圖換顏色，而是產生可選取、可隱藏、可移除、可做 Buffer 或後續 GIS 分析的個別 GeoJSON layer。

### 為什麼不直接把全台資料全部包進程式？

為了維持輕量化，內建圖資採「按需載入」：

1. 只查詢目前 3D 視窗範圍。
2. 全球或全台尺度時會要求先放大到縣市或更小範圍。
3. 依省電／平衡／效能模式套用不同物件數上限與幾何簡化程度。
4. 預設不將大量線面貼地渲染，降低 Cesium terrain / GPU 負擔。
5. 更新時只替換該一個內建圖層，不重載其他圖層。

### NLSC 官方向量圖資

國土測繪中心目前已有道路、鐵路、水系等分開的 WFS：

- 道路中心線：`WFS:EMAP_ROAD`
- 台鐵：`WFS:EMAP_RAIL`
- 高鐵：`WFS:EMAP_HSRAIL`
- 捷運：`WFS:EMAP_MRT`
- 河川：`WFS:EMAP_RIVERA`
- 河川中線：`WFS:EMAP_RIVERL`
- 面狀水域：`WFS:EMAP_WATERA`
- 海岸線：`WFS:EMAP_COASTLINE`

這些圖層目前屬需申請使用的 WFS 服務，因此開源版只保留官方代碼與來源說明，不會未經授權把全台向量資料大量下載後隨程式散布。使用者取得合法介接權限後，可再接成「官方來源」模式。

## 輕量化顯示策略

預設平衡模式已調整為較保守配置：

- 40 FPS
- 0.9x 解析度比例
- 384 MB 3D Tiles cache

省電模式：

- 24 FPS
- 0.72x 解析度比例
- 192 MB 3D Tiles cache

內建向量圖層另有獨立 feature budget，避免道路、水系等密集資料一次塞入 Cesium。


## TomTom 行車路線與導航

台灣版已加入 TomTom Search + Routing：

- 設定頁可輸入 **TomTom API Key**，並按「驗證 TomTom Key」。
- 起點可留空使用 Windows / WebView2 目前位置，也可輸入地名。
- 目的地可直接輸入「宜蘭縣政府」、「羅東車站」等地點。
- TomTom Routing 會以 `traffic=true` 計算目前行車路線、距離、預估時間與交通延誤。
- 路線直接畫在既有 Cesium Viewer，不建立第二套地圖。
- 可「查看整條路線」、「導航視角」、「開始導航」、「停止導航」。
- 導航時只保留一條目前路線與一個目前位置標記，停止導航後不再持續取得位置。
- 實際定位導航需 Windows Location Services / WebView2 定位權限可用；若電腦沒有可用定位來源，仍可用指定起點與目的地顯示路線及導航視角。

### AI 語音導航

Gemini Live 已增加下列工具：

- `plan_driving_route`
- `show_route`
- `navigation_view`
- `start_navigation`
- `stop_navigation`

因此可以直接說：

- 「顯示從宜蘭縣政府到羅東車站的行車路線。」
- 「切換導航視角。」
- 「開始導航。」
- 「導航到宜蘭轉運站。」

AI 不會自己猜路線；真正路線由 TomTom Routing API 計算，再由 Cesium 顯示。
