# 上帝之眼・台灣版

以 **God's Eye View + CesiumJS** 為唯一 3D 地球核心的繁體中文、輕量化本機桌面版。

**修改者：官毅明**

## 使用方式：下載開源程式，再交給 Agent 安裝

本專案不要求提供預先編譯安裝程式。建議使用者直接從 GitHub 取得這個資料夾的開源程式，然後交由 Agent 在本機完成安裝、編譯與桌面捷徑建立。

專案位置：

```
ymguan3-boop/good-open-source-collection/gods-eye-taiwan-desktop
```

### Agent 最簡單指令

將以下內容交給能操作本機終端機的 Agent：

> 請依照 gods-eye-taiwan-desktop/AGENTS.md 完成上帝之眼・台灣版的本機安裝。不要下載預先編譯 installer；請檢查必要環境、執行 scripts/agent-install-windows.ps1、本機編譯程式，並使用專案內 branding/gods-eye-taiwan.ico 建立「上帝之眼・台灣版」桌面捷徑。完成後啟動並驗證完整地球、T 台灣、G 全球、設定、圖資、AI 與資源監控功能。

### Windows 手動啟動安裝流程

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\agent-install-windows.ps1
```

此腳本會：
1. 檢查 Git / Node / npm / Rust。
2. 下載固定版本的 God's Eye View。
3. 套用台灣版 overlay。
4. 安裝相依套件。
5. 用 Tauri 在本機編譯 **單一桌面執行檔**，不產生 NSIS/MSI installer。
6. 複製到 `local-app/GodsEyeTaiwan.exe`。
7. 使用本專案 `branding/gods-eye-taiwan.ico` 建立桌面捷徑。

## 內建 icon

桌面捷徑直接使用：

```
branding/gods-eye-taiwan.ico
```

品牌原始圖：

```
branding/icon-master.png
```

所以使用者不必另外下載 icon。未來重新設計圖示時，只要替換上述品牌檔案，再執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\rebuild-desktop-shortcut.ps1
```

即可更新桌面捷徑圖示。

## 主要功能

- 啟動顯示完整地球。
- `T`：台灣視角。
- `G`：全球視角。
- 繁體中文極簡工作台。
- 本機圖資匯入與 Turf GIS 基礎分析。
- `.gevproj` 專案存取。
- OpenRouter AI 分析入口。
- API Key 集中於設定。
- RAM / Swap / GPU / VRAM 監看。
- 省電／平衡／效能／自訂資源策略。
- 不自動修改 Windows Pagefile 或 GPU 時脈。
- Cesium/provider attribution 保留並低干擾化。

## 架構

本倉庫不複製整份上游 God's Eye View，而是以 `UPSTREAM.lock` 固定上游 commit，在本機建置時套用 `overlay/`。這樣可以降低倉庫體積，也比較容易追蹤上游更新。

詳細內容請看：
- `AGENTS.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`
- `THIRD_PARTY_NOTICES.md`

## 授權

台灣版自有 overlay 採 MIT License。God's Eye View 與所有第三方圖資、API、模型及服務仍遵循各自授權與使用條款。
