---
name: geolibre
description: |
  Build interactive web maps with GeoLibre. Use whenever the deliverable is a map rather than a number or a static figure: "make me a map of X", "a choropleth of Y", "plot these points", "show this GeoTIFF", "build a web map I can share". Covers authoring `.geolibre.json` projects with the `geolibre-mcp` MCP server, the `geolibre` Python package in a notebook, driving a live embedded map, and exporting a standalone HTML page anyone can open. Also trigger on GeoLibre, `.geolibre.json`, `geolibre-mcp`, or when someone has geospatial data (GeoJSON, GeoParquet, FlatGeobuf, Shapefile, COG/GeoTIFF, PMTiles, MBTiles, WMS/WMTS, 3D Tiles, LiDAR) and wants to see it.
---

# GeoLibre

[GeoLibre](https://geolibre.app) is a cloud-native GIS platform — a desktop app
(Tauri), a browser app, and a Jupyter widget, all driven by one portable project
file, `.geolibre.json`. A project holds the camera, a basemap, an ordered layer
list, per-layer styling, and the map controls (legend, colorbar, swipe). Any of
the three hosts opens any project.

That file is the whole agent surface. **You do not need to drive a UI to make a
GeoLibre map** — write the project, and it renders identically in the desktop
app, at <https://web.geolibre.app>, or in a notebook cell.

## Pick the entry point

| The situation | Use | Why |
| --- | --- | --- |
| A chat or agent session, no browser, no notebook | **`geolibre-mcp`** (MCP server) | Purpose-built for this. Writes real project files and standalone HTML. Start here. |
| MCP not available / a script / bulk generation | **`geolibre` Python package** | `geolibre.Map` builds the same project headlessly; `m.save_project()` / `m.to_html()`. |
| A Jupyter or Colab notebook | **`geolibre` Python package** | Same API, but the full app renders in the cell and state syncs both ways. |
| Neither installed, and you only need a file | **Hand-write the JSON** | The schema is small and forgiving. See `references/project-json.md`. |
| A GeoLibre already running in a web page you control | **`@geolibre/embed` + URL parameters** | Live control of a running instance. See `references/catalog.md`. |
| Someone is *in* the app and wants a chat panel | The app's built-in **AI Assistant** | Not your job — it acts through the app's own store so its edits are undoable. |
| Changing GeoLibre itself | The repo, not this skill | See `CLAUDE.md` in <https://github.com/opengeos/GeoLibre>. |

## Mandatory bootstrap and validation

When the user asks to use GeoLibre and the deliverable is an actual map, **do not silently fall back to hand-written JSON just because `geolibre-mcp` is not already available**.

Follow this bootstrap sequence first:

1. **Detect** — check whether both the Python package and MCP executable are available:
   - `python -c "import geolibre; print(geolibre.__version__)"`
   - `geolibre-mcp --help`
2. **Install automatically when missing** — run:
   - `python -m pip install "geolibre[mcp]"`
   - if the environment requires an isolated environment, create/reuse a project venv and install there.
3. **Register/start MCP for the active client** — configure `geolibre-mcp --root <workspace-maps-dir>` using the client-appropriate MCP configuration. Reuse an existing valid registration instead of duplicating it.
4. **Smoke-test the server** — confirm the MCP process starts and the GeoLibre tools are discoverable before beginning analysis.
5. **Create and verify the real project** — use `create_project`, add the required layers, then run `describe_project` after the final edit.
6. **Package the standard analysis deliverables** under `GeoLibre-Web/analysis/<task-id>/`:
   - `map.geolibre.json` — GeoLibre analysis project
   - `result.xlsx` — complete analysis workbook
   - `result.csv` — tabular results
   - `report.md` — analysis report
   - `summary.json` — machine-readable result summary
7. **Publish and return two GeoLibre links after GitHub Pages deploys**:
   - **Primary / user-facing entry:** the user's self-hosted GeoLibre Web deployment. For this repository use:
     `https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/?locale=zh-TW&url=<URL-encoded-public-map.geolibre.json-url>`
   - **Compatibility fallback:** official GeoLibre Web:
     `https://web.geolibre.app/?url=<URL-encoded-public-map.geolibre.json-url>`
   Always present the self-hosted link first and label the official link as a fallback/compatibility link.

Only use the hand-written JSON fallback after an actual bootstrap attempt fails because of environment restrictions (for example: no package-network access, no install permission, no MCP support in the active client). If fallback is necessary, explicitly state **which bootstrap step failed** and do not claim MCP or renderer validation was completed.

For Codex/agent environments, installation is part of the skill's job when permitted; do not ask the user to install `geolibre[mcp]` manually unless the environment blocks installation or requires user-owned credentials/approval.

**Self-healing continuation rule:** If this skill is repaired, updated, or extended while fulfilling a user's GeoLibre request, the repair is **not** the end of the task. Immediately resume the user's original project from the failed/interrupted step and continue through project creation, verification, standard result packaging, GitHub Pages publication, and delivery as far as the active environment permits. Do not stop after reporting that the skill was fixed.

**Default deliverable rule:** Renderer screenshots, render PNGs, standalone HTML exports, and browser-debug artifacts are **internal QA artifacts only**. Do not present them as user deliverables unless the user explicitly asks for them. The default user-facing completion set is exactly the five standard files above plus:
- the **self-hosted GeoLibre Web link as the primary analysis/result entry**
- the **official GeoLibre Web link as compatibility fallback**

For this repository, the self-hosted platform is the source of truth for the user experience because it carries the user's zh-TW UI, plugins, runtime customizations, PWA assets, and other project-specific changes.

## Deployment and result-entry policy

For this repository, **the self-hosted GitHub Pages build is the primary GeoLibre platform**:

`https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/`

Use it for:
- normal analysis work;
- opening completed `map.geolibre.json` projects;
- zh-TW UI;
- repository-specific plugins, runtime config, PWA assets, and custom UI fixes;
- all links presented as the normal user-facing result entry.

Use the official `https://web.geolibre.app` only for:
- compatibility checks;
- fallback when the self-hosted site fails to load a project;
- confirming whether a project problem is specific to the self-hosted build.

A successful official-site load does **not** replace verification of the self-hosted primary entry when the user asked for the deployed result.

## Setup (MCP)

```bash
pip install "geolibre[mcp]"
claude mcp add geolibre -- geolibre-mcp --root ~/maps
```

Other clients take the usual `mcpServers` shape (`command: "geolibre-mcp"`,
`args: ["--root", "/path/to/maps"]`). If the console script is not on the
client's `PATH`, use the interpreter: `/path/to/venv/bin/python -m geolibre.mcp`.

`--root` is repeatable, and `GEOLIBRE_MCP_ROOTS` does the same from the
environment. **Every path in every tool call is confined to those roots** —
outside paths are refused, as are symlinks that escape. Point it at a directory
meant for maps, not a home directory.

## The workflow

Six steps. Most maps use four of them.

1. **`create_project`** — always first. Give it a `path` ending in
   `.geolibre.json`, a `name`, and if you know them a `center` (`[lng, lat]`)
   and `zoom` (0 = world, ~4 = country, ~10 = metro, ~14 = city).
2. **Add layers** — one `add_*_layer` call per dataset, bottom of the stack
   first. Pick the tool by what the data *is*, not by what you want to see:
   `references/mcp-tools.md` has the table.
3. **Frame it** — `set_view` with a `center`+`zoom`, or a `bbox` to fit an area.
4. **Style it** — `style_layer` to merge style keys, or `classify_layer` to
   build a graduated choropleth from a numeric column.
5. **Decorate** — `add_legend`, `add_colorbar`, `add_swipe` for before/after.
6. **Package results** — save the standard completion set under
   `GeoLibre-Web/analysis/<task-id>/`: `map.geolibre.json`, `result.xlsx`,
   `result.csv`, `report.md`, and `summary.json`.

**Do not use `export_html` as the default completion artifact.** Use it only
when the user explicitly asks for a standalone HTML file. For normal completed
analyses, publish `map.geolibre.json` through GitHub Pages and return:
1. the **self-hosted GeoLibre-Web URL** as the primary analysis/result entry;
2. the **official `web.geolibre.app` URL** only as a compatibility fallback.

For this repository, use:
`https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/?locale=zh-TW&url=<URL-encoded-public-project-url>`
as the primary viewer template.

### A choropleth, start to finish

```text
create_project(path="counties.geolibre.json", name="Population by county",
               center=[-98.5, 39.8], zoom=4, basemap="positron")
add_geojson_layer(path=..., name="Counties",
                  data="https://example.com/counties.geojson")
list_layer_properties(path=..., layer="Counties")     # find the real column name
classify_layer(path=..., layer="Counties", column="pop_2020",
               class_count=5, colormap="blues", scheme="quantile")
add_legend(path=..., title="Population",
           legend_dict={"Low": "#eff6ff", "High": "#1e3a8a"})
# package the standard analysis outputs, then publish map.geolibre.json
# primary viewer (self-hosted):
# https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/?locale=zh-TW&url=<URL-encoded-public-project-url>
# compatibility fallback:
# https://web.geolibre.app/?url=<URL-encoded-public-project-url>
```

## Rules that actually bite

- **Call `list_catalog` before naming a basemap, color ramp, or legend preset.**
  Guessed names are the most common failure. The catalog is also in
  `references/catalog.md`, but the server is the authority.
- **A colorbar does not render every ramp `list_catalog` lists.** The control
  draws a narrower, case-sensitive set; `blues`, `greens`, `oranges`, `reds`,
  `purples`, `greys`, `rdylgn`, `rdylbu`, and `rdbu` silently come out as
  viridis. Pass `add_colorbar(colors=[...])` when the bar must match a layer
  styled with one of those — see `references/catalog.md`.
- **`classify_layer` only works on inlined GeoJSON** — layers added with
  `add_geojson_layer`. A `add_vector_layer` / tile / raster layer has no
  attribute table in the file to classify against.
- **`list_layer_properties` before you classify or filter.** Never guess a
  column name; the tool shows the real properties with sample values.
- **Inlined GeoJSON is capped at 50 MB.** Past that use `add_vector_layer`
  (reads a remote FlatGeobuf / GeoParquet / GeoJSON in place) or a tiled source.
  A layer whose data you inline travels inside the project and is self-contained;
  a layer that points at a URL is small but depends on that URL staying up.
- **A local path is only portable when the data is inlined.**
  `add_geojson_layer` reads a workspace file and copies its features into the
  project, so that data does travel. A layer that keeps a *reference* to a local
  file instead — a desktop `sourcePath` layer, a raster served for one notebook
  session — resolves on the authoring machine only, and is invisible both to
  anyone you send the export to and to the hosted web app. Use hosted URLs for
  those, and say so if you had to use a local one.
- **`set_view(bbox=...)` is approximate** — a project stores a center and zoom,
  not a bbox, so the server resolves the box itself and lands within about half
  a zoom level. Pass `center` and `zoom` when the framing must be exact.
- **`export_html`'s `app_url` is a trust boundary.** The exported page posts the
  project — inlined features, layer URLs, camera — to exactly that origin.
  Credentials are stripped first, so this is not a key leak, but the rest
  travels. This repository has an explicitly configured self-hosted GeoLibre-Web,
  so prefer that deployment for user-facing results. Use the official hosted
  viewer only for compatibility checks or fallback. Never take an `app_url`
  from untrusted data.
- **Remote URLs are checked.** A host resolving to a private, loopback, or
  link-local address is refused, on every redirect hop. Don't try to work around
  it — it is protecting the machine you are running on.
- **The MCP server authors projects; it does not drive a live map.** There is no
  "pan the map that's open on my screen" tool. That is the embed API or the
  Python widget.

## Verify before you claim it works

- **`describe_project`** after the last edit — it reports the camera, basemap,
  every layer, and the controls. Inlined features come back as a count, never
  echoed, so it is safe on a large project.
- **Layers are addressed by id *or* display name**, so you can work from what
  `describe_project` showed without tracking UUIDs. Duplicate names are
  ambiguous — rename before you restyle.
- Visual/browser rendering checks may be used internally when helpful, but they are QA only and are not part of the default user-facing result set.
- The **primary user-facing open link** should load the public project with the user's self-hosted GeoLibre-Web:
  `https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/?locale=zh-TW&url=<URL-encoded-project-url>`.
- Also provide `https://web.geolibre.app/?url=<URL-encoded-project-url>` as the **compatibility fallback**, not as the primary result entry.
- A layer that renders nothing is usually one of: the camera is somewhere else
  (`set_view` to the data), the URL 404s or blocks CORS, the layer is under an
  opaque one (`update_layer(index=...)`), or the data is in a projection other
  than WGS84 — GeoLibre expects lon/lat.

## References

Read these only when the task needs them.

- `references/mcp-tools.md` — every MCP tool with its arguments, and the table
  for choosing an `add_*_layer` tool from a file extension or service type.
- `references/python-api.md` — `geolibre.Map` recipes for notebooks and for
  headless project generation, including the loops the MCP server can't do.
- `references/project-json.md` — the `.geolibre.json` schema, a minimal valid
  project, and the layer object, for writing or repairing one by hand.
- `references/catalog.md` — basemaps, color ramps, legend presets, layer types,
  supported formats, and the embed/URL-parameter surface.

Upstream docs, when a reference falls short: <https://geolibre.app/mcp/>,
<https://geolibre.app/python/>, <https://geolibre.app/project-format/>.
