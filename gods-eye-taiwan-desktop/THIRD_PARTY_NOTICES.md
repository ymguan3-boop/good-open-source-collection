
# Third-party notices

## v22 原創模型與瀏覽器錄影

原創汽車、機車、四旋翼模型與 Blender 重製腳本採本專案 MIT 授權；參考 Toyota/Yamaha 公開產品頁的部件布局，沒有散布車廠照片、標誌或第三方模型。詳見 `assets/models/README.md`。Blender（GPL）僅用於開發製作，不納入瀏覽器執行依賴；原創輸出模型不含 Blender 程式碼。沒有新增付費套件、Camera API 或必要 AI API。錄影使用瀏覽器內建 MediaRecorder/captureStream，匯出仍使用既有 JSZip（MIT）、儲存使用既有 Dexie（Apache-2.0）。既有 Cesium（Apache-2.0）、ONNX Runtime（MIT）及 YOLOX（Apache-2.0）授權與資料來源標示保留。

This project builds on `bilawalsidhu/gods-eye-view`. Preserve upstream `LICENSE`, `DATA_SOURCES.md`, `THIRD_PARTY_NOTICES.md` and provider attribution in distributions.

Important: upstream source code is MIT, but third-party datasets and assets are not automatically MIT. Examples can include Cesium, OpenStreetMap-derived data, Google Photorealistic 3D Tiles, provider APIs, models and other datasets with separate terms.

The Taiwan-edition UI deliberately keeps Cesium/provider attribution visible in a low-interference corner rather than deleting it.

## Taiwan county boundaries (2026-10-01)

County polygons are derived from the National Land Surveying and Mapping Center dataset https://data.gov.tw/dataset/7442, downloaded from https://maps.nlsc.gov.tw/pro/download.jsp. The source uses Taiwan Open Government Data License 1.0. Original ZIP and full GeoJSON are retained in `data/official/counties/`; the bundled display/filter copy is simplified at approximately 11 metres and is not a cadastral or legal boundary. Source metadata is embedded in `overlay/src/taiwan/data/taiwan-counties.geojson`.

NLSC 3D Tiles remain streamed from their official service and retain provider credits. Building analysis reads published model attributes; it does not establish a current or legal building register. See `docs/browser-update-20261001.md` for source and method limitations.

## Bundled Taiwan OSM vectors (2026-09-30)

The four `overlay/src/taiwan/data/*-national.geojson.gz` datasets are derived from the Geofabrik Taiwan extract, https://download.geofabrik.de/asia/taiwan-260930.osm.pbf, containing OSM data through 2026-09-30T20:22:42Z. © OpenStreetMap contributors; extract by Geofabrik. These databases are distributed under the Open Database License (ODbL) 1.0, https://opendatacommons.org/licenses/odbl/1-0/ ; they are not covered by the application's MIT license. Preserve this attribution, the dataset metadata and the ODbL notice when redistributing these databases.

Source and derived checksums, county coverage and counts are in `osm-national-metadata.json`. Reproduce them with `scripts/download-national-osm.mjs` and `scripts/prepare-national-osm.py` (optional release tools requiring Python, osmium 4.2.0 and shapely 2.1.2). Original intersecting geometries and OSM tags are retained; county assignment uses the bundled simplified boundary. Coastlines use a 0.001-degree shoreline tolerance to accommodate boundary vintage differences. These data are a dated OSM snapshot, not a statutory road/water register or legal boundary.

## v12 行政界

新增內政部國土測繪中心鄉鎮市區界全臺主檔TOWN_MOI_1120317，368筆、22縣市，來源：https://maps.nlsc.gov.tw/download/鄉鎮市區界線(TWD97經緯度).zip 。2026-10-01下載，EPSG:3824經緯度作EPSG:4326顯示；約0.00005度（5公尺）顯示簡化。政府資料開放授權條款第1版。ZIP原始SHA-256、gzip SHA-256及來源保存在overlay/src/taiwan/data/taiwan-towns-metadata.json。未重複加入ZIP另附的馬家三和單區圖，不將顯示圖作法定界址。

## Local CCTV vision (v21)

- YOLOX-Tiny / YOLOX-Nano ONNX models: Megvii-BaseDetection, Apache-2.0, official `0.1.1rc0` release. Model weights are distributed separately from the application MIT license. Preserve `overlay/public/models/yolox/LICENSE-YOLOX.txt` and provenance. Source: https://github.com/Megvii-BaseDetection/YOLOX/releases/tag/0.1.1rc0 .
- ONNX Runtime Web `1.30.0`: Microsoft, MIT; preserve `overlay/public/models/onnxruntime/LICENSE-ONNX-Runtime.txt` and `ThirdPartyNotices.txt` for bundled dependencies. Source: https://github.com/microsoft/onnxruntime .
- Runtime Asyncify MJS/WASM binaries are copied from the same npm version used by the worker. No third-party CDN runtime or model download is required during use.
- Exact SHA-256 checksums, sizes, preprocessing and fixed sources: [provenance.json](overlay/public/models/provenance.json) and [PROVENANCE.md](overlay/public/models/PROVENANCE.md).
- Cinematic camera uses the existing CesiumJS dependency and adds no camera API or AI dependency. Existing imagery/terrain/provider terms remain applicable.
- Optional QA photos from COCO/YOLOX examples are kept in ignored local logs, not bundled with this distribution. They are not application assets or a Taiwan traffic accuracy benchmark.

## v23 公開新聞與模型清單

語音新聞工具按使用者要求查詢 Google News 公開 RSS（https://news.google.com/rss/search），保留標題、來源、日期及連結；新聞內容仍屬各出版者，不納入程式 MIT 授權，也不是官方輿情統計。不隨發布打包新聞全文、API Key 或使用者逐字稿。OpenRouter 公開模型目錄及 Gemini 模型診斷沿用既有 Provider。没有新增執行套件或必要付費依賴；自行選擇付費 OpenRouter 修正模型時仍適用供應商費率。NLSC 展示高程對齊不修改官方來源資料或授權標示。

## v24 原創霓虹 HUD、車身色彩與聲線角色（2026-10-05）

- 霓虹地點 HUD 參考使用者提供的外觀，由 `labelStyles.js` 使用瀏覽器內建 Canvas 繪製面板、圖示及地標文字；不隨程式散布該原始參考 PNG。新繪圖程式碼採本專案 MIT 授權，沒有新增圖像套件、字型下載或圖像生成服務。
- 六個 `taiwan-car-{blue,red,white}.glb`／`taiwan-scooter-{blue,red,white}.glb` 沿用本專案原創汽車與機車網格，只替換車身烤漆材質；輪胎、玻璃、燈具、網格與 binary buffer 保留。重製腳本為 `scripts/build-vehicle-colors.py`；模型及腳本採本專案 MIT，無第三方貼圖、品牌標誌或額外模型下載。
- 男聲／女聲／小女孩／小男孩角色使用既有 Gemini Live 預設 Charon／Aoede／Leda／Puck 聲線與文字風格提示；語音仍受 Google Gemini 服務條款及額度限制。兒童角色為虛構語氣，不是特定真人或供應商保證的專用兒童聲音。
- 本次沒有新增執行套件、外部服務 API、必要付費依賴、訂閱或 Camera API。空拍核心仍使用現有 Cesium 與瀏覽器 MediaRecorder；手動操作／本機錄影不需 AI Key。使用者明確選用付費 OpenRouter 規劃模型、既有地圖服務或 Gemini 語音時，仍依各供應商方案計費；不能把沒有新增費用依賴解讀為所有既有雲端服務免費。
- 有限距離 picking 適配器使用既有 Cesium 1.138.0 API／介面，未修改或複製新的第三方套件；保留 Cesium Apache-2.0 與供應商 attribution。私有介面版本限制與重新驗證要求見 `ARCHITECTURE.md`。

## v25 原創矩形標籤與空拍規劃（2026-10-05）

矩形地點標籤以既有瀏覽器 Canvas 繪製，未加入或散布參考 PNG。新增 aerialFreeSpace、aerialAiPlanner、aerialPlanningOutput 均為本專案原創程式碼，採現有 MIT 授權。沿用 CesiumJS Apache-2.0、MediaRecorder 及既有 OpenRouter provider，沒有新增套件、外部 API、必要付費相依或訂閱。選用 AI 規劃仍依使用者指定模型及 OpenRouter 服務額度；自動備援只用確認免費文字模型，排除 Lyria 音樂生成模型。官方影像／地形與模型既有授權及 attribution 保留。
