# v26 原創多運具模型

使用既有 Blender 5.2 製作的低面數示意模型，適用同一個 Cesium 地圖上的旅程行進示意。
模型不包含官方商標，亦不代表特定業者、路線、真實車型或車輛位置。

| 運具代碼 | GLB | 辨識特徵 |
|---|---|---|
| BUS | `taiwan-bus.glb` | 青綠市區公車、大側窗、雙車門、照後鏡、低地板車身 |
| WALK | `taiwan-person.glb` | 藍色外套、深色長褲、橘色背包與跨步姿勢 |
| TRA | `taiwan-tra.glb` | 方形通勤車頭、中央貫通門、分隔駕駛窗、紅色腰帶、集電弓 |
| HSR | `taiwan-hsr.glb` | 長流線鼻頭、斜面擋風玻璃、白色車身與橘色腰帶 |
| METRO | `taiwan-metro.glb` | 較窄斜面車頭、大駕駛窗、藍色腰帶 |
| LRT | `taiwan-lrt.glb` | 綠色腰帶、兩節低地板車體、連接風琴與集電弓 |
| BIKE | `taiwan-bicycle.glb` | 橘色車架、前置籃、輪框與輻條、踏板、座墊 |

## 可重現製作

在專案根目錄執行：

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python scripts/build-transit-models.py
python scripts/build-transit-models.py --sheet-only
```

只重建一種模型可附加 `-- --assets bus`；多種模型可用 `-- --assets tra,metro`。
第二步使用本機已安裝的 Pillow 產生模型總覽與來源／GLB 對照，不需 Blender MCP 或網路服務。

## 尺度、方向與顯示

- 單位為公尺。Blender 來源為 `+X` 前進、`+Z` 向上，原點在地面中心附近。
- GLB 採與既有汽車／機車一致的鼻頭 `+Z` 方向，對應既有 Cesium 的修正與 Heading。
- 材質使用 glTF 相容的 Principled BSDF，只有固體色 PBR，不依賴外部貼圖。
- 模型預算 2,000～6,000 三角面，各模型的量測、SHA-256、尺寸與材質記錄於 `manifest.json`。
- 遠距可見應由現有 `illustrativeModelPlacement()` 和 `minimumPixelSize` 控制，公車與列車建議 64 像素，人物／自行車建議 56 像素。放大模型時同步提高示意位置，以免模型下半部穿入地表；不設過小 `maximumScale`。
- 模型是靜態代表物，由旅程播放引擎沿實際來源路徑移動；未加入骨架步行、車輪旋轉或車體物理模擬。
- 列車使用單節代表車，輕軌使用兩節車體，未模擬完整列車編組。

## 驗收證據

`previews/` 每種模型包含來源的正面、側面、背面、四分之三及近景；GLB 重新載入後包含同鏡頭四分之三與側面。

- `manifest.json`：来源、單位、方向、三角面、材質、檔案雜湊及狀態。
- `validation-*.json`：每種模型的來源／重新匯入結構量測。
- `render-comparison.json`：同鏡頭渲染的像素差異證據，不能代替使用者外觀核准。
- `previews/source-reimport-comparison.png`：來源與重新匯入 GLB 的對照。
- `previews/transit-model-gallery.png`：七種模型總覽。

技術狀態與外觀核准分開：`TECHNICAL_PASS` 不代表使用者已核准外觀；目前外觀為 `ART_REVIEW_PENDING / USER_APPROVAL_PENDING`。
先前擋風玻璃遮蔽、預覽過曝及臺鐵／捷運辨識不足的試作已保留於專案 `.work/` 的修正封存資料夾，未納入模型發布路徑。

## 授權與費用

全部模型與製作腳本為本專案原創，依台灣 overlay 專案的 MIT 授權條款管理。
沒有下載第三方模型、OEM 貼圖、雲端模型生成服務、付費依賴或 API。
Blender 本身依 GNU GPL 授權，原創模型與輸出依本專案 MIT 條款管理；Blender 官方說明創作內容的權利由創作者保有。[Blender 授權說明](https://www.blender.org/about/license/)、[官方授權 FAQ](https://www.blender.org/support/faq/)。
