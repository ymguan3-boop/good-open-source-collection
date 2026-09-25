# 宜蘭縣公共設施複合災害暴露查核

- 任務：`yilan-public-facility-hazard-exposure-2026-09`
- 範圍：宜蘭縣
- 產製時間（UTC）：2026-09-25T12:20:50+00:00
- 輸入公共設施數：133
- 命中設施數：51
- 複合災害暴露（兩種以上群組）數：13（不是官方風險等級）

## 分析方法
以公共設施點位與災害幾何套疊；設施與災害 polygon 相交，或距離災害 geometry／淹水災點不超過 300 公尺，即列入結果。分析距離使用 `EPSG:3826`，成果輸出為 `EPSG:4326`。學校使用 NLSC 校地 polygon 的 representative point；消防分隊優先使用消防署官方座標；醫療機構與政府機關以 OSM／Overpass 補充。

## 採用資料與依據
|圖層／資料集|提供者|資料集／下載網址|CRS／角色|限制與用途|
|---|---|---|---|---|
|宜蘭縣縣界（NLSC鄉鎮市區界線衍生快取）|內政部國土測繪中心（衍生）|https://data.gov.tw/dataset/7441<br>https://github.com/ymguan3-boop/good-open-source-collection/blob/main/GeoLibre-Web/analysis-inputs/yilan-county-scope.geojson|EPSG:4326 → EPSG:3826<br>derived_scope_boundary_cache|原始 NLSC 鄉鎮市區界線為 EPSG:3826；快取為 EPSG:4326，由宜蘭縣各鄉鎮市區聯集並以約100公尺容差簡化，僅供本次縣級範圍篩選。|
|各級學校範圍圖_121分帶（宜蘭衍生點位快取）|內政部國土測繪中心（衍生）|https://data.gov.tw/dataset/174606<br>https://github.com/ymguan3-boop/good-open-source-collection/blob/main/GeoLibre-Web/analysis-inputs/yilan-official-schools.geojson|EPSG:4326 → EPSG:3826<br>official_school_campus_representative_points_cache|由 NLSC 1150409 版 121 分帶校地 polygon 依校碼、校名及資料月份合併後取 representative point；快取輸出為 EPSG:4326，校點不代表校門或校舍。|
|地質敏感區 G0003 宜蘭平原|經濟部地質調查及礦業管理中心|https://data.gov.tw/dataset/27744<br>https://www.gsmma.gov.tw/uploads/16954297739938pmMCvKe.rar|EPSG:3826 → EPSG:3826<br>official_geological_sensitive_area|數值範圍為規劃參考；實際範圍與法定判定以公告圖資、主管機關及專業程序為準。|
|地質敏感區 H0010 龜山島火山碎屑堆積層|經濟部地質調查及礦業管理中心|https://data.gov.tw/dataset/27744<br>https://www.gsmma.gov.tw/uploads/1695430324140xr5WSRun.rar|EPSG:3826 → EPSG:3826<br>official_geological_sensitive_area|數值範圍為規劃參考；實際範圍與法定判定以公告圖資、主管機關及專業程序為準。|
|地質敏感區 L0016 宜蘭縣|經濟部地質調查及礦業管理中心|https://data.gov.tw/dataset/27744<br>https://www.gsmma.gov.tw/uploads/1695431430595DvA364F1.rar|EPSG:3826 → EPSG:3826<br>official_geological_sensitive_area|數值範圍為規劃參考；實際範圍與法定判定以公告圖資、主管機關及專業程序為準。|
|近5年淹水災點資料|國家科學及技術委員會|https://data.gov.tw/dataset/130016<br>https://github.com/ymguan3-boop/good-open-source-collection/blob/main/GeoLibre-Web/analysis-inputs/yilan-flood-points-2021-2025.csv|EPSG:3826 → EPSG:3826<br>official_historical_flood_points|本次官方檔案 year 欄位涵蓋全國2021–2025；宜蘭子集2023年沒有紀錄。資料集網頁仍註記2023年產製，與檔案年度不一致；2026年事件不在此檔。局部、零星都市道路或農漁塭淹水可能未納入。|
|115年度1753條土石流潛勢溪流影響範圍圖|農業部農村發展及水土保持署|https://data.gov.tw/dataset/176526<br>https://data.moa.gov.tw/OpenData/GetOpenDataFile.aspx?FileType=SHP&RID=71085&id=J73|EPSG:3826 → EPSG:3826<br>official_debris_flow_impact_area|潛勢／影響範圍供防災規劃與風險提醒，不代表災害必然發生，也不取代現勘或法定審查。|

## 結果統計
{
  "result_count": 51,
  "high_risk_count": 13,
  "by_facility_type": {
    "學校": 51
  },
  "by_hazard_group": {
    "土石流影響範圍": 16,
    "地質敏感區": 31,
    "近5年歷史淹水災點": 17
  }
}

## 替代與資料限制
- 官方 NLSC 縣市界線下載或解析失敗：403 Client Error: Forbidden for url: https://www.tgos.tw/tgos/VirtualDir/Product/1cd4f4c9-6b01-4cf9-bf6c-23a73aa17d24/%E7%9B%B4%E8%BD%84%E5%B8%82%E3%80%81%E7%B8%A3%28%E5%B8%82%29%E7%95%8C%E7%B7%9A1140318.zip
- 使用已驗證的宜蘭縣範圍快取：由官方 NLSC 鄉鎮市區界線聯集並以約100公尺容差簡化
- OSM／Overpass 設施補充資料下載失敗，後續僅使用可取得的官方學校／消防資料：所有 Overpass 設施端點均失敗：HTTPSConnectionPool(host='overpass.private.coffee', port=443): Read timed out. (read timeout=90)
- NLSC 學校範圍圖即時下載或解析失敗，使用同版官方校地衍生點位快取：403 Client Error: Forbidden for url: https://www.tgos.tw/tgos/VirtualDir/Product/5f346c6b-edde-4fe7-8685-5585c0fb7852/%E5%90%84%E7%B4%9A%E5%AD%B8%E6%A0%A1%E7%AF%84%E5%9C%8D%E5%9C%96_121_1150409.zip
- 消防署官方資料下載或解析失敗，保留 OSM 消防分隊補充資料：消防署 CSV 缺少經緯度欄位：['消防隊名稱', '地址', '聯絡電話', 'X座標_TWD97TM121', 'Y座標_TWD97TM121', 'Unnamed: 5', 'Unnamed: 6', 'Unnamed: 7', 'Unnamed: 8', 'Unnamed: 9', 'Unnamed: 10', 'Unnamed: 11', 'Unnamed: 12', 'Unnamed: 13', 'Unnamed: 14', 'Unnamed: 15', 'Unnamed: 16', 'Unnamed: 17', 'Unnamed: 18', 'Unnamed: 19', 'Unnamed: 20', 'Unnamed: 21', 'Unnamed: 22', 'Unnamed: 23']
- 國科會淹水災點即時下載失敗，使用2026-09-25取得的同版官方CSV宜蘭子集快取：HTTPSConnectionPool(host='mas.nstc.gov.tw', port=443): Max retries exceeded with url: /OPENDATA/GetFile?fileodr=1&format=csv&serialno=455 (Caused by SSLError(SSLError(1, '[SSL: SSLV3_ALERT_HANDSHAKE_FAILURE] sslv3 alert handshake failure (_ssl.c:1010)')))
- `高風險`欄位在工作流中僅表示命中兩種以上災害群組，為查核排序用的複合暴露指標，不是官方風險分級。
- 淹水資料集網頁仍註記2023年產製；本次取得的官方檔案 year 欄位實際涵蓋2021–2025，宜蘭子集2023年為0筆，2026年未納入。
- OSM 醫療機構與政府機關資料屬補充性點位，不能解讀為完整官方名冊；應與衛生福利部、地方政府機關名冊複核。
- 地質敏感區、淹水災點與土石流影響範圍均為規劃／防災參考資料，不能取代法定公告、現地調查、專業簽證或工程安全鑑定。

## 交付檔案
- `map.geolibre.json`：GeoLibre 預設互動地圖
- `result.geojson`：完整命中設施點位
- `result.csv`：逐設施清單
- `result.xlsx`：分析結果、統計摘要、分析參數、資料來源
- `summary.json`：可機讀摘要
- `performance.json`：GeoLibre 效能檢查（由 optimizer 產生）
- `index.html`：穩定公開入口
