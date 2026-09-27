# 好用開源程式收集

這個倉庫目前只保留 **3 套開源程式**，方便集中下載、比較與由 Agent 協助安裝。

## 倉庫結構

```text
good-open-source-collection/
├─ 上帝之眼/                  # God's Eye View 原版
├─ gods-eye-taiwan-desktop/  # 上帝之眼・台灣版
├─ GeoLibre/                 # GeoLibre 原版
└─ README.md
```

除上述三個程式資料夾與本 README 外，不再保留其他部署輸出、分析暫存、測試成果或舊腳本。

---

## 1. 上帝之眼原版

資料夾：

```text
上帝之眼/
```

來源專案：

https://github.com/bilawalsidhu/gods-eye-view

用途：

- CesiumJS 3D 地球
- 即時空間資料與圖層
- CCTV、交通、衛星、地震等資料來源
- 作為「上帝之眼・台灣版」的上游基礎

詳細使用方式與原作者說明，請進入：

```text
上帝之眼/README.md
```

---

## 2. 上帝之眼・台灣版

資料夾：

```text
gods-eye-taiwan-desktop/
```

這是本倉庫針對台灣 GIS、公共工程、審計與空間分析需求整理的桌面版。

主要特色：

- 繁體中文介面
- 完整地球與台灣快捷視角
- OpenStreetMap / Overpass 圖資
- 道路、鐵路、水系、水域、海岸線可分開成獨立圖層
- CCTV 即時來源檢核
- Gemini Live 語音操作，可呼叫 TomTom 行車路線與導航
- OpenRouter AI 分析
- GIS Buffer 等空間分析
- RAM / Swap / GPU / VRAM 資源監控
- 輕量化圖層載入與 GPU 保護
- TomTom 地點搜尋、行車路線、導航視角與定位跟隨
- Cesium ion Token / TomTom Key 可在設定中輸入並驗證
- OSM 圖層採手動載入／更新，不做背景更新提醒
- Windows 桌面捷徑與專案內建 Icon

### 下載

一般使用者可直接下載整個倉庫：

1. 進入本倉庫首頁。
2. 點選 **Code**。
3. 選擇 **Download ZIP**。
4. 解壓縮後進入：

```text
good-open-source-collection-main\gods-eye-taiwan-desktop
```

也可使用 Git：

```powershell
git clone https://github.com/ymguan3-boop/good-open-source-collection.git
cd good-open-source-collection\gods-eye-taiwan-desktop
```

### 使用 Agent 安裝

建議把 `gods-eye-taiwan-desktop` 資料夾交給可操作本機終端機的 Agent，並下達：

> 請依照此資料夾內的 AGENTS.md 安裝「上帝之眼・台灣版」，完成必要環境檢查、上游準備、相依套件安裝、桌面捷徑建立，並驗證 OSM 手動更新、CCTV、Cesium Token、TomTom 路線與導航、Gemini Live、圖資分層與 GPU/RAM 資源監控。

也可直接在 Windows PowerShell 執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\agent-install-windows.ps1
```

桌面捷徑會使用專案內：

```text
branding/gods-eye-taiwan.ico
```

更完整的下載、安裝、API Key、OSM、CCTV、Gemini Live 與圖資說明，請看：

```text
gods-eye-taiwan-desktop/README.md
```

---

## 3. GeoLibre

資料夾：

```text
GeoLibre/
```

來源專案：

https://github.com/opengeos/GeoLibre

GeoLibre 是瀏覽器／桌面／Jupyter 可使用的開源 GIS 工具與地理處理平台。

本倉庫現在只保留 **GeoLibre 原始程式本體**；先前額外產生的 `GeoLibre-Web/` 靜態部署輸出、分析案例、暫存成果與根目錄輔助腳本均不再保留，避免與真正的 GeoLibre 程式混在一起。

詳細使用、建置與授權資訊請查看：

```text
GeoLibre/README.md
```

---

## 下載整個倉庫

### Download ZIP

GitHub 首頁：

https://github.com/ymguan3-boop/good-open-source-collection

選擇：

```text
Code → Download ZIP
```

### Git Clone

```powershell
git clone https://github.com/ymguan3-boop/good-open-source-collection.git
```

下載後只需要依需求進入三個程式資料夾之一。

---

## 授權與來源

本倉庫是開源程式整理與延伸用途。

- **上帝之眼原版**：授權依原 God's Eye View 專案。
- **上帝之眼・台灣版**：自有 overlay 依其資料夾內 `LICENSE` 與 `THIRD_PARTY_NOTICES.md`。
- **GeoLibre**：授權依原 GeoLibre 專案。

第三方地圖、影像、API、模型、CCTV、OpenStreetMap、Cesium、Google、Gemini 等服務仍須遵守各自的授權與使用條款。
