# Claude Code 實作指令摘要

請先閱讀本資料夾 `README.md`、`SECURITY-REVIEW.md`、`COMPATIBILITY-6-PROJECTS.md`，再依我另附 Word《幻靈奇旅_3D特效六方案相容性抽驗與Claude執行計畫.docx》完成逐項工作。

禁止把 six candidates 整包複製至 `幻靈奇旅/`；禁止直接將主線 Three.js r128 升級到 r182，除非已在隔離分支完成完整遊戲回歸。

請先在分支建立效能 baseline 與 renderer 記錄 → 針對 r128 進行 Three Nebula WebGL 微型實例 → 建立 r182 THREE Particles 隔離 PoC（不影響正式遊戲）→ 檢查 Effekseer WebGL Runtime 的載入及素材授權 → 評估是否可抽出 Elemental Serenity 的天氣與 Lightning VFX 的道路局部閃電 → 整合比較表與實際測試證據。

正式導入只使用選定的一套 3D Runtime；編輯器只作離線製作、不得被打包進玩家載入路徑。所有情境需 lazy-load、效能預算、dispose，保留遊戲邏輯與存檔。冒險蛙飛鏢 1 秒內多目標命中再回手，碰撞與扣血以既有遊戲邏輯為準。詳見 Word 驗收清單。
