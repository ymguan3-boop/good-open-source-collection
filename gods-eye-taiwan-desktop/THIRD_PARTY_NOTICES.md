
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
