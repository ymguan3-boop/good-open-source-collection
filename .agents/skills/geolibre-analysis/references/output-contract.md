# GeoLibre analysis output contract

Use this contract after the analysis specification has been confirmed.

## Required output package

Write task outputs under `<analysis_root>/<task_id>/`.

Required when applicable:

- `map.geolibre.json` — default interactive GeoLibre project
- `overview.geojson` — lightweight overview for large results
- `result.geojson` — authoritative full vector result
- `result.csv`
- `result.xlsx`
- `summary.json`
- `report.md`
- `performance.json`
- `index.html` — stable public redirect/entrypoint
- `map-overview.png` — screenshot from the actual GeoLibre page when browser automation exists
- optional `map-detail-01.png`, etc.

## XLSX requirements

When the result is naturally tabular, create a real XLSX, not a renamed CSV.

Use at least these worksheets:

1. **分析結果**
   - one row per result feature/road segment/site
   - readable name
   - administrative area when available
   - risk level/score when used
   - rule/trigger reason
   - relevant distances/counts/years
   - elevation/slope when used
   - source feature id / OSM id / official id when traceable

2. **統計摘要**
   - total result count
   - unique feature/road/facility count
   - total length/area when relevant
   - risk-level counts
   - administrative-area counts when useful

3. **分析參數**
   - analysis area
   - time range
   - spatial thresholds
   - CRS used for metric calculations
   - risk/scoring logic
   - generated timestamp

4. **資料來源**
   - layer
   - provider
   - URL/service
   - data date/range
   - retrieval date
   - CRS
   - official vs supplemental
   - role in analysis
   - known limitation

Format the workbook with a header row, filters, frozen first row, reasonable widths,
and appropriate date/number formats.

## GeoLibre project requirements

- Result/overview layer is visible by default and near the top of the layer stack.
- Initial camera frames the result.
- Context layers use restrained opacity.
- Popup fields explain why a feature was selected.
- Metadata records sources, parameters, generation time and limitations.
- Use `locale=zh-TW` for Chinese-user viewing links.
- Keep the default project within the performance budget in `performance-and-publishing.md`.

## Stable public entrypoint

Create `index.html` when the result is meant to be opened by a user.

It should construct the viewer URL safely so that the encoded project URL is separate from
outer parameters such as `locale=zh-TW`, `layout=viewer`, and `loading=true`.

Do not encode `&locale=...` as part of the project URL.

## Real GeoLibre screenshots

When browser automation is available:

1. Open the actual deployed GeoLibre URL with `loading=true`.
2. Wait until `document.documentElement.dataset.geolibreLoadState` is `ready`.
3. Read `data-geolibre-load-errors`; do not accept an errored render.
4. Capture `map-overview.png`.
5. Capture 1-3 detail screenshots only when they add value.

A screenshot from a separately drawn static matplotlib/plotly map is not a GeoLibre screenshot.

When browser automation is unavailable, clearly mark the screenshot as not verified rather than
pretending it exists.

## Cross-checks before completion

- `summary.json.resultCount` matches authoritative GeoJSON feature count.
- XLSX 分析結果 row count matches result count unless the report explains the difference.
- report statistics match summary.
- public project URL returns successfully.
- GeoLibre render reaches ready with no load errors when browser QA is available.
- all non-official supplementary data is labelled as such.
