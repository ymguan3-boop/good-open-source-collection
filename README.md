# 好用開源程式收集

- **2026-10-08｜上帝之眼・台灣版 v37**：缺口分類彙整、依實際成果產生可執行追蹤，首次安裝自動下載官方 DTM；[檢查與補裝說明](gods-eye-taiwan-desktop/docs/browser-v37-analysis-dtm-20261008.md)。

- **2026-10-08｜上帝之眼・台灣版 v36**：確認建議後直接回報成果，停止建議迴圈，過期方案有限重查與重複確認保護；[檢查與限制](gods-eye-taiwan-desktop/docs/browser-v36-confirmed-execution-20261008.md)。

- **2026-10-08｜上帝之眼・台灣版 v35**：工具列按鈕改用緊湊行高，紀錄恢復時序垂直MD清單；[改版說明](gods-eye-taiwan-desktop/docs/browser-v35-compact-toolbar-20261008.md)。

- **2026-10-07｜上帝之眼・台灣版 v34**：空間索引＋批次運算＋一次 AI 解讀，SQLite／FTS5 紀錄摘要檢索，分析中可插話、補充條件與停止；[驗收紀錄與限制](gods-eye-taiwan-desktop/docs/browser-v34-batch-analysis-20261007.md)。

- 2026-10-07｜上帝之眼・台灣版 v33：四個交通範例驗證、規劃表格、路線／模型點擊關閉、勾選圖資跨工作區分析與紀錄整合審計分析。詳見 [v33 驗收紀錄](gods-eye-taiwan-desktop/docs/browser-v33-joint-analysis-20261007.md)。

- 2026-10-07｜上帝之眼・台灣版 v32：視窗統一三個圖示、獨立說明視窗、真實額度血條、文字標籤工具入口及空拍 1.5～3 倍加速。詳見 [v32 檢查與限制](gods-eye-taiwan-desktop/docs/browser-v32-ui-aerial-20261007.md)。

- 2026-10-07｜上帝之眼・台灣版 v31：TDX 無可靠方案改查臺鐵官方公開班表，支援中繼停留與核實道路／鐵路路廊；工作中分階段回報、確認後自動結論與 3D 示意，AI 說明改為垂直雙入口。67/67 測試通過，真實宜蘭縣政府→羅東停留→臺北 12:25 抵達。詳見 [v31 驗收與限制](gods-eye-taiwan-desktop/docs/browser-v31-official-transit-20261007.md)。

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

[進入程式資料夾與完整安裝說明](gods-eye-taiwan-desktop/README.md)。以 God’s Eye View 與 Cesium 為核心，提供繁體中文瀏覽器介面及本機 Node 服務。

- 本版本只保留瀏覽器流程；不需 Rust、Tauri 或 WebView2。金鑰由 Windows DPAPI 加密保存。
- Google 擬真 3D 初始底圖、OSM 名稱標籤、NLSC 建物與台灣地形，保留官方座標；同載建物採真實 1 倍高程。
- 內建全臺道路、水系、水域、海岸線與官方鐵路，支援 22 縣市及 368 鄉鎮市區界。
- TomTom 路線與行車示意使用原創彩色汽車／機車 3D 模型，三種車身顏色分別保存，只顯示完整模型，遠距維持可見、摘要視窗可拖曳／縮小，虛線顏色、粗細可調；移除 GPS 導航及 AI 查核行程規劃。
- AI智慧大眾運輸整合TDX真實候選，表單／自然語言共用車種、車廂及混合乘客偏好；獨立官方票價引擎、可調TTL快取、來源與日期驗證、費用／時間比較，結果統一進AI空間助理。七種旅程模型由Blender製作，虛線粗細與顏色可保存，地圖路段可查看票價來源；官方未核實資料保持未知。見 [v27票價引擎與驗收限制](gods-eye-taiwan-desktop/docs/browser-v27-fare-engine-20261006.md)。
- v28 修正安全分類被當成AI回答及推理耗盡回答額度；免費文字模型輪替不限前三個。旅程問題在AI空間助理提出三項修正建議，使用者確認才重查，保留混合票種與中繼點。見 [v28實測與資料限制](gods-eye-taiwan-desktop/docs/browser-v28-assistant-transit-20261006.md)。
- v29 新增「按 AI 建議執行」與規劃結論、官方票價查核及有依據估算、自動 3D 旅程展示與導航配色區分；加入手繪軌跡刪除，修正航機第三人稱重疊。見 [v29驗收與限制](gods-eye-taiwan-desktop/docs/browser-v29-transit-execution-20261006.md)。
- v30 修正運輸建議按鈕／文字確認與自動規劃結論；TDX 真實服務狀態、官方重試倒數及官方票價網頁擷取接入既有 AI 空間助理。見 [v30 驗收與限制](gods-eye-taiwan-desktop/docs/browser-v30-transit-assistant-20261006.md)。
- CCTV 每頁 12 路，一鍵本機 YOLOX／ONNX 辨識，固定截圖與完整結果統一進 AI 空間助理；記錄可匯出 JPEG、Markdown 與 metadata。
- 電影空拍只保留手繪／自由兩模式，檢查目前場景地形與建物安全體積，支援六種可編輯拍攝範例、已驗走廊重用及提前檢查、OpenRouter參數格式驗證與自動免費備援修正、本機 WebM 預覽、手動匯出與記錄，Esc 停止不自動下載，不需要 AI Key。
- AI 空間助理、空拍與 CCTV 採共用可拖曳、縮放、縮小、隱藏與叫回的浮動視窗；保留專案、GIS、飛機視角、語音及資源控管。
- Gemini 語音可辨識明確圖資與區域、接續回答及提出候選，四種回覆角色及風格本機儲存、原生音訊平滑播放；地點使用深色矩形白字標籤，依名稱調整並緩慢閃爍五秒後消失；預設Gemini3.8、可選3.1並顯示雙色字幕；已修正搜尋設定造成的額度中斷，原Key已通過真實語音辨識抽測。最新驗收與限制見 [v25空拍補驗](gods-eye-taiwan-desktop/docs/browser-v25-aerial-20261005.md)、[v24歷史驗收](gods-eye-taiwan-desktop/docs/browser-v24-acceptance-20261005.md)、[人工清單](gods-eye-taiwan-desktop/docs/voice-v22-manual-checklist-20261004.md)。

### 安裝瀏覽器版

先安裝 Git、Node.js 24.14 以上的 24.x 或 26.x及 Google Chrome：

```powershell
git clone https://github.com/ymguan3-boop/good-open-source-collection.git
cd good-open-source-collection\gods-eye-taiwan-desktop
node .\scripts\install-browser.mjs
```

完成後雙擊「啟動上帝之眼-瀏覽器版.bat」。或下載整個倉庫 ZIP、解壓縮進入台灣版資料夾，交由 Agent 依 README 與 AGENTS.md 安裝。公開原始碼不包含本機金鑰、設定、官方 DTM 原始格網、日誌或安裝暫存。

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
