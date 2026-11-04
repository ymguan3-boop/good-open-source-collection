# 像素特效與動畫庫（pixelfx）

> 收錄於「好用開源程式收集」的繁體中文整理版。pixelfx 的 JavaScript 套件名稱與原始效果 ID 保持不變，以確保既有專案仍可匯入使用。

[原作者 GitHub](https://github.com/patch-gg/pixelfx) · [官方互動展示館](https://patch-gg.github.io/pixelfx/) · [完整特效清單](docs/CATALOG.md) · [資安與授權檢核](SECURITY-REVIEW.md) · [英文原始說明](README.upstream.md)

![官方特效展示動畫](https://raw.githubusercontent.com/patch-gg/pixelfx/a84159688af3ca37a4be05a0d422b94451b2e24e/docs/readme/montage.gif)

## 一、專案介紹

**pixelfx** 是使用 JavaScript 程式碼產生像素風格視覺效果（VFX）的開源工具庫，提供 **244 款特效與動畫**，涵蓋火焰、爆炸、冰霜、雷電、魔法、天氣、介面提示、道具拾取、場景轉場及生物動畫。特效不是單純的靜態圖片，而是由程式依據時間與參數繪製，因此可調整顏色、方向、亮度、隨機種子、播放速度，並匯出逐格圖（Sprite Sheet）。

其中 **12 套完整招式**可以串接角色蓄力、攻擊、命中停頓、受擊與收招；另提供 **Claude Code Skill**，可輔助搜尋現成特效、產生新特效、渲染預覽並逐輪修正。

適合用於網頁遊戲、2D 遊戲、Godot／Unity 專案，或作為 Three.js 3D 遊戲中的 2D 特效貼圖與畫面疊加效果。它不是完整的 Three.js 粒子系統，也不會自動替換既有 3D 材質特效。

## 二、效果類別

| 類別（原始 ID） | 數量 | 中文用途 |
|---|---:|---|
| moves | 12 | 完整攻擊招式、技能動作 |
| fire | 12 | 火把、營火、噴火、火焰龍捲 |
| explosions | 12 | 爆炸、煙塵、煙火 |
| water | 12 | 水流、噴泉、漣漪、水花 |
| ice | 10 | 冰霜、冰凍、暴風雪 |
| lightning | 11 | 落雷、連鎖閃電、電漿 |
| scifi | 12 | 能量護盾、科技特效、全像影像 |
| melee | 12 | 刀劍、爪擊、槌擊 |
| impacts | 11 | 命中、重擊、暴擊閃光 |
| projectiles | 13 | 箭矢、子彈、飛行彈幕 |
| spawn & death | 10 | 生成、消散、復活 |
| arcane | 12 | 奧術光束、魔法陣、傳送 |
| holy | 10 | 治療、祝福、神聖護盾 |
| shadow | 12 | 黑洞、詛咒、暗影 |
| status | 13 | 燃燒、冰凍、中毒等狀態 |
| nature | 13 | 藤蔓、落葉、土石、毒雲 |
| weather | 12 | 下雪、雲霧、暴風、螢火蟲 |
| ui | 12 | 成就、連擊、倒數、升級 |
| pickups | 11 | 寶箱、金幣、道具拾取 |
| transitions | 10 | 像素轉場、遮罩、破碎 |
| critters | 12 | 鳥、蝴蝶、蝙蝠等生物 |

詳細名稱與效果描述見 [docs/CATALOG.md](docs/CATALOG.md)。原有英文效果 ID 不翻譯，以免破壞 API 與檔案路徑。

## 三、使用前準備

- **Node.js 18 或更新版本**；基本特效列表、測試及 PNG 渲染可直接使用 Node.js。
- **ffmpeg（選用）**：想輸出 GIF 或 MP4 動畫時才需要。
- **npm / esbuild（建置展示網站時才需要）**：使用 npm ci 安裝；執行前仍應自行確認依賴套件來源與版本。
- 本資料夾是完整的程式碼鏡像，**不是 Git 子模組**；一般 Download ZIP 即可取得來源程式（不含專有字型與大型示範 GIF）。
- 此收錄版不建立自動更新、不啟用 GitHub Pages，也不主動執行 Claude Code Skill。

## 四、快速操作

將本收集倉庫下載後，在終端機切換至本資料夾：

~~~bash
cd 像素特效與動畫-pixelfx
node tools/list.mjs lightning
node tools/render.mjs fire/torch
~~~

預覽圖會輸出至 records 目錄；此目錄預設列於 .gitignore，不會被提交回 GitHub。

**匯出 Godot、Unity、Phaser 等引擎可用的 Sprite Sheet：**

~~~bash
node tools/render.mjs ice/frost-nova --sheet
~~~

輸出包含透明 PNG 與動畫 JSON（每格尺寸、幀率、循環資訊、基準點與逐格區塊）。匯入遊戲引擎時，建議啟用最近鄰縮放（Nearest Neighbor）並確認圖片原點設定。

**產生 GIF（需先安裝 ffmpeg）：**

~~~bash
node tools/render.mjs fire/torch --gif
~~~

**啟動本機特效展示館：**

~~~bash
node tools/serve.mjs 8080
~~~

接著使用瀏覽器開啟 http://127.0.0.1:8080/gallery/ 。此中文收錄版已把該伺服器限制在本機介面，並限制公開檔案路徑為展示館與 src 目錄，不應再使用未修補的上游伺服器向網際網路開放。

**自建展示網站靜態檔案（需 npm / esbuild）：**

~~~bash
npm ci
node tools/build-gallery.mjs
~~~

產出於 dist/gallery/。本收錄版不包含原作者保留權利的 Patch Pixel 字型，展示介面改用系統備援字型。

## 五、建立新特效

~~~bash
node tools/new.mjs arcane/my-spell
node tools/render.mjs arcane/my-spell
node tools/check.mjs arcane/my-spell
~~~

建議依照「構思 → 產生 → 渲染 → 觀察 → 修正」循環逐步改善。詳見 [創作規格](docs/AUTHORING.md) 與 [Claude Code Skill](skills/pixelfx/SKILL.md)。**技能是可以指揮 AI 執行本機命令的指令檔，請只在受信任的工作目錄、明確授權的範圍內啟用。**

![官方角色動作與命中展示](https://raw.githubusercontent.com/patch-gg/pixelfx/a84159688af3ca37a4be05a0d422b94451b2e24e/docs/readme/acts.gif)

## 六、適合用於「幻靈奇旅」的情境

- **幻靈守護戰／PK 戰**：落雷、火球、冰凍、命中特效、暴擊與受擊停頓。
- **角色招式與進階**：蓄力、連擊、治療、光暈、魔法陣、升級訊息。
- **初光商會**：商品拾取、金幣獲得、寶箱開啟、交易成功動畫。
- **Three.js 場景**：先輸出透明 Sprite Sheet，掛載於 Sprite、Plane 或介面疊加層；**不要**把畫面整體變亮或變黑當作打雷特效。

## 七、檔案結構

~~~text
像素特效與動畫-pixelfx/
├─ README.md                繁體中文專案說明（本文件）
├─ README.upstream.md       原作者英文說明（保留）
├─ SECURITY-REVIEW.md       靜態資安與授權檢核
├─ LICENSE                  MIT 授權
├─ NOTICE.md                第三方作者與素材來源
├─ package.json             Node.js 套件設定
├─ package-lock.json        固定相依套件版本
├─ src/core/                特效核心繪圖與動畫
├─ src/fx/                  完整特效原始碼
├─ tools/                   渲染、檢查、匯出與本機展示工具
├─ gallery/                 展示介面（不含專有字型）
├─ docs/                    特效清單及作者指南
├─ skills/pixelfx/          Claude Code 技能
└─ .claude-plugin/           原作者外掛資訊
~~~

## 八、授權、來源與安全界線

- **原始作者**：Patch；來源 [patch-gg/pixelfx](https://github.com/patch-gg/pixelfx)。
- **固定收錄版本**：2026-10-31 上游 commit [a841596](https://github.com/patch-gg/pixelfx/commit/a84159688af3ca37a4be05a0d422b94451b2e24e)（package 版本 0.3.0）。
- **程式與大部分特效授權**：MIT；保留 LICENSE 與 NOTICE.md，衍生自 Hugo Duprez、Hollow Crown 的部分亦應保留原聲明。
- **字型例外**：Patch Pixel 字型並非 MIT，故本收錄版**不重新散布其 woff2 檔案**，展示頁改用系統字型。
- **大型示範 GIF**：為節省容量，使用固定上游版本的官方連結提供預覽，不另外儲存在此倉庫；斷網時無法觀看示範動畫，但**不影響效果程式碼與本機渲染**。
- **資安檢查**：已進行靜態檢視與重點高風險程式模式檢查，並修正本機展示伺服器的監聽範圍；**沒有完成全面動態測試或病毒引擎掃描，不能稱為 100% 安全或已通過資安認證**。詳見 [SECURITY-REVIEW.md](SECURITY-REVIEW.md)。

此收錄版為非官方繁體中文整理版本，與原作者維護的最新版本可能不同；若需更新，應重新檢查程式差異、相依套件、授權及安全風險。