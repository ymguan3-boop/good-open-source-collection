# Repository 與部署設定

## Repository

- GitHub：`ymguan3-boop/good-open-source-collection`
- GeoLibre 原始碼：`GeoLibre/`
- 已編譯公開版：`GeoLibre-Web/`
- GeoLibre 官方 Skill：`GeoLibre/skills/geolibre/`
- 本使用者 Skill：`.agents/skills/geolibre-analysis-wizard/`

## GitHub Pages

目前公開基底：

`https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/`

分析案件建議放：

`GeoLibre-Web/analysis/<slug>/`

公開 project URL：

`https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/<slug>/<slug>.geolibre.json`

公開查看 URL 應把 project URL 單獨 encode，不可把 `&locale` 等外層參數一起 encode：

`https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/?url=<ENCODED_PROJECT_URL>&locale=zh-TW&layout=viewer`

建議每個案件另建立：

`GeoLibre-Web/analysis/<slug>/index.html`

作為穩定入口，避免使用者手動處理 URL encoding。

## 執行分析的優先策略

若 Codex 工作環境可執行 Python：

1. 在本地/工作環境直接跑分析；
2. 產生 artifacts；
3. 本地 QA；
4. commit；
5. 等部署；
6. 用公開 URL 做瀏覽器 QA 與截圖。

若工作環境不適合長時間 GIS 運算，但 GitHub Actions 可用：

1. 建立/更新 `scripts/geolibre_jobs/<slug>.py`
2. 建立可重跑的 workflow 或呼叫現有 workflow
3. 查看 workflow status/log
4. 成功後讀回 summary
5. 等 Pages 部署
6. 瀏覽器 QA/截圖

不要把「commit 成功」當成「分析成功」；一定要看執行結果。

## 若未來改用 Cloudflare Pages

本 Skill 不應依賴 GitHub Pages 專屬能力。

部署 adapter 概念：

- `PUBLIC_BASE_URL`：GeoLibre app 的公開 URL
- `ARTIFACT_BASE_URL`：分析成果所在公開 URL
- `DEPLOY_PROVIDER`：github-pages / cloudflare-pages / other

若 Cloudflare Pages 與同一 GitHub repo 連動，分析流程不變：
Codex 修改 repo → CI/分析 → commit artifacts → Cloudflare Pages 自動部署。

只需要把公開 URL 組裝改成 Cloudflare 網域即可。

## 語言

- UI：繁體中文
- query parameter：`locale=zh-TW`
- 分析結果欄位：繁體中文為主
- 原始資料欄位可保留官方名稱，以利追溯

## 修改邊界

一般案件不要修改：

- `GeoLibre/apps/`
- `GeoLibre/packages/`

除非已證實是平台功能缺失。

一般案件只新增/修改：

- `scripts/geolibre_jobs/`
- `GeoLibre-Web/analysis/`
- 必要的 workflow
- 本 Skill 的 references
