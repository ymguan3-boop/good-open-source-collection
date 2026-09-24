# GitHub MCP execution protocol

Use this only after the user has explicitly confirmed the final analysis specification.

## Fixed repository

- Repository: `ymguan3-boop/good-open-source-collection`
- Branch: `main`
- GeoLibre web output root: `GeoLibre-Web`

Use the connected GitHub MCP tools. Tool names may vary slightly by environment; use the equivalents of repository metadata, fetch file, create file, update file, and workflow/log inspection.

## Existing pattern to preserve

The repository already contains a working example:

- `scripts/build_yilan_flood_risk.py`
- `.github/workflows/build-yilan-flood-risk.yml`
- `GeoLibre-Web/yilan-flood-risk.geolibre.json`

Treat it as a reference implementation, not a file to overwrite for unrelated tasks.

## Per-task files

Create a stable slug `task_id`, for example:

`yilan-traffic-accident-safety-2026-09`

Write the analysis script to:

`scripts/geolibre_tasks/<task_id>.py`

Write the final trigger manifest to:

`GeoLibre-Web/tasks/current-task.json`

Expected output directory:

`GeoLibre-Web/analysis/<task_id>/`

## Manifest schema

Use this structure:

```json
{
  "enabled": true,
  "task_id": "<task_id>",
  "script": "scripts/geolibre_tasks/<task_id>.py",
  "topic": "<topic>",
  "goal": "<analysis_goal>",
  "confirmed_spec": {
    "geographic_scope": "...",
    "time_range": "...",
    "input_layers": [],
    "spatial_rules": [],
    "thresholds": {},
    "filters": {},
    "outputs": []
  }
}
```

The manifest is the execution trigger. **Write/update it last.**

## Script requirements

The generated Python script must:

1. Read `GeoLibre-Web/tasks/current-task.json`.
2. Assert that the manifest `task_id` matches the script's task.
3. Fetch or load the confirmed data sources.
4. Keep coordinate reference systems explicit.
5. Perform exactly the confirmed spatial rules and thresholds.
6. Keep source provenance in metadata/report.
7. Write the required result contract into `GeoLibre-Web/analysis/<task_id>/`.
8. Never modify unrelated result folders.
9. Fail loudly when a required criterion cannot be evaluated; do not silently drop it.
10. When a source is unavailable but the user had allowed substitutes, record the substitution in `report.md` and `summary.json`.

Prefer Taiwan TWD97 / TM2 (EPSG:3826) for meter-based distance analysis in Yilan/Taiwan, then export GeoLibre-facing geometries in WGS84 (EPSG:4326).

## Data priority

Prefer, in order:

1. Existing repository data already used and validated.
2. Taiwan government open data / public GIS services that require no API key.
3. OpenStreetMap / other reputable public open data.
4. User-provided files.

Do not introduce paid services or required secret API keys unless the user explicitly approved them.

## MCP write order

1. Verify repository access.
2. Fetch reference files needed for the task.
3. Create/update `scripts/geolibre_tasks/<task_id>.py`.
4. Ensure the generic workflow `.github/workflows/geolibre-analysis.yml` exists.
5. Only after all code is ready, create/update `GeoLibre-Web/tasks/current-task.json`.
6. The manifest commit triggers the GitHub Action.
7. Inspect the Action result/logs when available.
8. Fetch and validate the generated outputs.

Do not update the manifest first.

## Completion checks

Require all applicable files:

- `map.geolibre.json`
- `result.geojson`
- `result.csv`
- `result.xlsx` if tabular
- `report.md`
- `summary.json`

Inspect `summary.json` for record count and data-source notes.

Inspect `report.md` for criteria, sources, limitations, and substitutions.

The final response to the user should include:

- completed task name,
- criteria actually applied,
- number of selected features,
- data sources used,
- limitations/substitutions,
- direct GitHub paths/links to the GeoLibre map and table files.

Do not report "analysis complete" until outputs are verified.
