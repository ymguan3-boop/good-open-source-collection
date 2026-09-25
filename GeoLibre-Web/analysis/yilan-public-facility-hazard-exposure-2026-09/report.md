# 宜蘭縣公共設施複合災害暴露查核

- 任務：`yilan-public-facility-hazard-exposure-2026-09`
- 範圍：宜蘭縣
- 產製時間（UTC）：2026-09-25T12:46:44+00:00
- 輸入公共設施數：291
- 各類輸入數：{"醫療機構": 42, "政府機關": 98, "學校": 133, "消防分隊": 18}
- 命中設施數：111
- 代表點位落在地質敏感區內的學校：11 個點位、去重後 10 所學校（不含僅在 300 公尺鄰近範圍者）
- 複合災害暴露（兩種以上群組）數：23（不是官方風險等級）

## 分析方法
以公共設施點位與災害幾何套疊；設施與災害 polygon 相交，或距離災害 geometry／淹水災點不超過 300 公尺，即列入結果。分析距離使用 `EPSG:3826`，成果輸出為 `EPSG:4326`。學校使用 NLSC 校地 polygon 的 representative point；消防分隊使用消防署官方座標；醫療機構取 NLSC 醫療設施 API 的醫院與衛生所；政府機關以 iTaiwan 熱點作位置代理。另以地質敏感區 polygon 與學校代表點直接相交，產製嚴格的區內學校清單。

## 採用資料與依據
|圖層／資料集|提供者|資料集／下載網址|CRS／角色|限制與用途|
|---|---|---|---|---|
|宜蘭縣縣界（NLSC鄉鎮市區界線衍生快取）|內政部國土測繪中心（衍生）|https://data.gov.tw/dataset/7441<br>https://github.com/ymguan3-boop/good-open-source-collection/blob/main/GeoLibre-Web/analysis-inputs/yilan-county-scope.geojson|EPSG:4326 → EPSG:3826<br>derived_scope_boundary_cache|原始 NLSC 鄉鎮市區界線為 EPSG:3826；快取為 EPSG:4326，由宜蘭縣各鄉鎮市區聯集並以約100公尺容差簡化，僅供本次縣級範圍篩選。|
|國土測繪中心醫療設施 API 宜蘭分格衍生點位|內政部國土測繪中心|https://data.gov.tw/dataset/139250<br>https://github.com/ymguan3-boop/good-open-source-collection/blob/main/GeoLibre-Web/analysis-inputs/yilan-official-medical.geojson|EPSG:4326 → EPSG:3826<br>official_hospital_and_health_center_points|API 未提供診所完整名冊；僅納入經名稱核對為醫院與衛生所的兩類地標。|
|iTaiwan 宜蘭政府機關熱點代理點|數位發展部|https://data.gov.tw/dataset/5962<br>https://github.com/ymguan3-boop/good-open-source-collection/blob/main/GeoLibre-Web/analysis-inputs/yilan-government-hotspot-proxies.geojson|EPSG:4326 → EPSG:3826<br>government_office_location_proxy_points_not_complete_roster|熱點位置僅可當政府機關位置代理點；以約10公尺精度座標聚合相同場址，可能合併同址不同機關；僅涵蓋設有 iTaiwan 熱點且名稱符合條件的機關，不是政府機關完整名冊。|
|各級學校範圍圖_121分帶（宜蘭衍生點位快取）|內政部國土測繪中心（衍生）|https://data.gov.tw/dataset/174606<br>https://github.com/ymguan3-boop/good-open-source-collection/blob/main/GeoLibre-Web/analysis-inputs/yilan-official-schools.geojson|EPSG:4326 → EPSG:3826<br>official_school_campus_representative_points_cache|由 NLSC 1150409 版 121 分帶校地 polygon 依校碼、校名及資料月份合併後取 representative point；快取輸出為 EPSG:4326，校點不代表校門或校舍。|
|救援與應變單位點位|內政部消防署|https://data.gov.tw/dataset/5969<br>https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/57F3DD1D-A40E-49A6-8410-57303B2FF87E/resource/C38B7AC2-E7F3-4DD5-A3F3-88E623B55924/download|EPSG:4326 → EPSG:3826<br>official_fire_station_points|僅取名稱含「分隊」的紀錄。此版 CSV 欄名為 X座標_TWD97TM121／Y座標_TWD97TM121，但數值約121／24，實際為經緯度；程式依數值範圍判讀為 EPSG:4326 並轉至 EPSG:3826，建議與消防署複核欄位詮釋。|
|地質敏感區 G0003 宜蘭平原|經濟部地質調查及礦業管理中心|https://data.gov.tw/dataset/27744<br>https://www.gsmma.gov.tw/uploads/16954297739938pmMCvKe.rar|EPSG:3826 → EPSG:3826<br>official_geological_sensitive_area|數值範圍為規劃參考；實際範圍與法定判定以公告圖資、主管機關及專業程序為準。|
|地質敏感區 H0010 龜山島火山碎屑堆積層|經濟部地質調查及礦業管理中心|https://data.gov.tw/dataset/27744<br>https://www.gsmma.gov.tw/uploads/1695430324140xr5WSRun.rar|EPSG:3826 → EPSG:3826<br>official_geological_sensitive_area|數值範圍為規劃參考；實際範圍與法定判定以公告圖資、主管機關及專業程序為準。|
|地質敏感區 L0016 宜蘭縣|經濟部地質調查及礦業管理中心|https://data.gov.tw/dataset/27744<br>https://www.gsmma.gov.tw/uploads/1695431430595DvA364F1.rar|EPSG:3826 → EPSG:3826<br>official_geological_sensitive_area|數值範圍為規劃參考；實際範圍與法定判定以公告圖資、主管機關及專業程序為準。|
|近5年淹水災點資料|國家科學及技術委員會|https://data.gov.tw/dataset/130016<br>https://github.com/ymguan3-boop/good-open-source-collection/blob/main/GeoLibre-Web/analysis-inputs/yilan-flood-points-2021-2025.csv|EPSG:3826 → EPSG:3826<br>official_historical_flood_points|本次官方檔案 year 欄位涵蓋全國2021–2025；宜蘭子集2023年沒有紀錄。資料集網頁仍註記2023年產製，與檔案年度不一致；2026年事件不在此檔。局部、零星都市道路或農漁塭淹水可能未納入。|
|115年度1753條土石流潛勢溪流影響範圍圖|農業部農村發展及水土保持署|https://data.gov.tw/dataset/176526<br>https://data.moa.gov.tw/OpenData/GetOpenDataFile.aspx?FileType=SHP&RID=71085&id=J73|EPSG:3826 → EPSG:3826<br>official_debris_flow_impact_area|僅使用影響範圍幾何，未使用原始屬性中的風險分級欄位；潛勢／影響範圍不代表災害必然發生，也不取代現勘或法定審查。|

## 結果統計
{
  "result_count": 111,
  "high_risk_count": 23,
  "by_facility_type": {
    "醫療機構": 20,
    "政府機關": 33,
    "學校": 51,
    "消防分隊": 7
  },
  "by_hazard_group": {
    "土石流影響範圍": 28,
    "地質敏感區": 67,
    "近5年歷史淹水災點": 39
  }
}

## 替代與資料限制
- 官方 NLSC 縣市界線下載或解析失敗：403 Client Error: Forbidden for url: https://www.tgos.tw/tgos/VirtualDir/Product/1cd4f4c9-6b01-4cf9-bf6c-23a73aa17d24/%E7%9B%B4%E8%BD%84%E5%B8%82%E3%80%81%E7%B8%A3%28%E5%B8%82%29%E7%95%8C%E7%B7%9A1140318.zip
- 使用已驗證的宜蘭縣範圍快取：由官方 NLSC 鄉鎮市區界線聯集並以約100公尺容差簡化
- NLSC 學校範圍圖即時下載或解析失敗，使用同版官方校地衍生點位快取：403 Client Error: Forbidden for url: https://www.tgos.tw/tgos/VirtualDir/Product/5f346c6b-edde-4fe7-8685-5585c0fb7852/%E5%90%84%E7%B4%9A%E5%AD%B8%E6%A0%A1%E7%AF%84%E5%9C%8D%E5%9C%96_121_1150409.zip
- 國科會淹水災點即時下載失敗，使用2026-09-25取得的同版官方CSV宜蘭子集快取：HTTPSConnectionPool(host='mas.nstc.gov.tw', port=443): Max retries exceeded with url: /OPENDATA/GetFile?fileodr=1&format=csv&serialno=455 (Caused by SSLError(SSLError(1, '[SSL: SSLV3_ALERT_HANDSHAKE_FAILURE] sslv3 alert handshake failure (_ssl.c:1010)')))
- `高風險`欄位在工作流中僅表示命中兩種以上災害群組，為查核排序用的複合暴露指標，不是官方風險分級。
- 淹水資料集網頁仍註記2023年產製；本次取得的官方檔案 year 欄位實際涵蓋2021–2025，宜蘭子集2023年為0筆，2026年未納入。
- NLSC 醫療設施 API 實測查詢半徑約限 5 公里，本次以 7 公里網格、5 公里半徑分格查詢去重；醫療類別只含醫院與衛生所，不代表完整診所名冊。
- iTaiwan 點位僅定位設有熱點且名稱符合政府機關關鍵字的地點，部分為樓層／櫃臺，非正式機關駐地邊界或完整機關名冊。
- 本次直接落在地質敏感區內的學校點位均命中 G0003 宜蘭平原地下水補注地質敏感區，非山崩與地滑區；此地質類型不能直接當作人身災害危險分級。憲明國小在官方校地圖有兩筆相鄰圖徵（其中一筆校名尾綴1），故點位數與去重學校數不同。
- 消防署 CSV 座標欄名含 TWD97TM121，但數值約 121／24；本次按經緯度解讀並轉換，應向資料提供者複核欄位定義。
- 地質敏感區、淹水災點與土石流影響範圍均為規劃／防災參考資料，不能取代法定公告、現地調查、專業簽證或工程安全鑑定。

## 交付檔案
- `map.geolibre.json`：GeoLibre 預設互動地圖
- `result.geojson`：完整命中設施點位
- `result.csv`：逐設施清單
- `sensitive-schools.geojson`／`sensitive-schools.csv`：代表點直接落在地質敏感區內的學校圖層及清單
- `result.xlsx`：分析結果、統計摘要、分析參數、資料來源
- `summary.json`：可機讀摘要
- `performance.json`：GeoLibre 效能檢查（由 optimizer 產生）
- `index.html`：穩定公開入口
