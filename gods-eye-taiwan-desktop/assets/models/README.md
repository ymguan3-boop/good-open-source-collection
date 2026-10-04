# 原創地圖 3D 模型

本專案使用 Blender 5.2 製作彩色低面數汽車、機車與四旋翼空拍機；原創網格與材質採專案 MIT 授權，沒有車廠標誌、第三方貼圖或下載的商用模型。

|資產|三角面|用途|
|---|---:|---|
|taiwan-car.glb|5,864|汽車路線行進示意|
|taiwan-scooter.glb|2,900|機車路線行進示意|
|taiwan-drone.glb|2,880|空拍起飛位置與拖曳|

最終 GLB 為公尺、+Y 上／+Z 前，符合 Cesium 預設軸向校正；Cesium 校正後 +X 前，Entity heading 減 90 度讓車頭朝指定方位。原始 Blender 為 +X 前／Z 上、地面原點。無骨架、動畫、外部貼圖或壓縮解碼依賴。GLB 再匯入三角面一致，尺寸與材質紀錄在 [validation.json](validation.json)；預覽 PNG 為原始模型示意，並非使用者美術核准紀錄。

重製：在本專案執行 `blender --background --python scripts/build-map-models.py`。模型在 `overlay/public/models/`，可編輯 `.blend` 與預覽保存在本資料夾。

公開外形參考（2026-10-04 查閱，僅參考車身／輪胎／踏板配置，不重製品牌造型）：[Toyota Yaris Cross](https://www.toyota.com.tw/showroom/YARISCROSS/)、[Yamaha JOG](https://www.yamaha-motor.com.tw/motor/motor_JOG)。參考照片沒有納入發布。
