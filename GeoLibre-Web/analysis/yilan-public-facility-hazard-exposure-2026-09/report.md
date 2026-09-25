# 宜蘭縣公共設施與災害圖資交會分析：資料、方法與成果

產製時間：2026-09-25T14:32:08+00:00（UTC）。這份報告供初步查核排序，不代表法定危險認定或建築安全鑑定。

## 先看結果

以宜蘭縣內 **291 個公共設施點位**進行比對，**111 個**落在任一災害範圍內，或距離該範圍／歷史淹水點不超過 **300 公尺**。其中 23 個同時命中兩種以上災害資料群組；這只是『值得優先查核』的意思，**不是官方高風險等級**。

各類命中數：學校 51、醫療機構 20、政府機關 33、消防分隊 7。依災害群組計：地質敏感區 67、土石流影響範圍 28、近5年歷史淹水災點 39；**同一設施可能同時列入數個群組，不能把群組數相加當作設施總數**。

嚴格以學校代表點『直接落在』地質敏感區內來看，為 **11 筆校地點位、10 所學校**。這些點位命中的都是 **G0003 宜蘭平原地下水補注地質敏感區**，不是山崩、地滑區，也不能據此推論校舍危險。憲明國小在原始校地資料有兩筆相鄰圖徵，所以點位數比校名數多一筆。

## 打開地圖：畫面上每層是什麼

[開啟 GeoLibre 互動地圖](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/?locale=zh-TW&url=https%3A%2F%2Fymguan3-boop.github.io%2Fgood-open-source-collection%2FGeoLibre-Web%2Fanalysis%2Fyilan-public-facility-hazard-exposure-2026-09%2Fmap.geolibre.json)。圖層與分析輸入不是同一回事：部分資料只用於比對，沒有另畫在地圖上。

| 地圖圖層 | 畫面表示 | 對應的交付圖資與來源 |
|---|---|---|
| 公共設施複合災害暴露查核結果（紅點） | 111 個命中設施；包括相交與 300 公尺內鄰近點 | [result.geojson](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/result.geojson)；設施原點位來自下表四類來源，災害判定來自地質敏感區、土石流及歷史淹水資料 |
| 位於地質敏感區內的學校（黃點） | 11 筆**直接相交**的校地代表點，是紅點中的子集合，不含僅鄰近敏感區的學校 | [sensitive-schools.geojson](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/sensitive-schools.geojson)；學校校地取自國土測繪中心，命中依官方地質敏感區公告向量檔判斷 |
| 地下水補注地質敏感區（官方 WMS） | 供讀者目視對照的官方影像底圖 | 經濟部地質調查及礦業管理中心 WMS；**只供顯示**，實際點位相交判斷使用公告向量檔，不是依影像像素判讀 |
| 宜蘭縣行政界 | 顯示分析範圍邊界，不是災害判定 | [scope.geojson](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/scope.geojson)；來自官方行政界或報告記載的替代來源 |

**沒有獨立畫在此專案地圖上的分析圖資**：山崩與地滑等地質敏感區向量範圍、土石流影響範圍、歷史淹水點。它們確實參與空間計算；如需逐一顯示原始災害圖層，應另依來源授權、資料量與 GeoLibre 相容性製作，不可把紅點誤認為災害範圍面。

## 設施點位從哪裡來

| 類別 | 輸入點數 | 資料與定位方式 | 要注意的事 |
|---|---:|---|---|
| 學校 | 133 | 內政部國土測繪中心校地範圍；每筆校地取一個一定落在校地內的代表點 | 點落在敏感區，不等於整個校園或某棟校舍都在區內 |
| 醫療機構 | 42 | 國土測繪中心地標／醫療設施 API，保留醫院、衛生所、衛生室 | 不含所有診所，不是完整醫療機構名冊 |
| 消防分隊 | 18 | 內政部消防署開放資料中的分隊座標 | 原 CSV 的座標欄名與數值形式不一致，已按經緯度解讀，正式使用宜向提供者複核 |
| 政府機關 | 98 | iTaiwan 公共熱點中名稱符合政府機關者，以熱點位置作代理點 | 不是機關正式駐地或完整機關名冊，可能位於樓層／櫃臺 |

## 拿哪些災害資料比對、怎麼比

1. **地質敏感區**：使用經濟部地質調查及礦業管理中心公告向量檔（本次納入 3 個來源圖層／類型）。設施點落在區內，或距區界 300 公尺內，列為命中。嚴格的區內學校清單只採『點直接落在區內』。在全部結果中，直接落在地質敏感區的設施點為 23 個。
2. **土石流影響範圍**：使用農業部農村發展及水土保持署 115 年度資料；宜蘭範圍有 157 筆原始範圍圖徵。判斷點是否位於範圍內或距邊界 300 公尺內；直接落在影響範圍內為 7 個設施點。
3. **歷史淹水災點**：使用國家科學及技術委員會提供的近五年災點；宜蘭子集 137 筆，實際年份為 2021, 2022, 2024, 2025。設施點距歷史災點 300 公尺內即列為命中；**這是歷史事件附近，不是淹水潛勢範圍，也不是未來淹水預測**。

計算時把資料轉為臺灣適用的公尺座標系 EPSG:3826，才能量 300 公尺；輸出到網頁前再轉成經緯度 EPSG:4326。先用宜蘭縣界篩選資料，再逐一比對點與範圍或災點。若同一設施符合多種條件，成果保留一筆設施與各項命中明細。

## 每個輸出檔案到底是什麼

| 檔案 | 內容、對應圖層與用途 |
|---|---|
| [地圖入口 index.html](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/index.html)／[map.geolibre.json](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/map.geolibre.json) | 互動地圖入口與專案設定。專案內含上表四個可見圖層；紅點、黃點與縣界的 GeoJSON 已內嵌，地下水補注區由官方 WMS 顯示。**它不是原始災害資料全集**。 |
| [result.geojson](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/result.geojson)／[result.csv](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/result.csv) | 111 筆命中設施的點位圖資／同內容表格。GeoJSON 對應地圖**紅點**；CSV 可篩選設施類別、命中群組及距離。包含區內及 300 公尺內鄰近者。 |
| [sensitive-schools.geojson](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/sensitive-schools.geojson)／[sensitive-schools.csv](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/sensitive-schools.csv) | 11 筆直接位於地質敏感區內的學校代表點，對應地圖**黃點**；去重後 10 所，並非『所有附近學校』。 |
| [scope.geojson](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/scope.geojson) | 宜蘭縣分析邊界，對應地圖**縣界**，不是災害範圍。 |
| [result.xlsx](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/result.xlsx) | Excel：分析結果、統計摘要、分析參數、資料來源四個工作表；點位清單與 `result.csv` 對應，不另增加分析個案。 |
| [summary.json](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/summary.json) | 給程式使用的統計、門檻、資料來源、替代資料與限制；不是另一張地圖。 |
| [performance.json](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/performance.json) | 地圖檔容量與效能預算檢查；只驗大小，**不等於瀏覽器已成功畫出圖層**。 |
| [report.md](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/report.md)／[report.html](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/report.html) | 本報告的 Markdown 原稿與適合在瀏覽器閱讀的 HTML 版本；不含新增圖資。 |

## 區內學校清單

以下以學校名稱去重；點位及每筆原始名稱、座標請看 `sensitive-schools.csv`。

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

## 資料來源連結與採用依據

下表是本次程式實際記錄的來源；『備援／快取』表示官方服務當時無法穩定取得時使用先前保存的衍生資料，不應誤說為當次重新下載。

| 資料／圖層 | 提供者 | 官網或資料集 | 本次作用與限制 |
|---|---|---|---|
| 宜蘭縣縣界（NLSC鄉鎮市區界線衍生快取） | 內政部國土測繪中心（衍生） | [查看來源](https://data.gov.tw/dataset/7441) | 原始 NLSC 鄉鎮市區界線為 EPSG:3826；快取為 EPSG:4326，由宜蘭縣各鄉鎮市區聯集並以約100公尺容差簡化，僅供本次縣級範圍篩選。 |
| 國土測繪中心醫療設施 API 宜蘭分格衍生點位 | 內政部國土測繪中心 | [查看來源](https://data.gov.tw/dataset/139250) | 僅納入名稱核對為醫院、衛生所或衛生室的地標；不代表完整診所或醫療機構名冊。 |
| iTaiwan 宜蘭政府機關熱點代理點 | 數位發展部 | [查看來源](https://data.gov.tw/dataset/5962) | 熱點位置僅可當政府機關位置代理點；以約10公尺精度座標聚合相同場址，可能合併同址不同機關；僅涵蓋設有 iTaiwan 熱點且名稱符合條件的機關，不是政府機關完整名冊。 |
| 各級學校範圍圖_121分帶（宜蘭衍生點位快取） | 內政部國土測繪中心（衍生） | [查看來源](https://data.gov.tw/dataset/174606) | 由 NLSC 1150409 版 121 分帶校地 polygon 依校碼、校名及資料月份合併後取 representative point；快取輸出為 EPSG:4326，校點不代表校門或校舍。 |
| 救援與應變單位點位 | 內政部消防署 | [查看來源](https://data.gov.tw/dataset/5969) | 僅取名稱含「分隊」的紀錄。此版 CSV 欄名為 X座標_TWD97TM121／Y座標_TWD97TM121，但數值約121／24，實際為經緯度；程式依數值範圍判讀為 EPSG:4326 並轉至 EPSG:3826，建議與消防署複核欄位詮釋。 |
| 地質敏感區 G0003 宜蘭平原 | 經濟部地質調查及礦業管理中心 | [查看來源](https://data.gov.tw/dataset/27744) | 數值範圍為規劃參考；實際範圍與法定判定以公告圖資、主管機關及專業程序為準。 |
| 地質敏感區 H0010 龜山島火山碎屑堆積層 | 經濟部地質調查及礦業管理中心 | [查看來源](https://data.gov.tw/dataset/27744) | 數值範圍為規劃參考；實際範圍與法定判定以公告圖資、主管機關及專業程序為準。 |
| 地質敏感區 L0016 宜蘭縣 | 經濟部地質調查及礦業管理中心 | [查看來源](https://data.gov.tw/dataset/27744) | 數值範圍為規劃參考；實際範圍與法定判定以公告圖資、主管機關及專業程序為準。 |
| 近5年淹水災點資料 | 國家科學及技術委員會 | [查看來源](https://data.gov.tw/dataset/130016) | 本次官方檔案 year 欄位涵蓋全國2021–2025；宜蘭子集2023年沒有紀錄。資料集網頁仍註記2023年產製，與檔案年度不一致；2026年事件不在此檔。局部、零星都市道路或農漁塭淹水可能未納入。 |
| 115年度1753條土石流潛勢溪流影響範圍圖 | 農業部農村發展及水土保持署 | [查看來源](https://data.gov.tw/dataset/176526) | 僅使用影響範圍幾何，未使用原始屬性中的風險分級欄位；潛勢／影響範圍不代表災害必然發生，也不取代現勘或法定審查。 |

## 替代資料與使用界線

- 縣市界線原始下載網址這次拒絕存取（HTTP 403）；本次改用已核對的國土測繪中心鄉鎮市區界線衍生縣界。
- 上述縣界快取是把宜蘭縣各鄉鎮市區合併，並以約 100 公尺容差簡化，供縣級篩選與地圖顯示；不適合地籍級精度判定。
- 學校校地原始下載網址這次拒絕存取（HTTP 403）；本次使用先前由同版官方校地圖產生、已保存的宜蘭校地代表點。
- 歷史淹水資料即時下載發生連線加密協商錯誤；本次使用 2026-09-25 取得的同版官方 CSV 宜蘭子集快取。
- 原資料集網頁的標示年度，不一定等於本次下載檔的每筆紀錄年度；本報告以實際欄位統計為準。
- 點位交會只是初篩。校地代表點不等於校舍位置；熱點不等於正式機關地址；歷史淹水點不等於淹水潛勢圖。
- 地質敏感區的『地下水補注』類型不等於山崩危險。需要作安全、工程或法定判定時，仍須調閱最新公告圖資並實地確認。

## 總結

本次共比對 291 個公共設施點位，找出 111 個需進一步查看的點位；其中 10 所學校的 11 筆校地代表點直接落在 G0003 地下水補注地質敏感區。地圖紅點是全部命中設施，黃點是嚴格相交的學校子集；官方 WMS 僅作背景對照。建議先用 Excel／CSV 核對設施名稱與座標，再依官方最新公告、現地狀況與主管機關資料複核，勿直接把此圖當成風險分級或設施安全結論。
