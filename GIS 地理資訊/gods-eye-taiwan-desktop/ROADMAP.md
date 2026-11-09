
# Roadmap

## P0 — Desktop Shell / UI Shell
- [x] Tauri 2 設計與 Windows NSIS build workflow
- [x] 上游固定版本 + overlay build
- [x] 繁中 minimal shell
- [x] T / G 視角快捷鍵
- [x] 統一設定入口
- [x] Resource Monitor / Governor 骨架
- [x] 安裝後桌面捷徑 hook

## P1 — Project Workspace
- [x] IndexedDB / Dexie schema
- [x] `.gevproj` export/import MVP
- [ ] Camera / style / all upstream layer states 完整 round-trip
- [ ] Crash recovery / autosave UX

## P2 — Add Data
- [x] 內建道路／鐵路／水系／水域／海岸線 OSM 動態拆分圖層
- [x] 內建圖層視窗範圍限制、feature budget、幾何簡化
- [x] NLSC 官方 WFS 圖層代碼 registry（需申請，不自動抓取）
- [x] GeoJSON
- [x] KML
- [x] CZML
- [x] Shapefile ZIP
- [ ] CSV / Excel schema mapper
- [ ] WMS / WMTS / WFS
- [ ] ArcGIS REST
- [ ] 3D Tiles URL catalog

## P3 — Manual GIS
- [x] Buffer
- [x] Intersect
- [x] Area / Length / Centroid
- [ ] Spatial Join
- [ ] Attribute filter builder
- [ ] Table / chart / statistics

## P4 — OpenRouter AI
- [x] Secure key storage
- [x] Rust proxy command
- [x] Topic suggestion / analysis-plan UI skeleton
- [ ] Full GIS Tool Registry executor
- [ ] Structured schema validation
- [ ] Analysis recipes and deterministic re-run

## P5 — Audit Workflow
- [ ] Data provenance / update date / license registry
- [ ] Analysis readiness score
- [ ] Audit evidence notes and evidence package export
- [ ] Report templates

## P6 — Advanced
- [ ] PostGIS optional backend
- [ ] Potree / LiDAR optional plugin
- [ ] deck.gl statistical views
- [ ] Optional 2D workspace


## P7 — Reliability / Lightweight
- [ ] 正式 Tauri Sidecar Provider（取代長期依賴 tauri dev provider）
- [ ] Data Health Center：來源、更新時間、授權、延遲、備援狀態
- [ ] TDX 台灣 CCTV / VD / CMS / 道路事件整合
- [ ] Command Registry：手動、快捷鍵、OpenRouter、Gemini 共用
- [ ] Undo / Redo + AI 高風險操作確認
- [ ] Crash Recovery / autosave / analysis recipe rerun
- [ ] Voice Provider Adapter（Gemini Live / OpenAI Realtime）
- [ ] 一鍵系統健康檢查


## P8 — Routing / Navigation
- [x] TomTom API Key secure storage + validation
- [x] TomTom Search 地點解析
- [x] TomTom Routing 行車路線（traffic=true）
- [x] Cesium 路線圖層顯示
- [x] 導航視角
- [x] Windows/WebView2 geolocation 跟隨導航
- [x] Gemini Live 路線／導航工具
- [x] Cesium ion Token 實際 asset endpoint 驗證
- [ ] 偏航自動重新規劃
- [ ] 逐轉彎語音提示與下一轉向 UI
