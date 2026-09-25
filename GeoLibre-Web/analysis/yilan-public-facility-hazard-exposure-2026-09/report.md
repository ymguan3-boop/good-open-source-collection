# 宜蘭縣公共設施複合災害暴露查核

- 任務：`yilan-public-facility-hazard-exposure-2026-09`
- 分析範圍：宜蘭縣全縣
- 分析期間：歷史淹水資料實際紀錄年度 2021, 2022, 2024, 2025；地質敏感區採公告數值圖；土石流採民國115年度資料
- 空間門檻：與災害範圍相交，或距範圍／歷史淹水點不超過 300 公尺
- 核心判斷：設施點位符合任一災害群組即納入；學校直接落在地質敏感區內者另列，不把僅鄰近者算入區內清單
- 可分析設施點位：291 筆；命中：111 筆；未命中：180 筆
- 重要子結果：23 筆命中兩種以上災害群組；敏感區內學校 11 筆代表點、10 所學校
- 報告更新時間：2026-09-25T16:37:02+00:00（UTC）

## 方法

本次以宜蘭縣內的學校、醫療機構、消防分隊及政府機關代理點作為設施點位。學校位置由國土測繪中心校地範圍產生代表點；醫療點位來自國土測繪中心地標服務；消防分隊來自消防署資料；政府機關以 iTaiwan 熱點作位置代理。這些位置資料的完整性與精度不同，逐項限制列在「資料來源」章。

分析使用三類災害圖資：地質敏感區公告向量範圍（3 個類別）、民國115年度土石流影響範圍，以及國科會近五年歷史淹水災點。先以宜蘭縣界篩選資料，再將幾何統一到 TWD97／121分帶（EPSG:3826）計算距離；設施點與災害範圍相交，或距災害幾何／淹水點不超過 300 公尺，就記為命中。網頁圖資轉成經緯度（EPSG:4326）。同一設施即使命中多個群組，正式結果仍保留一筆設施並將各次命中記在明細欄。

學校另做較嚴格的子分析：只計校地代表點與地質敏感區公告向量面直接相交者，不把 300 公尺鄰近者算進去。地圖的地下水補注區 WMS 只供目視參考，計算使用的是公告向量資料。

## 分類

結果依設施命中的災害群組標記為「地質敏感區」、「土石流影響範圍」、「近5年歷史淹水災點」。相交與距離門檻內鄰近都會命中；每筆資料另保留實際距離、是否相交及來源編號。

「複合災害暴露／查核優先」表示同一設施命中至少 2 種不同災害群組，本次共 23 筆。這是方便安排後續查核的排序標籤，不是主管機關核定的危險等級；未達兩類的設施仍可能命中單一災害圖資。正式認定須回查公告資料與主管機關程序。

## 資料品質

| 設施類別 | 進入空間分析的點位 | 命中 | 未命中 |
|---|---:|---:|---:|
| 學校 | 133 | 51 | 82 |
| 醫療機構 | 42 | 20 | 22 |
| 消防分隊 | 18 | 7 | 11 |
| 政府機關 | 98 | 33 | 65 |
| 合計 | 291 | 111 | 180 |

設施點位在進入空間比對前已限定於宜蘭縣且具有可用座標；本次留下的 291 筆設施點均有幾何。各來源在形成快取前的原始總列數、缺座標列數及排除列數沒有完整保存在本任務摘要，因此**無法據此宣稱原始資料沒有缺漏**。上表的未命中是有點位但未符合空間條件，不是因資料錯誤而剔除。

| 災害資料 | 宜蘭縣輸入圖徵／期間 | 命中設施點（含鄰近） | 直接相交設施點 | 品質註記 |
|---|---:|---:|---:|---|
| 地質敏感區 | 3 個公告類別 | 67 | 23 | 學校直接相交子集 11 筆點位、10 所學校 |
| 土石流影響範圍 | 157 個範圍圖徵 | 28 | 7 | 使用民國115年度資料 |
| 歷史淹水災點 | 137 個點；2021, 2022, 2024, 2025 年 | 39 | 不適用（以距離判定） | 宜蘭縣2023年無紀錄；資料集頁面標示年度與檔案 year 欄位不一致 |

憲明國小原始校地資料有兩筆相鄰圖徵，因此學校子集的點位數與去重校名數相差一筆。敏感區內學校名稱如下：

1. 宜蘭縣三星鄉三星國民小學
2. 宜蘭縣三星鄉大隱國民小學
3. 宜蘭縣三星鄉憲明國民小學
4. 宜蘭縣三星鄉萬富國民小學
5. 宜蘭縣冬山鄉大進國民小學
6. 宜蘭縣大同鄉大同國民小學松羅分校
7. 宜蘭縣大同鄉寒溪國民小學
8. 宜蘭縣立三星國民中學
9. 耕莘健康管理專科學校宜蘭校區
10. 聖母醫護管理專科學校

## 重要限制

- 本分析是公開資料的空間初篩，不能代替法定地質敏感區認定、現勘、鑽探、工程安全鑑定或專業簽證。
- 點位距離災害圖層 300 公尺內只代表位置接近，不表示設施必然受災或存在因果關係。地下水補注敏感區也不等於山崩危險。
- 學校用校地代表點，不代表校門、校舍或校園全部範圍；政府機關用 iTaiwan 熱點作代理點，不是完整機關名冊或正式駐地。醫療資料包含醫院、衛生所及衛生室，不含完整診所名冊。
- 消防署 CSV 欄名寫 TWD97 TM121，但座標數值約為 121／24，程式按經緯度解讀後轉換；正式引用前建議向消防署確認欄位定義。
- 地質敏感區、土石流及淹水資料只用於空間比對；地圖獨立顯示的地下水補注 WMS 是背景參考。其他災害範圍沒有作為獨立地圖圖層呈現。
- 地質敏感區及學校官方原始下載部分遭拒絕存取，淹水資料下載發生連線錯誤；本次依來源章明示使用同版或已核對的快取，發布前應再向主管機關確認是否有更新版。

## 資料來源

| 提供單位與資料 | 官方資料集／服務 | 取得日期與座標系統 | 用途及限制 |
|---|---|---|---|
| 內政部國土測繪中心（衍生）・[宜蘭縣縣界（NLSC鄉鎮市區界線衍生快取）](https://data.gov.tw/dataset/7441) | [https://data.gov.tw/dataset/7441](https://data.gov.tw/dataset/7441) | 未標示；取得／快取日期 2026-09-25T16:36:48+00:00；EPSG:4326 → EPSG:3826 | derived scope boundary cache。原始 NLSC 鄉鎮市區界線為 EPSG:3826；快取為 EPSG:4326，由宜蘭縣各鄉鎮市區聯集並以約100公尺容差簡化，僅供本次縣級範圍篩選。 |
| 內政部國土測繪中心・[國土測繪中心醫療設施 API 宜蘭分格衍生點位](https://data.gov.tw/dataset/139250) | [https://data.gov.tw/dataset/139250](https://data.gov.tw/dataset/139250) | 未標示；取得／快取日期 2026-09-25T12:35:34.797175+00:00；EPSG:4326 → EPSG:3826 | official hospital and health center points。僅納入名稱核對為醫院、衛生所或衛生室的地標；不代表完整診所或醫療機構名冊。 |
| 數位發展部・[iTaiwan 宜蘭政府機關熱點代理點](https://data.gov.tw/dataset/5962) | [https://data.gov.tw/dataset/5962](https://data.gov.tw/dataset/5962) | 未標示；取得／快取日期 2026-09-25T12:38:53.492533+00:00；EPSG:4326 → EPSG:3826 | government office location proxy points not complete roster。熱點位置僅可當政府機關位置代理點；以約10公尺精度座標聚合相同場址，可能合併同址不同機關；僅涵蓋設有 iTaiwan 熱點且名稱符合條件的機關，不是政府機關完整名冊。 |
| 內政部國土測繪中心（衍生）・[各級學校範圍圖_121分帶（宜蘭衍生點位快取）](https://data.gov.tw/dataset/174606) | [https://data.gov.tw/dataset/174606](https://data.gov.tw/dataset/174606) | 未標示；取得／快取日期 2026-09-25T16:36:49+00:00；EPSG:4326 → EPSG:3826 | official school campus representative points cache。由 NLSC 1150409 版 121 分帶校地 polygon 依校碼、校名及資料月份合併後取 representative point；快取輸出為 EPSG:4326，校點不代表校門或校舍。 |
| 內政部消防署・[救援與應變單位點位](https://data.gov.tw/dataset/5969) | [https://data.gov.tw/dataset/5969](https://data.gov.tw/dataset/5969) | 未標示；取得／快取日期 2026-09-25T16:36:51+00:00；EPSG:4326 → EPSG:3826 | official fire station points。僅取名稱含「分隊」的紀錄。此版 CSV 欄名為 X座標_TWD97TM121／Y座標_TWD97TM121，但數值約121／24，實際為經緯度；程式依數值範圍判讀為 EPSG:4326 並轉至 EPSG:3826，建議與消防署複核欄位詮釋。 |
| 經濟部地質調查及礦業管理中心・[地質敏感區 G0003 宜蘭平原](https://data.gov.tw/dataset/27744) | [https://data.gov.tw/dataset/27744](https://data.gov.tw/dataset/27744) | 103年12月26日；取得／快取日期 2026-09-25T16:36:52+00:00；EPSG:3826 → EPSG:3826 | official geological sensitive area。數值範圍為規劃參考；實際範圍與法定判定以公告圖資、主管機關及專業程序為準。 |
| 經濟部地質調查及礦業管理中心・[地質敏感區 H0010 龜山島火山碎屑堆積層](https://data.gov.tw/dataset/27744) | [https://data.gov.tw/dataset/27744](https://data.gov.tw/dataset/27744) | 104年6月26日；取得／快取日期 2026-09-25T16:36:52+00:00；EPSG:3826 → EPSG:3826 | official geological sensitive area。數值範圍為規劃參考；實際範圍與法定判定以公告圖資、主管機關及專業程序為準。 |
| 經濟部地質調查及礦業管理中心・[地質敏感區 L0016 宜蘭縣](https://data.gov.tw/dataset/27744) | [https://data.gov.tw/dataset/27744](https://data.gov.tw/dataset/27744) | 105年8月29日；取得／快取日期 2026-09-25T16:36:58+00:00；EPSG:3826 → EPSG:3826 | official geological sensitive area。數值範圍為規劃參考；實際範圍與法定判定以公告圖資、主管機關及專業程序為準。 |
| 國家科學及技術委員會・[近5年淹水災點資料](https://data.gov.tw/dataset/130016) | [https://data.gov.tw/dataset/130016](https://data.gov.tw/dataset/130016) | ['2021', '2022', '2024', '2025']；取得／快取日期 2026-09-25T16:36:59+00:00；EPSG:3826 → EPSG:3826 | official historical flood points。本次官方檔案 year 欄位涵蓋全國2021–2025；宜蘭子集2023年沒有紀錄。資料集網頁仍註記2023年產製，與檔案年度不一致；2026年事件不在此檔。局部、零星都市道路或農漁塭淹水可能未納入。 |
| 農業部農村發展及水土保持署・[115年度1753條土石流潛勢溪流影響範圍圖](https://data.gov.tw/dataset/176526) | [https://data.gov.tw/dataset/176526](https://data.gov.tw/dataset/176526) | 未標示；取得／快取日期 2026-09-25T16:37:02+00:00；EPSG:3826 → EPSG:3826 | official debris flow impact area。僅使用影響範圍幾何，未使用原始屬性中的風險分級欄位；潛勢／影響範圍不代表災害必然發生，也不取代現勘或法定審查。 |

| 來源取得狀況 | 本次處理方式 |
|---|---|
| NLSC 縣界與學校範圍原始下載有 HTTP 403 | 使用先前同版官方鄉鎮界線聯集縣界及校地圖衍生點位快取；縣界以約100公尺容差簡化，僅供縣級範圍分析 |
| 國科會歷史淹水災點下載發生 TLS 連線錯誤 | 使用 2026-09-25 保存的同版官方 CSV 宜蘭子集；資料年度按檔案欄位判讀，沒有 2023 年宜蘭紀錄 |
| 醫療點與政府機關熱點使用已保存的官方 API／開放資料衍生點位 | 醫療地標包含醫院、衛生所與衛生室；iTaiwan 熱點只作政府機關代理位置，皆非完整名冊 |

## 交付檔案

| 檔案 | 用途 |
|---|---|
| [index.html](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/index.html)、[map.geolibre.json](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/map.geolibre.json) | 穩定地圖入口及 GeoLibre 專案；紅點、黃點與縣界為內嵌向量圖資，地下水補注區為官方 WMS。 |
| [result.geojson](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/result.geojson) | 完整正式分析結果，共 111 個設施點，對應地圖紅點。 |
| [sensitive-schools.geojson](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/sensitive-schools.geojson) | 地質敏感區內學校代表點，共 11 點、去重後 10 所，對應地圖黃點。 |
| [scope.geojson](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/scope.geojson) | 宜蘭縣分析範圍面，對應地圖縣界。 |
| [result.csv](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/result.csv) | 逐筆查核清單，與完整結果相同筆數。 |
| [sensitive-schools.csv](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/sensitive-schools.csv) | 區內學校逐點清單，與學校 GeoJSON 相同筆數。 |
| [result.xlsx](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/result.xlsx) | Excel 分析結果、統計摘要、分析參數、資料來源四個工作表。 |
| [summary.json](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/summary.json) | 機器可讀的筆數、條件、來源及限制摘要。 |
| [performance.json](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/performance.json) | 專案容量與首次載入效能預算結果；不能單獨證明地圖畫面正常。 |
| overview.geojson | 本次完整成果只有111個設施點且小於大型資料門檻，依技能門檻不需另產 overview。 |
| [report.md](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/report.md)、[report.html](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/report.html) | 正式 Markdown 報告與適合瀏覽器閱讀的網頁版。 |
| [viewer-qa/viewer-qa.json](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/viewer-qa/viewer-qa.json) | 雙入口、桌面與手機 viewport 的瀏覽器驗收紀錄。 |
| [viewer-qa/self_hosted-desktop.png](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/viewer-qa/self_hosted-desktop.png)、[viewer-qa/self_hosted-android.png](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/viewer-qa/self_hosted-android.png)、[viewer-qa/official-desktop.png](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/viewer-qa/official-desktop.png)、[viewer-qa/official-android.png](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/viewer-qa/official-android.png) | 自架與官方 GeoLibre 在桌面及 Android viewport 的實際瀏覽器畫面。 |
| [map-overview.png](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/map-overview.png) | 自架 GeoLibre 桌面版實際畫面截圖。 |

## 圖層—圖資—檔案對照

| 地圖中的圖層 | 對應資料 | 對應輸出 | 解讀方式 |
|---|---|---|---|
| 公共設施複合災害暴露查核結果（紅點） | 四類設施點位與三種災害圖資的空間比對 | [result.geojson](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/result.geojson)、[result.csv](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/result.csv) | 111 筆相交或 300 公尺內鄰近設施 |
| 位於地質敏感區內的學校（黃點） | NLSC 校地代表點與公告地質敏感區向量面直接相交 | [sensitive-schools.geojson](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/sensitive-schools.geojson)、[sensitive-schools.csv](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/sensitive-schools.csv) | 紅點的嚴格子集合；只計直接落在區內的點 |
| 宜蘭縣行政界 | 官方鄉鎮界線聯集衍生快取 | [scope.geojson](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/scope.geojson) | 顯示分析範圍，不是災害圖層 |
| 地下水補注地質敏感區（官方 WMS） | 地質調查及礦業管理中心 WMS | 僅在 map project 作背景顯示 | 目視參考；計算採公告向量檔 |

山崩與地滑向量區、土石流影響範圍及歷史淹水點都參與紅點的分析，但本次沒有把它們獨立畫成地圖圖層。地圖紅點不是災害範圍面。

## 效能與發布驗證

GeoLibre 專案檔約 203339 bytes；專案、inline 圖層、可見圖層及手機初始載入硬性預算狀態：專案 True、inline True、手機 True。效能檔只說明大小預算，不代表瀏覽器已顯示圖層。

## 瀏覽器畫面驗證

QA 執行時間：2026-09-25T16:29:15.930257+00:00；使用 Playwright Chromium。自架與官方入口均以同一 map project 測試桌面及 Android 手機 viewport。

| 入口 | 裝置模式 | 結果 | ready／錯誤 | 畫布與圖層 | 截圖 |
|---|---|---|---|---|---|
| 自架 GitHub Pages | 桌面 | FAIL | ready／[] | canvas=True，圖層=True，彩色像素比例=0.579 | [檢視截圖](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/viewer-qa/self_hosted-desktop.png) |
| 自架 GitHub Pages | Android 手機 viewport | FAIL | ready／[] | canvas=True，圖層=False，彩色像素比例=0.687 | [檢視截圖](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/viewer-qa/self_hosted-android.png) |
| 官方 GeoLibre 備援 | 桌面 | FAIL | ready／[] | canvas=True，圖層=True，彩色像素比例=0.634 | [檢視截圖](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/viewer-qa/official-desktop.png) |
| 官方 GeoLibre 備援 | Android 手機 viewport | FAIL | ready／[] | canvas=True，圖層=True，彩色像素比例=0.595 | [檢視截圖](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/viewer-qa/official-android.png) |

整體驗收門檻：至少一個入口須同時通過桌面與手機模式。最新紀錄：**FAIL**。

## 後續查核建議

建議先用 Excel／CSV 核對設施名稱、代表點座標及命中明細，再向主管機關確認最新公告圖資與原始地址。對位於或鄰近敏感區的校園，應進一步確認實際校舍位置、基地範圍及現地條件；需要工程或安全結論時，交由主管機關與合格專業人員辦理。

## 總結

本次比對 291 個宜蘭公共設施點位，111 個符合至少一種空間條件，其中 23 個命中兩種以上資料群組。另有 10 所學校的 11 筆代表點直接落在 G0003 地下水補注地質敏感區。紅點呈現全部命中設施，黃點呈現直接相交的學校子集。這些結果適合作為後續核對與查訪順序，不是法定風險或設施安全判定。
