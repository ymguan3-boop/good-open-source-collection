# Development status — 2026-09-27

## v0.2 這次更新

- OSM audit freshness：
  - memory TTL 15 min
  - disk TTL 1 h
  - boundary TTL 24 h
  - 強制 fresh probe + `osm3s.timestamp_osm_base` UI
- CCTV：
  - 保留上游 active frame 10 s cadence
  - runtime freshness probe
  - 僅 `X-CCTV-Source: upstream-image` 判定為直接上游最新 snapshot
  - Street View / synthetic 明確標示 fallback
- 修正 Source+Agent 桌面架構：捷徑啟動本機 provider service + Tauri，避免 static release 丟失 `/api/cctv`、`/api/overpass` 等服務。
- Gemini Live：
  - `@google/genai` 2.24.0
  - model `gemini-3.8-live`
  - Windows Credential Manager 保存 Gemini 長效 Key
  - Rust 取得 ephemeral token
  - WebView Live Audio + transcript
  - GIS tools：list_layers / fly_to_taiwan / fly_global / create_buffer
- OpenRouter 保留。

## 已做靜態驗證

- 上游 `main` 與 `UPSTREAM.lock` commit 一致。
- Taiwan overlay 所需 `src/main.js` / Overpass / CCTV patch anchors 均存在於目前上游。
- 新 `ui.js` 已通過 `node --check`。
- CCTV upstream source code確認 frame response `no-store`、成功上游 frame header `X-CCTV-Source: upstream-image`、active cadence 10 秒。

## 仍須在實際 Windows 安裝後做 runtime 驗收

- Rust/Tauri `cargo check` / 啟動。
- Google Gemini Live microphone + ephemeral token 真實連線。
- 至少 3 支 CCTV runtime 抽查；第三方 camera 是否在線取決於畞下 provider。
- Intel/NVIDIA/AMD GPU telemetry。
