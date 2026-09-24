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

## 版本資訊

- 基於 opengeos/GeoLibre（MIT），2026-09-24 同步，自建 `GEOLIBRE_APP_BASE=/good-open-source-collection/GeoLibre-Web/`
- 主介面 zh-TW：由官方簡體 zh.json 轉換（OpenCC s2t，共 6,534 條），i18n 單元測試通過
- 注意：純靜態託管，需本機 Python sidecar 的功能（如部分 Whitebox）以 WASM/線上版為準；桌面版請見本倉庫 `GeoLibre/` 原始碼
