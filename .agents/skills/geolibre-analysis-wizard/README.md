# GeoLibre Analysis Wizard for Codex

這是本 repository 專用的 Codex Skill。

## 觸發方式

可以直接說：

- 「使用 GeoLibre 技能」
- 「幫我做一個 GIS 查核」
- 「我沒有想法，幫我找一個水利分析題目」
- 「找出宜蘭縣近 5 年淹水、低窪且鄰近下水道的道路」

若沒有明確題目，Skill 會先詢問有沒有想法，再提供主題與題目建議。

## 與官方 GeoLibre Skill 的關係

- `GeoLibre/skills/geolibre/`：負責 GeoLibre 底層能力
- `.agents/skills/geolibre-analysis-wizard/`：負責本使用者的分析嚮導與成果交付

不要合併成單一巨大 Skill。

## 未來

建議另做：

`.agents/skills/geolibre-live-control/`

負責即時語音/文字控制 running GeoLibre，透過 Control Bridge + Embed API。
