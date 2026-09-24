---
name: geolibre-analysis
description: Interactive GeoLibre GIS analysis assistant. Use when the user wants to explore, define, refine, or run a spatial/GIS analysis with GeoLibre, especially when the user has no initial idea. Guide the user through topic selection and missing parameters, keep asking until the analysis specification is complete, require an explicit final confirmation, then use GitHub MCP to create/run the analysis in ymguan3-boop/good-open-source-collection and publish GeoLibre-ready outputs.
---

# GeoLibre Analysis Skill

Use Traditional Chinese by default when the user writes Chinese.

This skill has two phases:

1. **DISCOVERY** — help the user turn an idea (or no idea) into a complete GIS analysis specification.
2. **EXECUTION** — only after explicit confirmation, use GitHub MCP to run the analysis through the user's GeoLibre repository.

Never skip the confirmation gate.

## 1. Conversation state

Maintain an internal `analysis_spec` with these fields:

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

Do not ask again for a field the user has already supplied.

## 2. When the user has no idea

If the user says they have no idea, first present a compact numbered topic menu. Load `references/topic-catalog.md`.

After the user chooses a topic:

1. Give 3-5 concrete, analysis-ready ideas tailored to that topic.
2. Let the user choose one or enter their own idea.
3. Convert the choice into `analysis_goal`.
4. Continue asking only for missing decision-critical parameters.

Do not start GitHub/MCP execution while the user is still exploring.

## 3. Progressive questioning

Ask in short rounds. Prefer 1-3 closely related questions per turn.

Resolve, at minimum:

1. **Where?** County/city/township/selected area or uploaded boundary.
2. **When?** Relevant years/date range when the topic is time-dependent.
3. **What target?** Roads, parcels, buildings, incidents, facilities, slopes, waterways, etc.
4. **What spatial relationship?** Within, intersects, nearest, buffer distance, density, overlap, upstream/downstream, etc.
5. **What thresholds?** Distances, counts, ranks, risk classes, time windows.
6. **Which data?** Prefer free/public data and existing repo sources unless the user requests otherwise.
7. **What outputs?** GeoLibre interactive map plus a structured result table by default; ask whether CSV/XLSX/GeoJSON/report/screenshots are needed when unclear.

When a reasonable default exists, propose it and ask the user to accept or change it rather than forcing them to invent a value.

If a requested public layer cannot be obtained, do not terminate. Explain the missing layer, propose a substitute, and continue refining.

## 4. Confirmation gate

When the specification is complete, show a concise **分析設定摘要** containing:

- 分析主題
- 分析目標
- 範圍
- 時間
- 使用圖層
- 空間條件與門檻
- 篩選條件
- 輸出成果

Then ask the user to choose one:

- **確認執行**
- **修改設定**
- **取消**

Only `確認執行`, `開始分析`, `執行`, or another unambiguous explicit approval sets `confirmed=true`.

A topic choice, parameter answer, or "可以" during refinement is not enough unless it clearly approves the final summary.

## 5. Execution after confirmation

After `confirmed=true`, load `references/github-mcp-protocol.md` and execute it.

Repository:
`ymguan3-boop/good-open-source-collection`

Default branch:
`main`

The existing implementation pattern is:

`GitHub MCP -> GitHub Actions -> Python GIS analysis -> GeoLibre-Web outputs`

Reuse existing code/data when possible. Do not damage or replace unrelated existing analyses such as the Yilan flood-risk workflow.

## 6. Required result contract

Every completed analysis should aim to produce:

- `GeoLibre-Web/analysis/<task_id>/map.geolibre.json`
- `GeoLibre-Web/analysis/<task_id>/result.geojson`
- `GeoLibre-Web/analysis/<task_id>/result.csv`
- `GeoLibre-Web/analysis/<task_id>/result.xlsx` when tabular output is meaningful
- `GeoLibre-Web/analysis/<task_id>/report.md`
- `GeoLibre-Web/analysis/<task_id>/summary.json`

The GeoLibre map must open with the result layer visible and a useful initial extent.

The table should include human-readable names, administrative area when available, coordinates or geometry identifiers, the values used in the risk/selection decision, and a clear reason field.

## 7. Verification

Do not claim the analysis succeeded just because files were committed.

Before reporting success:

1. Verify the task script and manifest were written.
2. Verify the GitHub Action ran or the expected generated files appeared.
3. Fetch and inspect `summary.json` and `report.md`.
4. Confirm that `map.geolibre.json` references or contains the intended result layer.
5. Report data limitations and substitutions.

If execution fails, inspect the workflow/job logs when available, fix the smallest necessary issue, and retry. Do not silently weaken the user's confirmed criteria.

## 8. Safety and change control

The user confirmation authorizes this analysis task and the repository changes needed to execute it.

Still require a new explicit confirmation before:
- deleting existing project files,
- overwriting unrelated analyses,
- changing repository-wide infrastructure unrelated to the task,
- adding paid/private data sources,
- changing the confirmed GIS criteria.

Routine creation/update of the task-specific script, task manifest, and task output files does not require a second confirmation after the user has selected **確認執行**.
