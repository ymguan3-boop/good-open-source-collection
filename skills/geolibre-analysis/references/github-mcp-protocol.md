# GitHub MCP execution protocol

Use only after:
1. a valid `geolibre_profile` has been resolved, and
2. the user explicitly confirmed the final analysis specification.

## Dynamic target

Never hard-code a repository.

Resolve from the canonical profile:

- `repo_full_name`
- `default_branch`
- `source_path`
- `web_root`
- `analysis_root`
- `task_script_root`
- `task_manifest_path`
- `pages_url`

Use the connected GitHub MCP/tooling for repository metadata, file reads/writes, commits, and workflow/log inspection.

## Per-task paths

Create a stable `task_id`, e.g.:
`yilan-traffic-accident-safety-2026-09`

Task script:
`<task_script_root>/<task_id>.py`

Trigger manifest:
`<task_manifest_path>`

If older profiles omit `task_manifest_path`, derive it from `web_root` as `<web_root>/tasks/current-task.json`. Only if `web_root` is also absent may you fall back to the legacy `<source_path>/GeoLibre-Web/tasks/current-task.json`.

Output directory:
`<analysis_root>/<task_id>/`

Generic workflow target:
`.github/workflows/geolibre-analysis.yml`

When absent, create it from the current skill's generic analysis workflow asset or generate an equivalent profile-aware workflow.

## Manifest schema

```json
{
  "enabled": true,
  "task_id": "<task_id>",
  "execution_mode": "analysis",
  "script": "<resolved task script path>",
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

`execution_mode`:
- `analysis` (default): run the GIS task script, optimize, validate, publish.
- `postprocess_only`: reuse already-generated outputs and run only optimization/validation/publication. Use this for styling, externalization, mobile-performance fixes, or republishing when analytical criteria/data have not changed. Do not rerun expensive GIS computation merely to change presentation.

## Script requirements

Generated Python must:

1. Read the resolved task manifest.
2. Assert that manifest `task_id` matches the script task.
3. Fetch/load exactly the confirmed data sources.
4. Keep CRS explicit.
5. Apply exactly the confirmed spatial rules/thresholds.
6. Preserve provenance in output metadata/report.
7. Write outputs only under `<analysis_root>/<task_id>/`.
8. Never modify unrelated result folders.
9. Fail loudly if a required criterion cannot be evaluated.
10. Record allowed substitutions in `report.md` + `summary.json`.
11. Follow `performance-and-publishing.md`.
12. If the full result exceeds 2,000 features or 5 MiB, create a lightweight `overview.geojson` for the default map and keep `result.geojson` as the authoritative full output.
13. Prefer URL-backed GeoJSON in `source.data` for non-trivial display layers; do not duplicate the same FeatureCollection in top-level `geojson`.
14. Keep no more than 3 thematic layers visible by default unless the user explicitly asked otherwise.

For Taiwan meter-based analysis, prefer an appropriate local projected CRS such as TWD97 / TM2 (e.g. EPSG:3826 for Taiwan zone 121) when applicable, then export GeoLibre-facing geometry as EPSG:4326.

## Data priority

Prefer:
1. existing validated sources already in the user's GeoLibre project,
2. authoritative free/public government GIS/open data,
3. reputable open data such as OpenStreetMap,
4. user-provided files.

Do not introduce paid services or secret API requirements without explicit approval.

## MCP write order

1. Revalidate the bound repository and canonical profile.
2. Fetch existing task/workflow files needed for safe integration.
3. Create/update `<task_script_root>/<task_id>.py`.
4. Ensure `.geolibre/tools/optimize-project.py` exists from the skill asset and ensure the profile-aware `.github/workflows/geolibre-analysis.yml` calls it after analysis.
5. Only after code is ready, create/update the resolved `current-task.json`.
6. Let the manifest commit trigger the Action. Use `postprocess_only` when only output presentation/performance changed; use `analysis` whenever data, criteria, thresholds, calculations, or requested outputs changed.
7. Inspect Action result/logs when available.
8. Fetch and validate generated outputs.
9. When appropriate, publish/link the result from the user's existing Pages deployment without replacing GeoLibre itself.

Do not update the manifest first.

## Completion checks

Require all applicable outputs:
- `map.geolibre.json`
- `overview.geojson` when large-result rules apply
- `result.geojson`
- `result.csv`
- `result.xlsx` when tabular
- `report.md`
- `summary.json`
- `performance.json`

Inspect:
- `summary.json` for result count/source notes,
- `report.md` for criteria/sources/limitations/substitutions,
- map project for intended visible result layers,
- `performance.json` for project bytes, inline-layer bytes, and initial-load budget.

If `mobile_hard_budget_ok` is false, do not call the task complete. Regenerate a smaller default overview map without changing the confirmed analytical criteria.

Final response should include:
- task name,
- bound repo,
- criteria actually applied,
- result count,
- data sources,
- limitations/substitutions,
- GitHub file links/paths,
- Pages URL or GeoLibre URL when available.

Never say “analysis complete” until outputs are verified.
