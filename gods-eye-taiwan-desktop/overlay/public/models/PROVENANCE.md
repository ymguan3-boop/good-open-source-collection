# 本機 CCTV 模型與推論執行環境

隨附檔案只由本機服務提供；CCTV 影格僅送至本機 Web Worker，不傳往模型下載站或雲端 AI。模型不需 API Key。

## YOLOX

- 作者：Megvii-BaseDetection。授權 Apache-2.0；完整授權文字隨附 `yolox/LICENSE-YOLOX.txt`。
- 官方 ONNX 發布：`0.1.1rc0`，直接下載原檔，沒有自行訓練或不明轉檔。
- [官方 YOLOX](https://github.com/Megvii-BaseDetection/YOLOX)、[固定版模型發布](https://github.com/Megvii-BaseDetection/YOLOX/releases/tag/0.1.1rc0)。
- Tiny 為 20,219,662 bytes；Nano 為 3,659,407 bytes。SHA-256 見 `provenance.json`。
- 固定輸入 `[1,3,416,416]`、輸出 `[1,3549,85]`，80 個 COCO 類別；介面只統計 person、bicycle、car、motorcycle、bus、truck。
- 官方前處理：保留長寬比縮放、左上對齊、114 補白、BGR／CHW／float32、0–255，不正規化。輸出以 8／16／32 stride 網格解碼，物件信心乘上類別信心，再作 NMS；同一車體的不同類別假說亦去除重疊。
- 核對來源 commit `6ddff4824372906469a7fae2dc3206c7aa4bbaee`：`yolox/data/data_augment.py`、`yolox/utils/demo_utils.py`、`demo/ONNXRuntime/onnx_inference.py`。
- COCO 訓練資料不代表台灣 CCTV 專用模型；遠方小車、遮擋、雨霧與夜間均可能漏判或誤判。單張快照的數量與占用率為 AI 視覺估計，不是官方交通統計或通過流量。

## ONNX Runtime Web

- Microsoft ONNX Runtime Web `1.30.0`，MIT；完整授權見 `onnxruntime/LICENSE-ONNX-Runtime.txt`。
- [官方專案](https://github.com/microsoft/onnxruntime)、[WebGPU 支援](https://onnxruntime.ai/docs/execution-providers/WebGPU-ExecutionProvider.html)、[本機資產部署](https://onnxruntime.ai/docs/tutorials/web/deploy.html)。
- 隨附 `ort-wasm-simd-threaded.asyncify.mjs` 與 `.wasm`，由同版本 npm 套件直接複製。前端程式使用同版本 `onnxruntime-web/webgpu`，其 1.30.0 程式碼選用 Asyncify（不能混用舊 JSEP binary）。
- 支援 WebGPU 時優先使用，初始化或執行失敗改 WASM／CPU。WASM 單執行緒，不需跨來源隔離；推論在專屬 Web Worker 中進行。
- 停止／關閉立即 terminate worker，釋放模型、tensor、frame buffer；再次開始才重新載入。隱藏／縮小不停止。

## 取樣與降載

省電：1 路／5 秒／Nano；平衡：2 路／3 秒／Tiny；即時：最多 2 路／1.5 秒，須至少 8 個邏輯核心、8 GB 記憶體與 WebGPU。Resource Governor 壓力啟動後改 Nano、1 路／8 秒，背景分頁停止背景取樣。每路實際間隔由該路推論完成起算；12 路採輪詢，並不保證每路都達名目頻率。

壅塞門檻置於 `cctvVisionConfig.js`。預設完整畫面，也可指定道路矩形 ROI；框重疊以 64×64 佔用格去重計算。沒有道路 ROI 時背景占比及鏡頭角度會影響判讀，結果必須保留估計說明。
