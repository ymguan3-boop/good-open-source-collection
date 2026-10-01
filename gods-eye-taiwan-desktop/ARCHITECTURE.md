
# 架構

```text
God's Eye View upstream (pinned commit)
        │
        ├── CesiumJS / existing layers / cameras / providers
        │
Taiwan Overlay
        ├── Minimal Traditional-Chinese shell
        ├── Project Manager / Add Data / GIS tools
        ├── Resource governor
        └── OpenRouter UI
        │
Vite local provider + HTML browser shortcut
        ├── /api/cctv /api/overpass and other live providers
        └── fast launch without a Rust rebuild
Tauri 2 desktop shell (optional for native capabilities)
        ├── Windows secure credential storage
        ├── Resource telemetry (sysinfo + hypomnesis)
        ├── OpenRouter proxy
        └── native window and Windows integrations
```

## 為何使用 Overlay 而不是把上游整份 Fork 進來

1. 新倉庫更小。
2. 上游版本可鎖定，可重現建置。
3. 台灣版改動集中在 `overlay/`，容易 code review。
4. 更新上游時只需調整 `UPSTREAM.lock`，再執行 regression test。

## 程式啟動

`src/main.js` 在 build-time 被 patch：

1. Tauri 模式先從 secure store 讀取「允許送進 WebView 的 provider key」：Google Maps / Cesium ion；瀏覽器模式沒有此能力。
2. 啟動原 God's Eye View `createStandaloneApplication()`。
3. 等到原 application `start()` 完成，取得 `components.scene.viewer`。
4. 安裝 `installTaiwanEdition()`。

OpenRouter Key 不走這條路；由 Rust 後端直接向 OpenRouter 發 request。

## GPU / Memory Governor

ResourceGovernor 不直接控制硬體時脈，而控制本 app：

- `viewer.targetFrameRate`
- `viewer.resolutionScale`
- `tileset.maximumScreenSpaceError`
- `tileset.cacheBytes`
- `tileset.maximumCacheOverflowBytes`
- 高壓狀態下請求 render、降低動態資料頻率、提示停用重圖層

安全門檻：

- RAM >= 88%：啟動降載。
- Swap >= 75%：警示並再降載。
- VRAM >= 88%：降低 3D Tiles cache / resolutionScale。
- 連續恢復到 < 70% 才解除保護，避免 oscillation。

## 專案資料

`.gevproj` = ZIP：

```text
project.json
layers/*.geojson
analysis/*.json
reports/*.md
annotations/*.geojson
```

Dexie 用於工作中自動保存；JSZip 用於 portable project。


瀏覽器金鑰儲存：taiwanCredentialStore 以 Windows DPAPI CurrentUser 保存所有原版服務與 AI 金鑰；taiwanAi 只回傳 presence，runtime 僅提供 Google Maps/Cesium 的瀏覽器用金鑰。taiwanChat 提供 SSE、取消與免費備援；Dexie results 保存匯出的完整專案 JSON，專案載入以解析完成後取代圖層，並停用即時資料。
