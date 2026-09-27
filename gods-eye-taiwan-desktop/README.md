
# 上帝之眼・台灣版（God's Eye Taiwan Desktop）

以開源專案 **God's Eye View** 為唯一 3D 地球核心，建立給台灣審計／工程／GIS 工作使用的輕量桌面版。介面採繁體中文、低資訊密度、開闊視野，並增加專案管理、手動 GIS、OpenRouter AI、資源監控與桌面安裝能力。

> 修改者：官毅明

## 核心原則

- 主程式：God's Eye View + CesiumJS，不建立第二套地球 Viewer。
- 桌面容器：Tauri 2（避免 Electron 常駐 Chromium 的額外負擔）。
- 啟動時：完整地球；`T` 跳到台灣，`G` 回全球。
- UI：繁體中文、極簡、非雷達式 HUD；原功能保留但預設收合。
- API Key：集中在「設定」；OpenRouter Key 存入 OS 安全憑證儲存區，不回傳完整值給前端。
- AI：OpenRouter 負責規劃／工具選擇，GIS 幾何計算交給 Turf.js。
- 成果：AI／人工分析均轉成可再載入、可再分析的正式 Layer。
- 資源：RAM、虛擬記憶體／Swap、GPU、VRAM 可監看；提供省電／平衡／效能／自訂四種應用程式資源策略。
- 安全：預設不自動改 Windows Pagefile、GPU 時脈、驅動設定或系統登錄檔效能參數。

## 目前開發包狀態

這個資料夾是「新倉庫可直接使用」的第一版桌面化骨架與 MVP overlay。它不複製整份上游程式，而是在建置時抓取固定版本的 God's Eye View，再套用台灣版 overlay，目的是降低倉庫體積並讓上游更新更容易追蹤。

目前 ChatGPT 已連線到 GitHub 帳號 `ymguan3-boop`，但本次可用的 GitHub 連接器沒有暴露「建立新 Repository」動作，因此尚不能直接建立新倉庫。建議新倉庫名稱：

`gods-eye-taiwan-desktop`

當空倉庫建立後，本包內容即可直接推入該倉庫，再由 GitHub Actions 產出 Windows 安裝檔。

## 一鍵建置概念

Windows 開發機：

```powershell
./scripts/prepare-upstream.ps1
cd .work/upstream
npm install
npm run tauri:dev
```

正式安裝檔：

```powershell
npm run tauri:build
```

GitHub Actions 會使用 Windows runner 建置 NSIS `Setup.exe`，並上傳為 workflow artifact。

## MVP 已規劃／實作的台灣版 Overlay

- 台灣版品牌 Shell、繁中導覽與簡潔介面。
- 全地球啟動、台灣／全球快捷視角。
- 原 God's Eye View 面板保持相容，可按需叫出。
- 中央設定抽屜：AI、地圖金鑰、效能配置。
- RAM／Swap／GPU／VRAM 儀表。
- 四種渲染資源策略，可動態調整 Cesium 的 FPS、解析度比例與 3D Tiles 快取。
- GeoJSON / KML / CZML / Shapefile ZIP 基礎匯入。
- Turf.js Buffer / Intersect / Area / Length / Centroid 基礎工具。
- Dexie 本機專案資料庫與 JSZip `.gevproj` 專案匯出／匯入骨架。
- OpenRouter 後端代理（Tauri Rust Command），Key 不直接暴露給前端。
- Windows NSIS 安裝器與桌面捷徑 hook。

## 開源與授權注意

God's Eye View 的程式碼採 MIT 授權；其第三方資料、影像、模型與各 provider 仍受各自條款約束。台灣版不得因主程式是 MIT，就把第三方資料一律視為可商用。`THIRD_PARTY_NOTICES.md` 必須隨安裝包保留。

## 資源控管設計

「虛擬記憶體控制」在第一版定義為：

1. 監看系統 RAM / Swap(Pagefile) 使用量與本程式 Process RSS / Virtual Memory。
2. 當 RAM、Swap 或 VRAM 壓力過高時，自動降低本程式渲染負載。
3. 提供使用者可調整的應用程式級記憶體／GPU 預算。

不在第一版直接改 Windows Pagefile 大小。修改作業系統分頁檔需要管理員權限、可能要求重新啟動，且錯誤設定可能降低穩定性；若未來真的要加入，應做成「進階／明確確認」功能而非預設自動化。

## 建議硬體分級

- 省電：內顯／8 GB RAM，30 FPS，0.75x 解析度，3D Tiles 256 MB。
- 平衡：16 GB RAM，一般獨顯或較新內顯，45 FPS，1.0x，512 MB。
- 效能：32 GB RAM + 8 GB VRAM，60 FPS，1.0x，1024 MB。
- 自訂：可調 FPS、解析度、Tiles Cache；高壓時仍會啟動安全保護。

## 圖示

`branding/icon-master.png` 是建置用 master icon。正式圖示設計規則：眼睛 + 地球弧線 + 台灣輪廓，藍青色科技感、簡潔、不可做雷達／軍事徽章風，32px 仍需可辨識。執行 `npm run icons` 由 Tauri CLI 產生 Windows `.ico` 與多尺寸 PNG。
