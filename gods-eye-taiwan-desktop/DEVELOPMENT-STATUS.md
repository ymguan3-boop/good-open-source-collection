# Development status — 2026-09-27

## 目前定位
本專案改採「開源原始碼 + Agent 本機安裝」模式，不提供預先編譯 installer 作為主要交付方式。

## 已完成
- Tauri 2 本機桌面殼。
- God's Eye View 固定上游版本 + Taiwan overlay。
- 繁體中文 minimal UI。
- 完整地球啟動、T 台灣、G 全球。
- GeoJSON / KML / CZML / Shapefile ZIP 匯入 MVP。
- Turf.js 基礎 GIS 分析。
- Dexie + JSZip `.gevproj`。
- OpenRouter 安全代理與集中式設定。
- RAM / Swap / GPU / VRAM 監測與 app-level governor。
- 專案內建 PNG / ICO 圖示。
- Agent 安裝規格 `AGENTS.md`。
- `agent-install-windows.ps1`：本機編譯，不產生 installer。
- `create-desktop-shortcut.ps1`：使用專案內 icon 建立桌面捷徑。

## 尚待後續驗收
- 在實際 Windows 10/11 + MSVC Build Tools 環境完成一次完整 Tauri release build。
- 驗證不同 GPU（Intel / NVIDIA / AMD）監測結果。
- 進一步補齊 WMS/WFS/WMTS、ArcGIS REST、CSV/Excel 等圖資來源。
- 完整 AI GIS Tool Registry 與分析重跑機制。
