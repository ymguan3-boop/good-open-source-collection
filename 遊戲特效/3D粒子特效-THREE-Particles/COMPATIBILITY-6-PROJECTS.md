# 六套 3D 特效專案與《幻靈奇旅》相容性矩陣（2026-11-04）

遊戲現有引擎：Three.js r128、global THREE、靜態網頁模式。**六款都不能直接複製進遊戲就保證可用。**

| 專案 | 授權／依賴與相容性 | 可做什麼 | 導入策略 |
|---|---|---|---|
| THREE Particles + Editor | 引擎 MIT、最新 r182；Editor 無獨立 LICENSE；不能直接套 r128 | 真 3D Mesh 粒子、Ribbon、彈道、編輯器 | 隔離 r182 PoC；按需動態載入 runtime |
| three.quarks | MIT；現版 three >= r182 | 批次繪製、範圍大絕 | 二期替代方案；避免跟其他粒子引擎同時捆綁 |
| Effekseer / EffekseerForWeb | Runtime MIT；需 .js/.wasm 與特效資源，素材逐包核權 | 現成多層 3D 效果 | 另開獨立渲染 PoC，不與主場景盲混 |
| Three Nebula | MIT；peer three >= r122，WebGPU 另需更新版 | 基本 WebGL 粒子／JSON | 最先以 r128 隔離確認 Sprite/Mesh Renderer |
| Elemental Serenity | MIT；源碼 three ^r182、GSAP／GLSL | 雨、雪、風、霧、場景 Shader | 參照核心邏輯後模組化；不複製整個場景 |
| Lightning VFX | MIT；源碼 three ^r183.2、GLSL | 立體閃電與局部命中 | 程序邏輯抽取，禁全屏閃白與全局光照變更 |

## 建議的優先驗證順序
1. **Zero-regression**：先跑既有遊戲回歸與 baseline FPS；確認真實運行的 `THREE.REVISION`，不可只根據文件。
2. **Three Nebula r128 WebGL Smoke**：先跑粒子生成／繪製／清理，若失敗，不得在主線嘗試。
3. **THREE Particles r182 獨立頁面**：火球（Mesh）、命中（burst）、Trail（迴旋鏢），用另一份隔離版 Three.js，不與現有 r128 共享同一 scene 或渲染器。
4. **EffekseerForWeb**：依最新官方 README 建立 WebGL Runtime PoC，量測 wasm／資源成本及載入失敗回退；僅在必要時加入第二階段。
5. **天氣與閃電**：借鑑 Elemental Serenity 與 Lightning VFX，但重新實作在 r128／既有天氣鎖定架構；第三關水仙瀑布道路落雷偶發、傷害一次、天空不變。
6. **只選一套正式粒子 Runtime**：保留 pixelfx 在 UI／2D 轉場；其他技術只作離線產圖、參考或延後。

## 相關來源
- https://github.com/NewKrok/three-particles
- https://github.com/NewKrok/three-particles-editor
- https://github.com/Alchemist0823/three.quarks
- https://github.com/effekseer/EffekseerForWeb
- https://github.com/creativelifeform/three-nebula
- https://github.com/SahilK-027/Elemental-Serenity
- https://github.com/SahilK-027/Lightning-VFX
