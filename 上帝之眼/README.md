# 🌐 上帝之眼 God's Eye View（繁體中文版）

> 本文件為原專案 `README.md` 的繁體中文翻譯整理，原英文版已備份為 `README.en.md`。
> 原專案：https://github.com/bilawalsidhu/gods-eye-view
> 原作者：Bilawal Sidhu、Sameh Khamis（Halfpixel），授權：MIT
> 同步日期：2026-09-18（shallow clone 去除歷史後複製）

### 瀏覽器中的間諜衛星模擬器 —— 然後你發現資料來源都是公開的，而且是真的。

照片級寫實 3D 地球儀。即時飛機、船舶、衛星、地震、交通與公共攝影機。免持語音控制，由即時 AI 代理驅動。

_沒有被遺落的角落。_

▶️ **來自病毒式傳播 God's Eye View 系列背後的專案**（前身 WorldView）—— YouTube 500 萬+、全社群 2500 萬+

🏆 **2026 年 8 月登上 GitHub Trending 日榜、週榜第一**

⚡ **免 API Key 即可啟動。** 用 [Pinokio](https://pinokio.co/apps/github-com-bilawalsidhu-gods-eye-view) 一鍵安裝，或從終端機本地執行。需要時再在 App 內加入選用 Key。**[→ 快速開始](#-快速開始)**

---

## 🌍 為什麼有這個專案

上帝之眼把公開訊號收進同一顆可探索的地球儀。追蹤全世界、跟它說話、拆解它、擴充它。

航班電文、船舶 beacon、軌道根數、地震儀、公共攝影機，本來就告訴我們很多事。上帝之眼把它們放在同一個地方，讓你可以在全球視角與單一飛機、船舶、街道之間切換。它跑在你本機瀏覽器，原始碼可檢視、可擴充。

> 一半魔法是它長得像禁區駕駛艙。另一半是每一行程式都看得到。

多數圖層是即時或定期更新。車流是沿真實道路、用聚合定位資料模擬的。CCTV 相機位姿與火箭發射軌跡是粗略估計。

先用內附資料來源開始，再加你自己的。每個圖層都是獨立模組。

---

## 🎛️ 它能做什麼

- **🛩️ 駕駛艙視角：** 坐進被追蹤的航班裡 —— 相機一路壓著地形帶你下降。
- **📡 周邊聯繫：** 目標周邊 250 公里內的一切，列出可逐步切換的即時飛機，隨點隨進駕駛艙。
- **🎯 點選追蹤：** 相機鎖定、畫出漸隱軌跡、浮出完整詮釋資料 —— 追蹤中的火點或船隻可一鍵交接給最近的即時攝影機。
- **🖊️ 語音白板：** 用說的在世界上做註記 —— 真實邊界多邊形、標記、路線。
- **🛫 3D 機庫：** 依機種的真實模型 —— 787、ATR-72、Citation、Bell 206、MQ-9 —— 靠近後自動從圖示切成 3D 模型。
- **🎨 現實換膚：** 全域 GLSL 感測器外觀 —— CRT、夜視鏡、FLIR/熱顯像、黑白、雪地。
- **🟩 偵測疊加：** 視野內所有目標的螢幕空間框與編號。
- **🎖️ 軍用 HUD：** 戰術抬頭顯示器與情報風格遙測。
- **🌐 全球脈絡：** 一鍵展開完整態勢圖，離開時完整還原你的視角。
- **🎥 場景導演：** 錄製電影級運鏡巡禮，方便剪片、Demo。
- **🔗 分享連結：** 相機、風格、圖層、甚至單一追蹤目標都可序列化成 URL —— 即時目標是交接，不是書籤。
- **🏠 重置地球：** 一鍵 —— 或一句話 —— 回到完整地球。

---

## ⚡ 快速開始

**免帳號、免 API Key 即可開始。** 兩種路徑開的是同一個 App，內含 Esri 衛星影像與免 Key 地形。Esri 連不上時自動切 OSM。航班、軍機、衛星、地震、公共攝影機、廣播、發射，都免 Key 可用。

要照片級寫實 3D，請加 **Cesium ion token**（符合資格的個人、非商業用途），或 **Google Maps key**（直接、計量制路線與 App 內地點搜尋）。各家條款與配額另計。在 App 的 **POWER UP** 面板加 Key。

### 路徑一 — 一鍵、免終端機

1. 安裝或更新 [Pinokio](https://desktop.pinokio.co/) 到 **8.2 以上**。
2. 打開 [Pinokio 上的 God's Eye View](https://pinokio.co/apps/github-com-bilawalsidhu-gods-eye-view)。
3. 按 **Install**，再按 **Start**。

支援 **Windows、macOS、Linux**。啟動器會裝好鎖定版依賴、找空閒本地埠、打開 App。

### 路徑二 — 終端機 / Coding Agent

需 **Node.js 24.x（24.14.0 以上）或 26.x**，不建議 Node 25（已 EOL）。

```bash
git clone https://github.com/bilawalsidhu/gods-eye-view.git
cd gods-eye-view
npm ci
npm run doctor
npm run dev
```

打開 **`http://localhost:4173`**。首次啟動選 **Live Contacts**、**Space Missions**、**Environmental** 或 **Explore Manually**。

### 在 App 內強化 —— 不用改檔案

Key 是升級，不是門票。想要再加就好，點右下角 **POWER UP**：Provider Settings 列出每種 Key、開什麼功能、去哪申請。貼上、按 **SAVE KEYS**，App 自動重啟啟用。全部設好後會顯示 **POWERED UP**。

- **Key 存哪：** Pinokio → App 內忽略版 `pinokio/ENVIRONMENT`；終端機 clone → 倉庫根目錄 `.env`。寫入前都會先設成僅擁有者可讀，都是本地明文，Git 會忽略，App 用你的 Key 去連原廠。
- **先拿什麼：** 免費 [Cesium ion](https://cesium.com/ion) token（照片級寫實 3D + 全球地形，個人非商業資格內）；Google Maps key 只走計費、計量制路線 + 地點搜尋；OpenAI 則是為了跟世界說話。

伺服器預設只綁 **localhost**，Provider Settings 只回應本機請求。瀏覽器端 Key（Google Maps、Cesium ion）務必在原廠設限制，詳見 `SECURITY.md`。

---

## 🕐 前五分鐘

1. **點亮天空。** 選 **Live Contacts** 任務（或自己開 **Flights**）—— 數千架即時飛機、真實遙測滑行、偵測網已讀場。點一架：相機鎖定、拖出尾跡、浮出即時遙測卡。
2. **進駕駛艙。** 被追蹤飛機按 **COCKPIT** 跟著下降，中途可切感測器：NVG 夜視、Ironbow 熱顯像。
3. **降落繁忙機場。** 搜尋機場、打開 3D 飛機降到滑行道：地面機、滑行尾跡、整個停機坪即時運作。
4. **看公共攝影機。** 打開 **CCTV**（Austin、London、California、Finland 等）。不是嵌 webcam —— 是投影進 3D 城市。切到 **VIEWSHED**，每支攝影機畫出估計覆蓋體 —— 照得到哪、盲區在哪。
5. **追軌道上的東西。** 開 **Satellites**、點 ISS —— 在軌道高度跟著飛，軌道環俱在。
6. **換光學。** 按 `1`–`7` —— CRT、NVG、FLIR —— 整顆即時地球即時重渲染。
7. **跟它說話**（需 OpenAI key）：「帶我去 LAX，選最近的空中飛機。」
8. **回家。** 按 **Reset Globe** —— 或說「zoom out to a globe view」。

**鍵盤：** `1`–`7` 風格 · `H` HUD · `D` 偵測 · `C` 駕駛艙 · `Esc` 脫離。

---

## 🎙️ 跟它說話

> 語音需 **OpenAI key**。沒有也能跑全 App，只是麥克風會提示語音不可用。同一個 Key 也驅動 **AI HUD 摘要**：隨視角重生的五字情報風格短評。

按 **GEV MIC**、授權麥克風，直接講。不是遙控器：

- **🧠 它知道在看哪。** 回答前先抓即時場景脈絡 —— 座標、街名、開啟圖層、視角尺度。飛到一半問「這是哪個城市？」它知道。
- **🎯 實體問答。** 點任何飛機、船舶、資料中心問「這是什麼？」它用即時遙測回答。
- **👁️ 視覺接地。** 街道級會讀視窗截圖辨認招牌、建築名，並被指示絕不幻覺造名。
- **🎬 電影運鏡。** 「Show me the planes overhead」會拉開、壓角、像導演一樣框住即時交通。
- **🔒 誠實安全。** 只確認真正成功的動作。`OPENAI_API_KEY` 不進瀏覽器，前端只拿短效 session token。

常用語音（摘自原廠語音測試集）：

**🎥 導演它**：「Take me to Tokyo.」「Orbit around this area slowly.」「Draw the walking route from the Capitol to Zilker Park. → Fly the route we just drew.」「Zoom out to a globe view.」

**🖊️ 註記它**：「Outline the state of Texas.」「Annotate the Texas State Capitol and its grounds」「How far is the Eiffel Tower from the Louvre?」講完出現連接箭頭並報距離。直到你說「clear the map」都保留。

也可用手畫：DISPLAY ▸ **Draw**，選 Area / Line / Pin，在真實世界上點頂點，雙擊收尾、上標籤。

**🔎 審問它**：「How many flights are over Texas right now?」「Which ships are headed to Oakland?」「What is the biggest fire near Los Angeles?」「Is anything flying above forty thousand feet?」「When does the ISS pass over next?」

**🎛️ 操作它**：「Switch to night vision and turn on the flights layer.」「Turn on the camera viewsheds.」「Play a news radio station near Austin.」「Track that plane. → Enter Cockpit.」

---

## 🛰️ 地球上有什麼

15 種圖層與底圖。**13 種有免 Key 路徑。**（🟢 免 Key · 🟡 免費 Key · 🔴 計量制）

| 圖層 | 內容 | 來源 | 驗證 |
|------|------|------|------|
| 🗺️ **底圖堆疊** | Esri 衛星、Google 照片級寫實 3D、OSM、ion 代管堆疊 | Esri / Google / Ion / OSM | 🟢 Esri + OSM · 🟡 ion 版 Google 3D + 全球地形 · 🔴 直連 Google + 地點搜尋 |
| ✈️ **即時航班** | 11,000+ 即時飛機 + 航路歷史 | OpenSky + adsb.lol | 🟢（🟡 選配拿更多 polling 額度） |
| 🎖️ **軍機** | 琥珀色 ADS-B 軍機 | adsb.lol | 🟢 |
| 🚢 **即時船舶** | 全球數千艘船 | AISStream | 🟡 |
| 🛰️ **衛星** | 838 物件目錄，依類別著色，DENSE 直接載入 Starlink 殼 | CelesTrak | 🟢 |
| 🌍 **地震** | 過去 24 小時全球地震 | USGS | 🟢 |
| 🚗 **交通** | OSM 路網模擬車流；加 TomTom 即時流速驅動模擬、8 公里以下依壅塞著色，單車位置非即時觀測 | TomTom + OSM | 🟢 模擬 · 🟡 即時流速 |
| 📹 **CCTV 網** | 約 3,600 支公共攝影機投影進 3D —— Austin、Texas（TxDOT）、California（Caltrans）、London（TfL）、Ontario（511）、Finland、BC、Estonia、NSW、Calgary。位置為公告值，位姿為估計先驗，可拖 gizmo 校正 | 各城市 API | 🟢 |
| 📻 **廣播** | 地理定位全球廣播 + 類比調諧器 —— 拖指針掃 750 台，地球飛到播音者 | Radio Browser | 🟢 |
| 🚌 **大眾運輸** | 公車、路面電車、地鐵、火車、渡輪即時報位，選車尾跡、運具著色 DETECT 標籤 | 各營運商 GTFS-Realtime | 🟢 |
| 🚲 **共享單車** | 站點即時可借還 | GBFS | 🟢 |
| 🧭 **路徑** | 在地球上點 A、B，沿街駕駛/步行/單車路線貼地形展開，附轉彎提示，可 FLY 飛一遍。免 Key、免 geocoder、免麥 | OSRM（FOSSGIS + OSM） | 🟢 |
| 🔥 **活火** | NASA FIRMS 過去 24 小時偵測 | NASA FIRMS | 🟡 |
| 🚀 **太空任務** | 滾動 30 天發射，載荷、節、回收細節 | Launch Library 2 | 🟢（🟡 選配 token 拉高額度） |
| 🎖️ **標定設施** | 視窗內軍事設施社群標註，本質不完整並如實標示 | OSM | 🟢 |

**底圖階梯：**

| 你有什麼 | 你看到的地球 |
|----------|--------------|
| 🟢 什麼都沒有 | Esri 衛星底圖 + 免 Key 地形，2D。Esri 不通自動切 OSM，地形沒有就繼續轉 |
| 🟡 免費 Cesium ion token | **Google 照片級寫實 3D 城市** + 全球地形 —— 個人非商業資格內，依現行 ion 條款配額 |
| 🔴 Google Maps key | 同樣 3D 直連 Google，外加 App 內地點搜尋 —— 計費、計量制路線 |

另有：鄰里疊加、駕駛艙 WX 雲效。內建靜態基建：資料中心 4,351、壩 704、海纜 712。

缺你想要的圖層？開 issue —— 或自己加上送 PR。

---

## 🔑 API Key 一覽

🟢 **免 Key** · 🟡 **免費 Key** · 🔴 **計量制**，一律走 **POWER UP → Provider Settings** 加。都不加也能啟動。

| | Key | 開什麼 | 去哪拿 |
|---|---|--------|--------|
| 🟡 | **Cesium ion** | Google 照片級寫實 3D、全球地形、ion 代管影像堆疊。免費 Community 限符合資格個人非商業，有配額 | [cesium.com/ion](https://cesium.com/ion)，用 `assets:read` 公開 token，並看現行計價/資格 |
| 🔴 | **Google Maps** | 直連 Google 照片級寫實 3D + Google 地點搜尋（Map Tiles API） | [Google Cloud Console](https://console.cloud.google.com/)，記得限 URL |
| 🔴 | **OpenAI** | 語音體驗 + AI HUD 摘要，mini 可用，標準版聰明很多 | [platform.openai.com](https://platform.openai.com)，計量制 |
| 🟡 | **AISStream** | 全球即時船舶 | [aisstream.io](https://aisstream.io) 免費註冊 |
| 🟡 | **NASA FIRMS** | 即時活火 | [firms.modaps.eosdis.nasa.gov](https://firms.modaps.eosdis.nasa.gov/api/map_key/) 免費 |
| 🟡 | **TomTom** | 模擬交通的即時流速與壅塞色 | [developer.tomtom.com](https://developer.tomtom.com) 免費層 |

加分：OpenSky（更多航班 polling 額度，匿名也行）、Launch Library 2（更高發射查詢額度）。

### 💸 實際花費（2026 年中概估，以原廠定價頁為準）

- **🟢 多數圖層：$0 免註冊。** OpenSky 匿名、USGS、CelesTrak、adsb.lol、城市 CCTV、Radio Browser、GBFS、Launch Library 2、內建資料。
- **🟡 免費 Key 層：$0 註冊拿。** AISStream、FIRMS、TomTom、OpenSky，外加資格內 Cesium ion。仍受配額資格限制。
- **🗺️ Google 3D：資格內走 Cesium ion Community 免費額度內；直連 Google 走計量。** 直連才有地點搜尋與商業部署，啟用計費務必設限額、預算告警。
- **🔴 OpenAI 語音：唯一真花錢的 —— App 會幫你計表。** Realtime 語音每活躍分鐘幾分錢，重度一晚個位數美元。麥克風旁有即時花費表，STD/MINI 切換，$2 告警、**$5 硬停**。語音上下文刻意收短。

預設綁 localhost，不分享。要分享 LAN 請顯式 opt-in，但注意 ⚠️ **LAN 可見的伺服器會把你設好的 API Key 轉代理給連得上的人。** 先設原廠配額、用量上限、帳單告警。完整威脅模型見 `SECURITY.md`。

---

## 📋 負責任與開放

上帝之眼跑在**公開資料、清楚來源、本機優先**。無秘密、無私有資料集、無神秘爬蟲 —— 碰私鑰的一律走 hardened server-side proxy（SSRF 防護、回應上限、錯誤脫敏）。瀏覽器只見 Google Maps 與 Cesium ion（兩者都要在原廠限額）。

**界線。** 本專案建模**事件、資產、基建、系統** —— 飛機、船舶、衛星、火、攝影機、城市。不做指名找人、人臉辨識、跟蹤個人，跨線 PR 不合併。人不是查詢型別。

**來一起做。** 這是引爆近期空間情報工具潮的那個正典即時 3D 客戶端 —— 也是畫布：這裡的圖層只是一個人找得到、融得起來的訊號。加城市包、資料源、風格、語音工具。授權 **[MIT](LICENSE)**。內建與即時資料各有條款 —— 見 **[DATA_SOURCES.md](DATA_SOURCES.md)**。安全模型：**[SECURITY.md](SECURITY.md)**。想貢獻：**[CONTRIBUTING.md](CONTRIBUTING.md)**。

> [!IMPORTANT]
> 上帝之眼是公開與第三方資料的探索式視覺化。資料可能延遲、不完整、建模、推估或錯誤。勿用於飛航 maritime 導航、緊急應變、醫療健康、投資或其他安全關鍵、作業用途。重要資訊請以權威來源核實。

---

## 🧭 下一步

先謝謝大家。看完 God-view Demo 跑去自己做的、一直敲碗要 code 的，感謝。這倉庫是基線，保持開放，重點就是讓你拆、讓你加我們沒想到的圖層。

先提醒：在這領域做一週就會學到**現在式最便宜**。一旦想回放過去 —— 任何解析度下 tiling、serving、scrubbing 發生了什麼、變了什麼 —— 資料變貴、算力變殘暴。那是長期戰。

**更新 —— 託管版將至。** 原本打算倉庫保持開源客戶端、另做專業產品。發佈後最大聲的不是要功能，是「給我連結」。所以官方託管版在 [Halfpixel](https://halfpixel.ai) 施工中：免安裝，瀏覽器打開即用。更多消息稍候。

▶️ [God's Eye View 系列](https://youtube.com/playlist?list=PL6qSg2I-7_koPbDnSMo0QeeHX_RknA2uv&si=nBGYMoHWQw41v93Q) · 📬 [Map the World](https://maptheworld.ai/)

**🌐 God's Eye View. 沒有被遺落的角落。**

---

# 附錄：安裝 God's Eye View（上帝之眼）App 並啟用 3D 圖資的完整步驟（使用者實作筆記）

## 第一階段：從頭開始安裝上帝之眼 App

1. **取得專案網址：** 前往 God's Eye View 在 GitHub 的專案頁面，並複製該專案的網址。
   https://github.com/bilawalsidhu/gods-eye-view
2. **建立工作資料夾：** 在電腦中的任意位置點擊右鍵建立一個新資料夾，隨意取一個您記得住的名字。
3. **設定 AI 助理工作區：** 打開您習慣使用的 AI 助理（如 ChatGPT 或 Claude），將專案指定到剛建立的新資料夾，點擊「打開」並按下「信任此工作區」。
4. **交由 AI 安裝與打包：**
   - 將複製好的 GitHub 專案網址貼到 AI 助理的輸入欄，請 AI 幫忙進行安裝。
   - 由於原版軟體沒有中文介面，您可以同時請 AI 製作中文外掛，並將其打包成一個可以雙擊啟動的 App。

**完成與啟動：** 安裝完成後，依照 AI 提示前往存放位置，將做好的 App 拖曳到電腦的「應用程式」資料夾。之後對著 App 雙擊滑鼠左鍵即可啟動。（第一次啟動若跳出歡迎視窗，可按下鍵盤 ESC 關閉）。

**提示詞：**

```text
https://github.com/bilawalsidhu/gods-eye-view
請你幫我在本機安裝這個專案：
- 安裝好後請幫我做個外掛，將它的主要介面改成繁體中文。
- 請將它做成一個可以雙擊啟動的 App 以方便我使用。
如有需要確認的地方請詢問我。
```

## 第二階段：設定 Cesium Ion 啟用 3D 擬真圖資

預設的街道與建築物是扁平的，若要顯示擬真的 3D 模型，請依照以下步驟設定：

1. **開啟強化功能：** 在 App 畫面右下角點擊「強化功能」。
2. **取得 Cesium Ion 金鑰：** 找到 Cesium Ion 區塊（提供 3D 圖資的平台），點擊「Get Key（取得金鑰）」前往其官網。
3. **註冊並複製 API 金鑰：** 在官網註冊一個免費帳號並成功登入後，於頁面右側找到一組很長的金鑰並複製下來。
4. **貼上並儲存：** 回到 App 中將金鑰貼上（Ctrl + V）並點擊「儲存」。
5. **重啟生效：** 儲存後 App 會自動重新啟動，再次開啟即可在畫面上看到細緻逼真的 3D 街道與建築模型。

**微調視角技巧：** 按住滑鼠拖曳可移動畫面；滾動滾輪可放大縮小；按住 Ctrl 鍵不放並拖曳滑鼠即可轉動 3D 視角。

## 其他可能提示詞

1. 桌面上的 ICON 我想替換成很酷炫的眼睛圖片，你用生圖技能製作並幫我替換
2. 另程式中部分介面沒轉換為繁體中文，請幫我全部製作中文外掛
3. 另我發現很多圖資及設定無法開啟（包括我已輸入 APIKEY 的 TOMTOM），請協助解決
4. 另我發現 CCTV 圖層打開時都是靜態圖片，請把它們都改接上實地的影片
5. 希望開啟本 APP 的瀏覽器改為 Chrome
6. 請幫我把台灣高速公路的攝影機接到這個 APP
7. 啟用地球資料部分請擴充串接 Gemini 3.8 Live 語音模型作為 AI 語音助理，並有引導至 GOOGLE AI STUDIO 申請 FREE API KEY 的按鈕
