# GeoLibre 網頁版（含繁體中文自建版）

這是從 GeoLibre 原始碼自建的靜態網頁版，已內含繁體中文（zh-TW）主介面。

- 線上使用：https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/?locale=zh-TW
- 在繁體 Windows／瀏覽器上直接開 `.../GeoLibre-Web/` 也會自動辨識為繁體中文。
- 切換語言：App 內 Settings → Language → 繁體中文。

## Whitebox 進階工具繁中化

Whitebox 數百個工具名稱需另行匯入語言包（同目錄 `geolibre-whitebox-zh-TW-pack.json`）：

1. 開啟網頁版 → Settings → Language
2. 用 Import 功能選擇 `geolibre-whitebox-zh-TW-pack.json`
3. Whitebox 工具箱即顯示繁體中文

## 臺灣地質敏感區圖層

已新增由經濟部地質調查及礦業管理中心公開 WMS 建立的四個顯示圖層：

- 活動斷層地質敏感區
- 地下水補注地質敏感區
- 地質遺跡地質敏感區
- 山崩與地滑地質敏感區

- 直接開啟圖層專案：[臺灣地質敏感區 GeoLibre 專案](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/?locale=zh-TW&url=https%3A%2F%2Fymguan3-boop.github.io%2Fgood-open-source-collection%2FGeoLibre-Web%2Ftaiwan-geological-sensitive-areas.geolibre.json)
- 專案檔：[taiwan-geological-sensitive-areas.geolibre.json](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/taiwan-geological-sensitive-areas.geolibre.json)
- 官方服務：[地質資料整合查詢服務](https://geomap.gsmma.gov.tw/gsb108-1/list_service.cfm)

目前為全臺官方 WMS 影像顯示層，使用 EPSG:4326、2048×2048 全域影像覆蓋，因此縮放時不會重新切換圖磚解析度。圖層標記為 DISPLAY_ONLY，僅供圖資套疊與初步查詢，不取代現地調查、鑽探試驗、法定程序或專業簽證。

## 敏感區學校點位與清單

已依官方向量資料完成全臺學校校園範圍與地質敏感區範圍套疊，共 **597 個學校點位**：

- [直接開啟含學校點位的地圖](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/?locale=zh-TW&url=https%3A%2F%2Fymguan3-boop.github.io%2Fgood-open-source-collection%2FGeoLibre-Web%2Ftaiwan-geological-sensitive-areas.geolibre.json)
- [GeoJSON 點位資料](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/school-sensitive-areas.geojson)
- [CSV 清單](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/school-sensitive-areas.csv)
- [Markdown 清單](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/school-sensitive-areas.md)
- [空間分析 QA 紀錄](https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/school-sensitive-areas.qa.json)

判定方式是「學校校園範圍 Polygon 與官方地質敏感區 Polygon 相交」；地圖上的點是每個校園範圍的 representative point，並非校地界址或單一校舍位置。資料屬 `SCREENING_REFERENCE`，地質敏感區數值範圍僅供規劃參考，不取代公告圖資、現地調查、鑽探試驗或專業判定。

## 版本資訊

- 基於 opengeos/GeoLibre（MIT），2026-09-24 同步，自建 `GEOLIBRE_APP_BASE=/good-open-source-collection/GeoLibre-Web/`
- 主介面 zh-TW：由官方簡體 zh.json 轉換（OpenCC s2t，共 6,534 條），i18n 單元測試通過
- 注意：純靜態託管，需本機 Python sidecar 的功能（如部分 Whitebox）以 WASM/線上版為準；桌面版請見本倉庫 `GeoLibre/` 原始碼
