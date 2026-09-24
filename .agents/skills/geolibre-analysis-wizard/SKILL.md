---
name: geolibre-analysis-wizard
description: |
  使用本 repository 的 GeoLibre 建立「從想法到成果」的 GIS 分析工作流。當使用者說要用 GeoLibre、做 GIS 查核、找風險點位、做道路/水利/災害/大地/建築/環境等空間分析，或直接要求使用 GeoLibre 技能時啟用。先協助使用者形成分析想法；若沒有想法，先提供主題選單，再提供該主題至少 3 個可執行的分析題目。確認題目後，自動尋找適當公開圖資、建立可重現 GIS 分析、產出 GeoLibre 專案與公開地圖、GeoLibre 畫面截圖、Excel 結果清單、GeoJSON 與分析摘要。
---

# GeoLibre GIS 分析嚮導

這是本 repository 的「使用者導向」GeoLibre Skill。它不是用來解釋 GIS 名詞，
而是要把使用者的一句自然語言需求，完成到可以檢視、下載、驗證的 GIS 成果。

底層 GeoLibre 專案格式、MCP、Python API、圖層樣式與 Embed API 規則，
優先參考：

- `GeoLibre/skills/geolibre/SKILL.md`
- `GeoLibre/skills/geolibre/references/`
- `GeoLibre/docs/user-guide/embedding.md`
- `GeoLibre/docs/mcp.md`

本 Skill 負責「分析嚮導、資料選擇、分析規劃、成果交付與 QA」；
不要複製或改寫官方 GeoLibre Skill 的底層工具規則。

## 0. 核心原則

1. **先幫使用者形成問題，再開始做 GIS。**
2. **只問必要問題。** 使用者已給定區域、期間、距離或條件時，不重問。
3. **優先使用官方、公開、可追溯資料。** 臺灣案件優先政府開放資料、NLSC、
   水利署、國土署、地調所/地礦中心、NCDR、地方政府等；其次才用 OSM 或
   其他公開資料補足。
4. **結果必須可重現。** 分析參數、資料來源、資料日期、座標系統與程式要留下。
5. **不把「分析成功」等同於「正式認定」。** 成果預設定位為查核/規劃篩選，
   除非來源本身就是法定認定資料。
6. **不能假裝已完成瀏覽器操作。** 只有真的載入 GeoLibre 並擷取畫面，才能說
   「GeoLibre 畫面截圖已完成」。
7. **盡量沿用現有 GeoLibre-Web，不為每個案件複製整套網站。**
   每個案件應產生新的 project/data artifacts。
8. **不要直接改 GeoLibre 核心原始碼，除非現有能力確實無法完成需求。**
   一般分析只新增 scripts、results、project、report 與必要 deployment entrypoint。

## 1. 對話入口：先判斷使用者有沒有想法

若使用者已直接給出分析題目，例如：

> 找出宜蘭縣最近 5 年淹水點 100 公尺內，又位於低窪地區，而且鄰近雨水下水道的道路。

直接進入「4. 確認分析規格」，不要再問「有沒有想法」。

若使用者只說「我要用 GeoLibre」「幫我做 GIS 分析」「使用 GeoLibre 技能」
而沒有明確題目，第一個回合只問：

> 你目前已經有想分析的 GIS 問題嗎？  
> A. 有，我直接描述需求  
> B. 還沒有，請先給我主題讓我選

若回答 A，接受自然語言題目並進入第 4 節。

若回答 B，進入第 2 節。

## 2. 無想法時：主題選單

讀取 `references/topic-catalog.md`。

一次提供 **12–16 個主題**，使用簡短編號選單，不先展開所有案例，避免資訊過載。
預設主題至少包含：

1. 水利與排水
2. 災害防救
3. 大地工程與邊坡
4. 道路養護
5. 交通安全
6. 河川與橋梁
7. 建築、危老與耐震
8. 地質與地質敏感
9. 都市計畫與土地使用
10. 公共管線
11. 環境與生態
12. 海岸與沿海風險
13. 農業、坡地與灌溉
14. 消防、避難與救災
15. 公共設施、學校與醫療
16. 淨零、碳排與綠地

詢問：

> 請選一個主題編號；也可以直接輸入你自己的主題。

## 3. 主題選定後：給「可直接執行」的分析想法

從 `references/topic-catalog.md` 取對應主題。

至少提供 **3 個建議**，最多 5 個。每一個建議必須：

- 是完整自然語言問題；
- 有明確空間條件；
- 能對應到至少 2 個 GIS 圖層；
- 優先可由公開資料完成；
- 能產出「點、線、面或風險分級」的明確成果。

例如「水利與排水」：

1. 找出宜蘭縣最近 5 年淹水點 100 公尺內，又位於低窪地區，而且鄰近雨水下水道的道路。
2. 找出雨水下水道末端或容量較弱區域，與歷史淹水熱點重疊且鄰近重要道路的區域。
3. 找出學校、醫院、消防據點周邊 300 公尺內，歷史淹水重複發生且排水設施不足的區域。

然後問：

> 你要選 1 / 2 / 3，還是自己輸入一個新的想法？

使用者一旦選定，**不要再回到主題選單**，直接進分析。

## 4. 確認分析規格

把自然語言需求解析成一份內部 Analysis Brief：

- `area`：分析區域
- `time_range`：期間
- `target`：最後要找出的對象
- `layers`：需要的資料圖層
- `predicates`：空間/屬性條件
- `thresholds`：距離、高程、坡度、次數等門檻
- `outputs`：地圖、Excel、截圖等
- `data_freshness`：資料最新程度要求

只有在「缺少該資訊就無法執行」時才提問。

若距離門檻未指定，可提出一個清楚標示的預設值，例如：

> 「鄰近雨水下水道」未指定距離，我建議先用 30 m；若沒有其他偏好我會以 30 m 執行。

不要靜默自創關鍵門檻。

## 5. 資料搜尋與來源選擇

先讀 `references/repo-profile.md`。

對每個必要圖層記錄：

- 圖層名稱
- 來源單位
- 官方資料頁/API/WMS/WMTS/ArcGIS endpoint
- 取得日期
- 資料期間
- 幾何型態
- CRS
- 是否需要 API key
- 是否允許瀏覽器 CORS
- 是否為官方資料或補充資料

優先順序：

1. 主管機關官方 API / 開放資料 / WMS / WMTS / FeatureServer
2. 國家級 GIS 開放服務
3. 地方政府公開 GIS
4. OpenStreetMap 等公開補充資料
5. 其他可驗證公開來源

若正式資料不存在或無法取得，必須明確說明替代來源，不得冒充官方資料。

## 6. 建立可重現分析

分析程式預設放在：

`scripts/geolibre_jobs/<slug>.py`

成果預設放在：

`GeoLibre-Web/analysis/<slug>/`

建議至少包含：

- `<slug>.geolibre.json`
- `result.geojson`
- `result.xlsx`
- `summary.json`
- `report.md`
- `map-overview.png`
- 必要時 `map-detail-01.png`、`map-detail-02.png`
- `index.html`（穩定公開入口）

分析工具按需求選：

- 向量：GeoPandas / Shapely / PyProj / GeoLibre Processing
- Raster / DEM：Rasterio / rio-tiler / Terrarium / COG
- 空間統計：GeoLibre statistics tools 或 Python
- 網路分析：GeoLibre network tools / Valhalla（有可用服務時）
- 進階地形水文：Whitebox / GeoLibre WASM（環境可用時）

所有距離與面積計算應先轉到合適的投影座標系統，不可直接用經緯度度數當公尺。

## 7. GeoLibre 專案組裝

使用 `.geolibre.json` 作為最終互動地圖載體。

地圖預設規則：

- 分析結果圖層放最上層、預設顯示；
- 原始/背景圖層降低透明度；
- 重要結果使用清楚但不誇張的樣式；
- 自動 fit/zoom 到結果範圍；
- 加入必要 legend；
- popup 至少顯示能解釋「為什麼這筆被選中」的欄位；
- UI 使用 `locale=zh-TW`；
- 結果圖層命名使用繁體中文；
- `metadata` 寫入資料來源、參數、分析日期與限制。

若專案已存在，優先新增/更新結果 project；不要複製整個 GeoLibre-Web app。

## 8. Excel 交付規格

讀取 `references/output-contract.md`。

`result.xlsx` 至少包含：

- **分析結果**：一列一個結果 feature / road segment / site
- **統計摘要**：筆數、長度/面積、風險級別、行政區統計
- **分析參數**：門檻、期間、CRS、分析規則
- **資料來源**：來源單位、網址、資料日期、用途與限制

必要欄位依主題決定；例如道路風險至少包含：

- 道路名稱
- 行政區
- 風險等級/分數
- 觸發條件
- 最近事件距離
- 事件次數/年份
- 鄰近設施距離
- DEM 高程/坡度（若有）
- feature id / OSM id / 官方 id（可追溯時）

Excel 必須有標題列、篩選、凍結首列與合理欄寬。

## 9. 取得真正的 GeoLibre 畫面

公開部署後，用真正的 GeoLibre 頁面擷取，不用自行畫一張「像地圖」的替代圖。

建議 URL：

`<GeoLibre base>/?url=<encoded project URL>&locale=zh-TW&layout=viewer&loading=true`

若可使用瀏覽器自動化（Playwright / agent-browser / Chromium）：

1. 開啟上述 URL；
2. 等待 `document.documentElement.dataset.geolibreLoadState` 成為 `ready`；
3. 檢查 `data-geolibre-load-errors`；
4. 擷取 overview；
5. 若有多個高風險群聚，再擷取 1–3 張 detail。

不得在 `loading` 或 `error` 狀態下宣稱畫面完成。

若執行環境沒有瀏覽器：
- 仍完成 project、公開地圖 URL、Excel、GeoJSON；
- 明確標記「GeoLibre 實際畫面截圖尚未驗證」；
- 不用 matplotlib 靜態圖冒充 GeoLibre 截圖。

## 10. QA：交付前一定做

至少檢查：

- 分析程式可重跑；
- 原始資料至少有一筆；
- 結果 feature count 合理；
- `.geolibre.json` 可解析；
- 結果 GeoJSON geometry 非空；
- public project URL 回傳成功；
- GeoLibre load state = ready（若有瀏覽器）；
- 沒有 CORS / 404 / layer load error；
- Excel 行數與 GeoJSON 結果筆數一致或可解釋；
- report 的統計數字與 summary.json 一致；
- 所有使用的非官方補充資料都有標示。

如果 QA 失敗，先修正，不要把半成品當完成品交付。

## 11. 最終回答格式

完成後以簡短、成果導向方式交付：

1. 一句話說明找到了什麼；
2. **公開 GeoLibre 地圖**
3. **GeoLibre 畫面截圖**
4. **Excel 結果清單**
5. GeoJSON / 報告（有需要）
6. 3–5 個主要發現
7. 一句限制說明

不要把大量程式細節放在最終回覆，除非使用者詢問。

## 12. Batch 與 Live 的邊界

本 Skill 是 **Batch / reproducible analysis**：
自然語言 → 分析 → project → 公開結果 → Excel/截圖。

不要把它硬塞成 Live 遙控技能。

若使用者要求：

- 「把我現在畫面上的圖層關掉」
- 「立即飛到蘇澳」
- 「我講一句話，現在的 GeoLibre 就跟著動」
- 「語音即時控制目前頁面」

這屬於未來的 `geolibre-live-control` Skill：
GPT/Agent → Control Bridge → Embed API → running GeoLibre。

兩個 Skill 應共用 topic recipes 與 analysis manifest，但權限與執行機制分開。
