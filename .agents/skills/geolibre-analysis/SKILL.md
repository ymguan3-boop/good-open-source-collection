---
name: geolibre-analysis
description: Universal GeoLibre GIS analysis skill for Codex. Use when the user asks to use GeoLibre, perform GIS/spatial analysis, find risk locations, or needs a map plus structured results. If the user has no idea, first offer 16+ topic categories, then 3-5 analysis-ready ideas for the selected topic. Resolve/onboard the user's own GitHub-hosted GeoLibre, progressively confirm the analysis specification, execute reproducibly through GitHub MCP/Python/GeoLibre tooling, then deliver a verified GeoLibre map, real GeoLibre screenshots when browser automation is available, XLSX/GeoJSON, summary and report. Reuse the saved binding on later runs instead of asking for the GitHub path again.
---

# GeoLibre Analysis Skill

Use Traditional Chinese by default when the user writes Chinese.

This is a **multi-user universal skill**. Never hard-code the skill author's GitHub account or repository as the execution target.

The skill has three phases:

1. **BINDING / ONBOARDING** — locate, validate, or create the current user's own GitHub-hosted GeoLibre and remember it.
2. **DISCOVERY** — turn an idea (or no idea) into a complete GIS analysis specification by progressive questioning.
3. **EXECUTION** — only after explicit final confirmation, use GitHub MCP against the bound GeoLibre project, run the analysis, and verify outputs.

## 0. Always resolve the GeoLibre binding first

Before GIS questioning or execution, resolve a valid `geolibre_profile`.

Load `references/onboarding-and-binding.md`.

Resolution order:

1. Read the local cache at `$CODEX_HOME/geolibre-profile.json` (fallback `~/.codex/geolibre-profile.json`) when accessible.
2. If the current repository contains `.geolibre/skill-profile.json`, read it.
3. If GitHub is connected, search repositories accessible to the authenticated user for the marker `geolibre_skill_profile_version`.
4. **Do not rely on code-search indexing.** If marker search returns nothing or seems stale, list accessible repositories and directly probe the canonical path `.geolibre/skill-profile.json` in candidate repositories. Stop once all accessible repos in scope have been checked or valid profiles are found.
5. If exactly one valid profile is found, use it and refresh the local cache.
6. If multiple profiles exist, show their repo + Pages URL and ask which one to use; remember the selection.
7. If none exists, start first-use onboarding.
8. If the user directly supplies a GitHub repository URL/path, validate it and bind it.

Do **not** ask for the GitHub path again when a valid saved profile exists.

The canonical profile lives in the user's own GeoLibre repository at:

`.geolibre/skill-profile.json`

The local cache is only an accelerator. The GitHub profile is the source of truth.

## 1. First-use onboarding

If no valid GeoLibre profile is found:

- If GitHub is not connected, guide the user to connect GitHub/MCP.
- If the user has no GitHub account, guide them to create one. Account registration, identity verification, CAPTCHA, passkeys, terms acceptance, or similar human steps must be completed by the user; never pretend they were automated.
- If the current toolset can create repositories, offer to create a dedicated repository named `GeoLibre` (or a collision-safe variant) automatically.
- If repository creation is unavailable, use browser automation when available; otherwise give the single minimal GitHub UI step needed to create an empty repository, then continue automatically after the user reports completion.
- Prefer a dedicated GeoLibre repository. Also support an existing repository with a `GeoLibre/` subdirectory when the user chooses it.
- Verify the official upstream immediately before install. The official source is `opengeos/GeoLibre`; never silently install from an unofficial fork.
- Default to the latest stable public release when resolvable; fall back to the latest `main` only when appropriate. Record the upstream repo, ref/tag, commit SHA when known, and installation timestamp.
- Bootstrap the source using GitHub Actions rather than uploading thousands of files through MCP one by one.
- Deploy the web build to GitHub Pages.
- Create the canonical profile and local cache only after repository/source/Page validation succeeds.

Use `assets/geolibre-bootstrap-pages.yml` as the deployment template and adapt its branch/path placeholders.

If GitHub Pages cannot be enabled by the available GitHub credentials, ask for only the required one-time UI action:
`Repository → Settings → Pages → Build and deployment → Source: GitHub Actions`.
Then resume and verify the deployment; do not restart onboarding.

## 2. Binding model

Maintain a `geolibre_profile` containing at least:

- `geolibre_skill_profile_version`
- `github_owner`
- `repo_full_name`
- `default_branch`
- `install_mode`: `standalone_repo` or `subdirectory`
- `source_path`: GeoLibre source location, e.g. `.` or `GeoLibre`
- `web_root`: published/static GeoLibre web root; may differ from `source_path`, e.g. `GeoLibre-Web`
- `analysis_root`
- `task_script_root`
- `task_manifest_path`
- `pages_url`
- `pages_base_path`
- `upstream_repo`: normally `opengeos/GeoLibre`
- `upstream_ref`
- `upstream_commit` when known
- `last_verified_at`

Profile schema/example: `assets/geolibre-profile.example.json`.

Before each execution, do a lightweight validity check:
- repository still exists,
- user has required read/write permission,
- canonical profile still matches,
- core source/build files still exist.

Do not re-run full onboarding if those checks pass.

## 3. Conversation state for GIS analysis

Maintain an internal `analysis_spec` with:

- `topic`
- `analysis_goal`
- `geographic_scope`
- `time_range`
- `target_features`
- `input_layers`
- `spatial_rules`
- `thresholds`
- `filters`
- `data_source_preference`
- `outputs`
- `task_id`
- `confirmed`

Do not ask again for a field the user already supplied.

## 3A. Entry behavior

When the request is vague, such as "使用 GeoLibre 技能", "幫我做 GIS 分析", or "我沒想法",
do not immediately start coding.

If the user already supplied a concrete GIS question, skip idea discovery and continue from the
missing fields in the analysis specification.

If the user has not supplied a concrete question, ask only:

- **A. 有，我直接描述需求**
- **B. 還沒有，請先給我主題讓我選**

If the user chooses B, show the compact topic menu from `references/topic-catalog.md`.
After the topic is selected, give 3-5 complete analysis-ready ideas and let the user choose one
or enter their own. Once an idea is selected, do not return to the topic menu unless the user asks.

## 4. When the user has no idea

If the user says they have no idea, or chooses option B in the entry flow, present the compact numbered topic menu from `references/topic-catalog.md`. Show 12-17 short topic names first; do not dump every example at once.

After topic selection:

1. Give 3-5 concrete, analysis-ready ideas tailored to that topic.
2. Let the user choose one or enter their own.
3. Convert the choice into `analysis_goal`.
4. Continue asking only for missing decision-critical parameters.

Do not start execution while the user is still exploring.

## 5. Progressive questioning

Ask in short rounds, preferably 1-3 related questions per turn.

Resolve, at minimum:

1. **Where?** County/city/township/selected area/uploaded boundary.
2. **When?** Relevant years/date range when time-dependent.
3. **What target?** Roads, parcels, buildings, incidents, facilities, slopes, waterways, etc.
4. **What spatial relationship?** Within/intersects/nearest/buffer/density/overlap/network relationship.
5. **What thresholds?** Distances, counts, ranks, risk classes, time windows.
6. **Which data?** Prefer free/public data and existing validated project sources unless requested otherwise.
7. **What outputs?** GeoLibre map + structured table by default; clarify CSV/XLSX/GeoJSON/report/screenshots when needed.

When a sensible default exists, propose it and let the user accept/change it.

If a requested public layer is unavailable, explain the gap, propose a substitute, and continue. Never silently remove a confirmed criterion.

## 6. Confirmation gate

When the specification is complete, show a concise **分析設定摘要**:

- 分析主題
- 分析目標
- GeoLibre 綁定位置（repo only; do not expose credentials）
- 範圍
- 時間
- 使用圖層
- 空間條件與門檻
- 篩選條件
- 輸出成果

Then ask:

- **確認執行**
- **修改設定**
- **取消**

Only an unambiguous final approval such as `確認執行`, `開始分析`, or `執行` sets `confirmed=true`.

A topic choice or intermediate “可以” is not sufficient unless it clearly approves the final summary.

## 7. Execution after confirmation

After `confirmed=true`, load:
- `references/github-mcp-protocol.md`
- `references/performance-and-publishing.md`
- `references/output-contract.md`

Apply the performance rules while generating the task script; do not treat optimization as an afterthought.

The execution target comes from `geolibre_profile`, never from a hard-coded repository.

Pattern:

`GitHub MCP -> user's GeoLibre repo -> GitHub Actions -> Python GIS analysis -> GeoLibre-ready outputs -> published/accessible results`

Reuse existing project data and code when safe. Never overwrite unrelated analyses or upstream application source unnecessarily.

## 8. Required result contract

Under `<analysis_root>/<task_id>/`, aim to produce the complete result package defined in
`references/output-contract.md`.

Minimum deliverables:

- `map.geolibre.json` — lightweight default viewing project
- `overview.geojson` when the result crosses the large-result threshold
- `result.geojson` — authoritative full vector result
- `result.csv`
- `result.xlsx` when tabular output is meaningful
- `summary.json`
- `report.md`
- `performance.json`
- `index.html` — stable public entrypoint that opens the project with correct URL encoding
- `map-overview.png` — a screenshot from the real GeoLibre page when browser automation is available
- optional `map-detail-01.png`, `map-detail-02.png` for important clusters/details

The GeoLibre map must open with a useful initial extent and a high-value overview/result layer visible.
For large results, the default project must not embed the entire analytical dataset.

For XLSX, use at least these worksheets when applicable:
- 分析結果
- 統計摘要
- 分析參數
- 資料來源

The result table should include readable names, administrative area where available,
coordinates/geometry identifiers, decision values, and a clear reason field explaining why
each feature was selected.

## 9. Verification

Do not report success just because files were committed.

Before saying the analysis is complete:

1. Verify task script + manifest.
2. Verify the GitHub Action completed or expected generated files appeared.
3. Inspect `summary.json` and `report.md`.
4. Confirm `map.geolibre.json` contains/references the intended result.
5. Inspect `performance.json`; require the hard project-size, inline-layer, and initial-load budgets to pass.
6. For large results, verify the default map uses `overview.geojson` or another deliberately lightweight overview rather than the complete analytical dataset.
7. Verify the saved public GeoLibre URL still loads when public deployment is part of the deliverable.
8. When browser automation is available, open the actual GeoLibre URL with `loading=true`, wait for
   `data-geolibre-load-state=ready`, inspect `data-geolibre-load-errors`, then capture the screenshot.
   Never use a separately drawn matplotlib/static map as a substitute for a claimed GeoLibre screenshot.
9. Cross-check XLSX result-row count against the authoritative GeoJSON result count, or explain the difference.
10. Report data limitations/substitutions and any display-only simplification.

If execution fails, inspect logs, make the smallest necessary fix, and retry without weakening confirmed criteria.

## 10. Change control

The user's final analysis confirmation authorizes task-specific repository changes needed for that analysis.

Require a new explicit confirmation before:
- deleting existing project files,
- overwriting unrelated analyses,
- changing repository-wide infrastructure unrelated to the task,
- adding paid/private data sources,
- changing confirmed GIS criteria,
- replacing the user's bound GeoLibre repository with another repository.

Routine task-specific scripts, manifests, output files, and normal profile refreshes do not require a second confirmation.
