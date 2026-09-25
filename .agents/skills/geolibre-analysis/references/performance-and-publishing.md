# GeoLibre performance and publishing rules

Apply these rules to every generated analysis unless the user explicitly requests a fully self-contained project file.

## Goals

The default `map.geolibre.json` is an **interactive viewing entry point**, not a container for the whole analysis dataset.

Keep full-fidelity analytical data in `result.geojson`, CSV/XLSX, or other dedicated files. Keep the default map lightweight.

## Default performance budget

- Target `map.geolibre.json`: **<= 2 MiB**
- Hard maximum `map.geolibre.json`: **5 MiB**
- Max inline GeoJSON payload per layer: **256 KiB**
- Soft initial-load budget (project + visible external GeoJSON): **6 MiB**
- Hard initial-load budget: **12 MiB**
- Large-result threshold: **2,000 features or 5 MiB** in `result.geojson`

These are operational defaults for GitHub Pages / mobile use, not GeoLibre format limits.

## Use URL-backed GeoJSON

GeoLibre supports a remote GeoJSON URL in `source.data`.

Preferred large-layer form:

```json
{
  "id": "risk-overview",
  "name": "高風險摘要",
  "type": "geojson",
  "source": {
    "type": "geojson",
    "data": "https://user.github.io/repo/GeoLibre-Web/analysis/task/overview.geojson"
  },
  "visible": true,
  "opacity": 0.8,
  "style": {
    "fillColor": "#ef4444",
    "fillOpacity": 0.4,
    "strokeColor": "#991b1b",
    "strokeWidth": 1
  }
}
```

Do not also include the same FeatureCollection in the layer's top-level `geojson`.

Use absolute Pages URLs when the project itself is loaded through `?url=...`; this avoids ambiguity about relative-URL resolution.

## Large-result architecture

When `result.geojson` exceeds either large-result threshold:

1. Keep `result.geojson` as the full analytical output.
2. Create `overview.geojson` specifically for the default map.
3. The overview should normally include:
   - high-priority / high-risk results,
   - or a representative/top subset,
   - or aggregated polygons/hex/grid cells,
   - enough fields for useful popups.
4. Target <= 1,000 overview features and <= 3 MiB when practical.
5. Default `map.geolibre.json` should contain:
   - boundary/context layers that are small,
   - 1-3 overview layers,
   - URL-backed sources for any non-trivial data.
6. Do not attach every full detailed layer to the default project merely because the files exist.
7. If a detailed interactive map is valuable, create a separate optional `map-full.geolibre.json` and report that it is heavier.
8. CSV/XLSX/full GeoJSON remain authoritative for row-level analysis.

## Geometry and attributes

Never simplify the authoritative `result.geojson` silently.

For display-only overview data:
- geometry simplification is allowed when recorded in `summary.json` / `report.md`,
- preserve topology where practical,
- use a tolerance appropriate to the map scale,
- preserve identifiers needed to trace a display feature back to the full record,
- remove bulky intermediate/debug properties that are not needed for popup, label, filter, or explanation.

## Layer visibility

On first open:
- keep no more than 3 thematic layers visible by default,
- prefer one clear high-priority overview,
- keep diagnostic/intermediate layers out of the default project,
- avoid duplicating the same source in several URL-backed layers when one categorized/rule-based layer can represent it.

## Automatic post-processing

Before publication, run `optimize-project.py`.

It externalizes oversized inline GeoJSON to `layers/*.geojson`, rewrites the project to URL-backed sources, and writes `performance.json`.

The optimizer is a safety net. It does not replace the script author's obligation to create a lightweight overview for genuinely large analyses.

## Required performance verification

Read `performance.json` and verify:
- project size,
- externalized layer count,
- largest inline layer,
- visible external payload estimate,
- soft/hard mobile budgets.

If the hard budget fails, do not call the task complete. Regenerate the default map as an overview project or reduce its initially visible data without changing the confirmed analytical criteria.
