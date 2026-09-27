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

## OpenStreetMap 新鮮度

- 底圖：官方 OpenStreetMap tile source。
- 審計分析向量資料：透過 Overpass API。
- 台灣版把一般分析快取縮短為：
  - 記憶體：15 分鐘
  - 磁碟：1 小時
  - 行政界：24 小時
- 「圖資 → 檢查 OSM 新鮮度」會強制略過正常 fresh cache，向 Overpass 取得資料，讀取 `osm3s.timestamp_osm_base` 顯示實際資料時間與延遲。
- 若公共 Overpass mirrors 暫時失效，上游仍可使用最後成功資料作為降級備援；介面不可把 stale 資料標示為最新。

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

- Cesium ion
- Google Maps
- OpenRouter
- Gemini

OpenRouter / Gemini 長效 Key 不寫進 source code。

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
