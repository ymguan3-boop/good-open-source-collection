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

[進入程式資料夾與完整安裝說明](gods-eye-taiwan-desktop/README.md)。以God’s Eye View與Cesium為核心，提供繁體中文瀏覽器／Tauri桌面版。

- 內建全台道路、水系、水域、海岸線與官方鐵路，支援22縣市切換。
- 新增22縣市界與368鄉鎮市區界；道路／水系依視野載入連續線段，街區尺度不再均勻抽樣。
- TomTom細線與動態點位呈現車流示意，支援地標搜尋、路線與行車視角。
- CCTV圈選及全台多畫面總覽，每頁12路連續更新；AI影像辨識自動選免費模型，失敗自動替換其他免費模型。
- 專案／匯入圖資可收合，行政界框線色與粗細可調，新增NLSC正射／電子底圖與台灣3D地形。
- NLSC建物修正低樓層地形遮蔽，提供圖磚載入進度；保持官方座標。
- 行車路線可新增／刪除／排序中途點，支援AI查核行程建議；飛機支援第一／第三人稱觀察與飛行資訊。
- 地圖文字標籤、量測、AI分析、Gemini中文語音圖資控制及本機資源監控。
- v18語音可接續「全台灣／宜蘭／新北市」區域回答，完整圖資＋區域直接執行，完成後回報結果；「帶我到某地」新增可拖曳地點標籤。
- AI對話可儲存為Markdown記錄，檢視／匯出單筆或全部，支援自訂回覆風格。
- 金鑰由Windows DPAPI加密保存，不提交GitHub。

### 安裝瀏覽器版（推薦）

先安裝Git、Node.js 24.14以上的24.x或26.x及Google Chrome；瀏覽器版不需要Rust。

```powershell
git clone https://github.com/ymguan3-boop/good-open-source-collection.git
cd good-open-source-collection\gods-eye-taiwan-desktop
node .\scripts\install-browser.mjs
```

完成後雙擊「啟動上帝之眼-瀏覽器版.bat」。或下載整個倉庫ZIP、解壓縮進入台灣版資料夾，交由Agent依README與AGENTS.md安裝。

Tauri桌面版另需Rust、C++ Build Tools與WebView2，再執行 `scripts/agent-install-windows.ps1`。本次以瀏覽器驗收，未重新驗收EXE。

2026-10-02 更新為 v17，修正語音指定縣市／全臺範圍回答接續與重複詢問，保留既有功能，新增語音範圍確認、可拖曳飛機觀察卡與地圖標籤、飛機視角切換修正、對話免費模型輪替、記錄緊湊排版，以及重啟後沿用自訂風格的本機備份。使用方式、金鑰、圖資來源與版本、更新與故障排除，均見上述繁體中文README。

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
