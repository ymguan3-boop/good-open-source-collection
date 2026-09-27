# 上帝之眼・台灣版

以 **God's Eye View + CesiumJS** 為唯一 3D 地球核心的繁體中文、輕量化本機桌面版。

**修改者：官毅明**

---

## 下載與安裝

本專案採用 **「下載開源原始碼 → 交給 Agent 在本機完成安裝」** 的方式使用，不需要另外下載預先編譯的 Windows 安裝程式。

專案位置：

```
ymguan3-boop/good-open-source-collection/gods-eye-taiwan-desktop
```

GitHub：

```
https://github.com/ymguan3-boop/good-open-source-collection/tree/main/gods-eye-taiwan-desktop
```

### 方法一：一般使用者下載 ZIP（建議）

1. 開啟 GitHub 倉庫：
   ```
   https://github.com/ymguan3-boop/good-open-source-collection
   ```

2. 點選右上方或檔案列表上方的 **Code**。

3. 選擇 **Download ZIP**。

4. 將下載的 ZIP 解壓縮。

5. 進入：
   ```
   good-open-source-collection-main\gods-eye-taiwan-desktop
   ```

6. 將這個資料夾交給可操作本機終端機的 AI Agent，例如 Codex、Claude Code 或其他支援終端機操作的 Agent。

7. 對 Agent 下達以下指令：

   > 請依照此資料夾內的 AGENTS.md 完成「上帝之眼・台灣版」Windows 本機安裝。請檢查必要環境、執行 scripts/agent-install-windows.ps1、本機編譯程式，並使用 branding/gods-eye-taiwan.ico 建立「上帝之眼・台灣版」桌面捷徑。完成後請啟動並驗證完整地球、T 台灣、G 全球、設定、圖資、AI 與資源監控功能。

8. Agent 完成後，桌面會建立：

   **上帝之眼・台灣版**

   雙擊桌面圖示即可啟動。

### 方法二：使用 Git Clone

如果電腦已安裝 Git，可在終端機執行：

```powershell
git clone https://github.com/ymguan3-boop/good-open-source-collection.git
cd good-open-source-collection\gods-eye-taiwan-desktop
```

接著交給 Agent 安裝，或直接執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\agent-install-windows.ps1
```

---

## Agent 安裝時會自動做什麼？

Agent 應依照：

```
AGENTS.md
```

完成下列工作：

1. 檢查 Git、Node.js、npm、Rust/Cargo 等必要工具。
2. 確認 Node.js 版本符合 God's Eye View 上游需求。
3. 準備固定版本的 God's Eye View。
4. 套用「上帝之眼・台灣版」overlay。
5. 安裝 JavaScript / Rust 相依套件。
6. 使用 Tauri 在使用者電腦本機編譯桌面程式。
7. 將本機程式放到：
   ```
   local-app\GodsEyeTaiwan.exe
   ```
8. 使用專案內建 icon 建立桌面捷徑。
9. 啟動程式並進行基本驗收。

> 本流程不會自動修改 Windows Pagefile、GPU 時脈或顯示卡驅動設定。

---

## Windows 手動安裝

如果不使用 Agent，也可以自行在 PowerShell 執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\agent-install-windows.ps1
```

安裝腳本會建立：

```
local-app\GodsEyeTaiwan.exe
```

並在 Windows 桌面建立：

```
上帝之眼・台灣版.lnk
```

---

## 內建桌面 Icon

桌面圖示已經包含在開源程式中，使用者不需要另外下載。

正式桌面 icon：

```
branding/gods-eye-taiwan.ico
```

品牌原始圖：

```
branding/icon-master.png
```

Agent 建立桌面捷徑時會直接使用：

```
branding/gods-eye-taiwan.ico
```

若日後更新 icon，只要替換品牌檔案，再執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\rebuild-desktop-shortcut.ps1
```

即可重新建立具有新圖示的桌面捷徑。

---

## 安裝完成後的基本操作

- 啟動程式：雙擊桌面的 **上帝之眼・台灣版**
- 預設畫面：完整 3D 地球
- `T`：快速跳轉台灣
- `G`：回到完整地球
- `Ctrl + S`：儲存目前專案狀態
- 「圖資」：載入本機 GIS 圖資
- 「分析」：執行 GIS 分析
- 「AI」：使用 OpenRouter AI 空間助理
- 「設定」：統一管理 Cesium、Google Maps、OpenRouter API Key
- 右下資源列：查看 RAM、Swap、GPU、VRAM 使用狀況

---

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

---

## 架構

本倉庫不複製整份上游 God's Eye View，而是以 `UPSTREAM.lock` 固定上游 commit，在本機建置時套用 `overlay/`。這樣可以降低倉庫體積，也比較容易追蹤上游更新。

詳細內容：

- `AGENTS.md`：Agent 安裝規則
- `ARCHITECTURE.md`：系統架構
- `ROADMAP.md`：開發進度
- `THIRD_PARTY_NOTICES.md`：第三方授權說明

---

## 授權

台灣版自有 overlay 採 MIT License。God's Eye View 與所有第三方圖資、API、模型及服務仍遵循各自授權與使用條款。
