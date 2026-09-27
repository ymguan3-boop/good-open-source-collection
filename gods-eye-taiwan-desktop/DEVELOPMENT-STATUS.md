# Development status — 2026-09-27

## 已完成的 MVP 原始碼

- Tauri 2 Windows desktop shell configuration.
- NSIS installer workflow + deterministic desktop shortcut hook.
- Pinned upstream God's Eye View overlay build.
- Minimal Traditional-Chinese UI shell.
- Full-globe startup preservation; `T` Taiwan and `G` global shortcuts.
- Central settings UI for Cesium / Google Maps / OpenRouter credentials.
- Windows Credential Manager integration for stored credentials.
- OpenRouter backend proxy command.
- RAM / Swap(Pagefile) / process RSS / process virtual memory / GPU / VRAM telemetry.
- App-level Eco / Balanced / Performance / Custom resource governor.
- Automatic rendering protection at high RAM / Swap / VRAM pressure.
- GeoJSON / KML / CZML / Shapefile ZIP import MVP.
- Turf.js Buffer / Intersect / Area / Length / Centroid helpers.
- Dexie local project DB and JSZip `.gevproj` export/import MVP.
- AI topic suggestion + analysis-plan UI skeleton.

## 已完成驗證

- All Taiwan JS/MJS files pass `node --check` in the available environment.
- JSON configs parse successfully.
- Overlay patch script was tested against a synthetic upstream entry file using the exact current upstream patterns.
- Current upstream Node engine requirement was checked: Node >=24.14<25 or >=26<27.

## 尚未能在此執行的驗證

This ChatGPT execution environment has Node 22 and no Rust toolchain, and it does not expose an authenticated GitHub `create repository` action. Therefore:

- no real Windows Tauri compile has been run here;
- no NSIS installer binary has been generated here;
- no full upstream dependency install / browser regression run has been performed here;
- no GitHub Actions workflow can run until the new repository exists.

The included Windows GitHub Actions workflow is intended to perform the actual installer build once the source is pushed.

## 下一個必要動作

Create an empty repository named `gods-eye-taiwan-desktop` under `ymguan3-boop`. Once it exists, ChatGPT's connected GitHub tools can write files to it and development can continue there.
