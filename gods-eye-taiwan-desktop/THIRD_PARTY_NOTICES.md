
# Third-party notices

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
