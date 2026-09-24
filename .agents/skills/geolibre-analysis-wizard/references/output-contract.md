# 成果交付契約

每次完成 GeoLibre 分析時，盡量產出下列完整成果。若某項受環境限制無法完成，
必須明確標記，不得假裝完成。

## 必要成果

### 1. GeoLibre Project

`<slug>.geolibre.json`

要求：

- 可被目前 GeoLibre-Web 載入
- 結果圖層預設可見
- camera 對準結果範圍
- metadata 含來源、時間、參數、限制
- popup 能解釋結果

### 2. 結果 GeoJSON

`result.geojson`

每個 feature 必須帶足夠屬性讓使用者知道：

- 這是什麼
- 在哪裡
- 為何被選中
- 哪些門檻符合
- 風險分數/等級（若有）
- 可追溯 id（若有）

### 3. Excel

`result.xlsx`

至少四個 worksheet：

#### 分析結果
每列一個結果 feature。

#### 統計摘要
建議包含：
- 總筆數
- 唯一道路/設施數
- 總長度/總面積
- 各行政區筆數
- 各風險級別筆數

#### 分析參數
例如：
- 分析區域
- 時間範圍
- Buffer 距離
- 鄰近距離
- DEM/坡度門檻
- 投影 CRS
- 風險分數公式

#### 資料來源
欄位：
- 圖層
- 來源單位
- URL
- 資料日期/期間
- 取得日期
- CRS
- 是否官方
- 用途
- 限制

格式要求：
- 凍結第一列
- 自動篩選
- 合理欄寬
- 數字/日期格式正確
- 不用 CSV 冒充 Excel

### 4. 分析摘要

`summary.json`

供程式與 QA 使用，至少有：

- generatedAt
- analysisArea
- analysisPeriod
- sourceCounts
- candidateCount
- resultCount
- parameters
- warnings
- outputs

### 5. 人類可讀報告

`report.md`

內容：
- 分析問題
- 資料來源
- 方法
- 參數
- 結果統計
- 主要發現
- 限制
- 輸出連結

## GeoLibre 畫面截圖

至少：

- `map-overview.png`：整體成果
- 若結果分散，增加 `map-detail-01.png` 等

截圖必須來自真正 GeoLibre 頁面。

畫面建議：

- viewer layout
- locale=zh-TW
- 結果圖層位於最上層
- 保留必要圖例
- 不讓大型 popup 擋住主要結果
- 解析度至少 1440×900（環境允許時）

## 穩定入口

`index.html`

只負責把使用者導向正確 GeoLibre project URL。
避免把 `locale`、`layout` 錯誤編碼進 `url=`。

## QA 對帳

交付前至少確認：

- Excel「分析結果」資料列數 = result GeoJSON feature count，或有清楚差異說明
- summary resultCount = GeoJSON feature count
- report 數字 = summary
- project 內結果圖層 feature count 與 result 一致（若 inline）
- public URL 非 404
- GeoLibre load errors 為空（若可瀏覽器驗證）
