# 3D 粒子特效引擎與編輯器（THREE Particles + Editor）

> **收錄狀態：固定版本 Git 子模組來源參照，未實際整合《幻靈奇旅》。** 此資料夾只含繁體中文說明、風險檢核與原作者 Git 倉庫指標；不會自動下載 npm 相依套件、執行腳本或部署服務。

## 來源與收錄方式

| 元件 | GitHub | 固定 SHA | 授權判定 |
|---|---|---|---|
| THREE Particles 3D 粒子引擎 | https://github.com/NewKrok/three-particles | `f54737cabfec5668ac654c712aff0593162ca4ef` | 上游 LICENSE 明確為 MIT |
| THREE Particles Editor 編輯器 | https://github.com/NewKrok/three-particles-editor | `b6b03b757559236b47eafaf8465176564011a5b6` | 上游倉庫沒有獨立 LICENSE；**再散布／改作授權待確認** |

本資料夾內：
- `引擎原始碼/` 是可取得上游完整程式碼的**固定 Git 子模組**，不是本倉庫內的獨立離線鏡像。
- `編輯器上游參照/` 同樣是**固定 Git 子模組**，只引用原作者的原始位置與 SHA；本倉庫不鏡像、修改、重新授權編輯器的內容。編輯器原始碼授權不明，請勿在確認授權前將其內容打包、再散布或做衍生公開版本。
- GitHub **Code → Download ZIP 只會包含子模組指標，不包含完整子模組原始碼**。需用下方 Git 指令下載。

## 為什麼收錄？

THREE Particles 提供 3D 粒子發射、Mesh 粒子、Ribbon/Trail 光軌、碰撞平面、吸引／排斥力場、子發射器與序列化設定。編輯器可視化設計效果、即時預覽、匯出設定，適合探索火球、魔法、雷擊、爆炸、迴旋鏢光軌等《幻靈奇旅》場景。

- 官方編輯器：https://newkrok.com/three-particles-editor/index.html
- 官方投射物影片：https://youtu.be/Q352JuxON04
- 官方 3D 引擎文件：https://newkrok.github.io/three-particles/api/

**注意**：這是 3D 粒子系統，不代表倉庫已提供可直接替換《幻靈奇旅》所有現有技能的完整遊戲特效包。

## 與《幻靈奇旅》的實際相容性

- 遊戲目前為 Three.js **r128**，以 `vendor/three.min.js` 與全域 `THREE` 配合非完整現代打包流程。
- THREE Particles **3.0.0**：`peerDependencies.three = ^0.182.0`。
- Editor **2.12.0**：相依 `@newkrok/three-particles ^3.0.0` 及 `three ^0.182.0`，使用 Svelte／Rollup 建置。
- **結論：不能把最新版檔案直接複製到 r128 遊戲並保證可用。** 需先在獨立 PoC 驗證 r182 或採保守轉接策略，再決定是否升級遊戲。
- 開發工具與編輯器只應在獨立開發環境運作；正式遊戲只載入**必要的運行時程式及按需使用的特效設定／素材**，不能將整個 Editor、示範程式、測試、README 與依賴都載入網頁。

詳見：[資安與授權檢核](SECURITY-REVIEW.md)／[六套 3D 特效比較](COMPATIBILITY-6-PROJECTS.md)／[Claude 指令摘要](CLAUDE-INSTRUCTIONS.md)。

## 下載與存取

```bash
git clone https://github.com/ymguan3-boop/good-open-source-collection.git
cd good-open-source-collection
git submodule update --init -- "3D粒子特效-THREE-Particles/引擎原始碼"
# 僅在需研究編輯器且接受上游授權尚待釐清時：
git submodule update --init -- "3D粒子特效-THREE-Particles/編輯器上游參照"
```

這會取得 GitHub 上指定 SHA 的原始碼；**不會自動執行 `npm install`**。如果要建置，先在隔離測試目錄檢視 `package.json` 與鎖定檔、使用鎖定版本並執行適當相依漏洞檢查。

## 使用方式與安全界線

1. 不要直接把這兩個子模組匯入遊戲網頁。
2. 不自動啟用子模組內 `.github/workflows`、`.claude`、Husky 或部署功能。
3. 不使用 Editor 的上游 FTP 部署流程；不提供原始碼／開發工具的公開部署，除非授權、隱私及資安另經審核。
4. 先做一個**隔離的 r182 試驗頁**，只展示 3D 火焰、立體命中與 0.9 秒迴旋鏢光軌；與 r128 遊戲主線分離。
5. 所有「真正傷害、命中、血量、冷卻、存檔」仍由《幻靈奇旅》原系統處理，粒子引擎僅負責畫面。
6. 手機優先：動態載入、低畫質回退、粒子／材質重用、離開場景清理記憶體；勿在正式遊戲首頁同步載入整套編輯器。

## 收錄日期與查核性質

2026-11-04；針對主引擎進行重點靜態程式模式檢查（含核心模組、部分開發設定與部署流程），對 Editor 及六款候選進行授權／版本／關鍵路徑抽查。**未做完整逐行人工審查、依賴 CVE 全面掃描、沙箱安裝或真實手機瀏覽器整合驗收，因此不宣稱「無毒」或「已可直接使用」。**
