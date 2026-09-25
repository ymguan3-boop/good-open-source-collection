#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Post-process a GeoLibre project for GitHub Pages/mobile delivery.

- Externalizes large inline GeoJSON layers into layers/*.geojson.
- Rewrites them as GeoJSON URL sources (source.data).
- Limits default-visible thematic layers.
- Estimates already-externalized local Pages GeoJSON on repeated runs.
- Leaves authoritative analytical outputs untouched.
- Writes performance.json for QA.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit, urlunsplit

PROJECT_TARGET = int(os.getenv("GEOLIBRE_PROJECT_TARGET_BYTES", 2 * 1024 * 1024))
PROJECT_HARD = int(os.getenv("GEOLIBRE_PROJECT_HARD_BYTES", 5 * 1024 * 1024))
INLINE_MAX = int(os.getenv("GEOLIBRE_INLINE_LAYER_MAX_BYTES", 256 * 1024))
INLINE_FORCE_WHEN_LARGE = 64 * 1024
INITIAL_SOFT = int(os.getenv("GEOLIBRE_INITIAL_LOAD_SOFT_BYTES", 6 * 1024 * 1024))
INITIAL_HARD = int(os.getenv("GEOLIBRE_INITIAL_LOAD_HARD_BYTES", 12 * 1024 * 1024))
MAX_VISIBLE_THEMATIC = int(os.getenv("GEOLIBRE_MAX_VISIBLE_THEMATIC_LAYERS", 3))

CONTEXT_TERMS = (
    "boundary", "county", "district", "admin", "context", "background", "basemap",
    "縣界", "市界", "鄉界", "鎮界", "區界", "行政界", "背景",
)


def dump_bytes(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def safe_slug(value: str, fallback: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "-", value or "").strip("-._")
    return value[:100] or fallback


def pages_root(profile: dict) -> str | None:
    raw = str(profile.get("pages_url") or "").strip()
    if not raw:
        return None
    parts = urlsplit(raw)
    clean = urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    if not clean.endswith("/"):
        clean += "/"
    return clean


def is_context_layer(layer: dict) -> bool:
    text = f"{layer.get('id', '')} {layer.get('name', '')}".lower()
    return any(term.lower() in text for term in CONTEXT_TERMS)


def local_source_file(data: str, out: Path, public_out: str | None) -> Path | None:
    """Map a Pages URL/relative source.data back to an output file when possible."""
    value = data.strip()
    if not value:
        return None

    rel: str | None = None
    if public_out and value.startswith(public_out):
        rel = value[len(public_out):]
    else:
        parts = urlsplit(value)
        if not parts.scheme and not parts.netloc:
            rel = parts.path

    if rel is None:
        return None

    rel = unquote(rel.split("?", 1)[0].split("#", 1)[0]).lstrip("/")
    candidate = (out / rel).resolve()
    try:
        candidate.relative_to(out)
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: optimize-project.py <analysis-output-dir>")

    out = Path(sys.argv[1]).resolve()
    root = Path.cwd().resolve()
    project_path = out / "map.geolibre.json"
    if not project_path.exists():
        raise SystemExit(f"missing {project_path}")

    perf_path = out / "performance.json"
    previous_perf = {}
    if perf_path.exists():
        try:
            previous_perf = json.loads(perf_path.read_text(encoding="utf-8"))
        except Exception:
            previous_perf = {}

    profile_path = root / ".geolibre/skill-profile.json"
    profile = json.loads(profile_path.read_text(encoding="utf-8")) if profile_path.exists() else {}
    web_root_rel = str(profile.get("web_root") or "GeoLibre-Web").strip("/")
    web_root = (root / web_root_rel).resolve()
    try:
        out_rel = out.relative_to(web_root)
    except ValueError:
        raise SystemExit("analysis output is not under configured web_root")

    page_root = pages_root(profile)
    public_out = urljoin(page_root, out_rel.as_posix().rstrip("/") + "/") if page_root else None

    project = json.loads(project_path.read_text(encoding="utf-8"))
    layers = project.get("layers")
    if not isinstance(layers, list):
        raise SystemExit("project layers must be an array")

    original_project_bytes = len(dump_bytes(project))
    previous_peak = int(
        previous_perf.get(
            "project_original_bytes_peak",
            previous_perf.get("project_original_bytes", 0),
        )
        or 0
    )
    project_original_bytes_peak = max(previous_peak, original_project_bytes)

    # Presentation-only safeguard: keep the default map calm on mobile.
    visible_thematic = [
        layer for layer in layers
        if isinstance(layer, dict)
        and bool(layer.get("visible", True))
        and not is_context_layer(layer)
    ]
    visibility_adjustments = []
    if len(visible_thematic) > MAX_VISIBLE_THEMATIC:
        for layer in visible_thematic[MAX_VISIBLE_THEMATIC:]:
            layer["visible"] = False
            visibility_adjustments.append({
                "id": layer.get("id"),
                "name": layer.get("name"),
                "reason": f"default-visible thematic layer cap ({MAX_VISIBLE_THEMATIC})",
            })

    force_small = original_project_bytes > PROJECT_TARGET
    layer_dir = out / "layers"
    externalized = []
    used_names: set[str] = set()

    for idx, layer in enumerate(layers):
        if not isinstance(layer, dict):
            continue
        geo = layer.get("geojson")
        if not isinstance(geo, dict):
            continue
        payload = dump_bytes(geo)
        size = len(payload)
        if size <= INLINE_MAX and not (force_small and size > INLINE_FORCE_WHEN_LARGE):
            continue

        layer_dir.mkdir(parents=True, exist_ok=True)
        base = safe_slug(str(layer.get("id") or layer.get("name") or ""), f"layer-{idx+1}")
        name = base
        n = 2
        while name in used_names or (layer_dir / f"{name}.geojson").exists():
            # Reuse an existing same-id filename on repeated runs when the exact
            # source URL already points there; otherwise choose a collision-safe name.
            current_data = ""
            src = layer.get("source")
            if isinstance(src, dict):
                current_data = str(src.get("data") or "")
            expected = f"layers/{name}.geojson"
            if current_data.endswith(expected):
                break
            name = f"{base}-{n}"
            n += 1
        used_names.add(name)

        rel_file = Path("layers") / f"{name}.geojson"
        file_path = out / rel_file
        file_path.write_bytes(payload)

        source = layer.get("source")
        if not isinstance(source, dict):
            source = {}
        source = dict(source)
        source["type"] = "geojson"
        source["data"] = (
            urljoin(public_out, rel_file.as_posix()) if public_out else rel_file.as_posix()
        )
        layer["source"] = source
        layer.pop("geojson", None)

        md = layer.get("metadata")
        if not isinstance(md, dict):
            md = {}
        md = dict(md)
        md["externalizedByGeoLibreSkill"] = True
        if isinstance(geo.get("features"), list):
            md["featureCount"] = len(geo["features"])
        layer["metadata"] = md

        externalized.append({
            "id": layer.get("id"),
            "name": layer.get("name"),
            "file": rel_file.as_posix(),
            "bytes": size,
            "visible": bool(layer.get("visible", True)),
        })

    # Compact JSON is intentional: this is a transport artifact.
    project_path.write_bytes(dump_bytes(project))
    final_project_bytes = project_path.stat().st_size

    remaining_inline = []
    url_backed = []
    for layer in project.get("layers", []):
        if not isinstance(layer, dict):
            continue

        geo = layer.get("geojson")
        if isinstance(geo, dict):
            remaining_inline.append({
                "id": layer.get("id"),
                "name": layer.get("name"),
                "bytes": len(dump_bytes(geo)),
            })

        source = layer.get("source")
        data = source.get("data") if isinstance(source, dict) else None
        if isinstance(data, str):
            local = local_source_file(data, out, public_out)
            url_backed.append({
                "id": layer.get("id"),
                "name": layer.get("name"),
                "url": data,
                "local_file": local.relative_to(out).as_posix() if local else None,
                "bytes": local.stat().st_size if local else None,
                "visible": bool(layer.get("visible", True)),
            })

    # Estimate initial payload for URL-backed files hosted with this output.
    visible_external_bytes = sum(
        int(x["bytes"])
        for x in url_backed
        if x["visible"] and isinstance(x.get("bytes"), int)
    )
    initial_estimate = final_project_bytes + visible_external_bytes
    largest_inline = max((x["bytes"] for x in remaining_inline), default=0)
    visible_thematic_count = sum(
        1
        for layer in project.get("layers", [])
        if isinstance(layer, dict)
        and bool(layer.get("visible", True))
        and not is_context_layer(layer)
    )

    perf = {
        "project_original_bytes": original_project_bytes,
        "project_original_bytes_peak": project_original_bytes_peak,
        "project_final_bytes": final_project_bytes,
        "project_target_bytes": PROJECT_TARGET,
        "project_hard_bytes": PROJECT_HARD,
        "externalized_layer_count_this_run": len(externalized),
        "externalized_layers_this_run": externalized,
        "url_backed_layer_count": len(url_backed),
        "url_backed_layers": url_backed,
        "remaining_inline_layer_count": len(remaining_inline),
        "largest_remaining_inline_bytes": largest_inline,
        "inline_layer_max_bytes": INLINE_MAX,
        "max_visible_thematic_layers": MAX_VISIBLE_THEMATIC,
        "visible_thematic_layer_count": visible_thematic_count,
        "visibility_adjustments": visibility_adjustments,
        "visible_external_payload_bytes_estimate": visible_external_bytes,
        "initial_load_bytes_estimate": initial_estimate,
        "initial_load_soft_bytes": INITIAL_SOFT,
        "initial_load_hard_bytes": INITIAL_HARD,
        "project_budget_ok": final_project_bytes <= PROJECT_HARD,
        "inline_budget_ok": largest_inline <= INLINE_MAX,
        "visible_layer_budget_ok": visible_thematic_count <= MAX_VISIBLE_THEMATIC,
        "mobile_soft_budget_ok": initial_estimate <= INITIAL_SOFT,
        "mobile_hard_budget_ok": initial_estimate <= INITIAL_HARD,
        "notes": [
            "Initial-load estimate includes project JSON plus visible URL-backed GeoJSON files that map back to files in this analysis output.",
            "Hidden layers and third-party/service URLs may still have runtime costs not fully estimated here.",
            "Visibility adjustments affect presentation only; analytical outputs are unchanged.",
        ],
    }
    perf_path.write_text(
        json.dumps(perf, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(json.dumps({
        "project_final_bytes": final_project_bytes,
        "externalized_this_run": len(externalized),
        "url_backed_layers": len(url_backed),
        "largest_inline": largest_inline,
        "visible_thematic_layers": visible_thematic_count,
        "initial_estimate": initial_estimate,
        "mobile_soft_ok": perf["mobile_soft_budget_ok"],
        "mobile_hard_ok": perf["mobile_hard_budget_ok"],
    }, ensure_ascii=False))

    if not perf["project_budget_ok"]:
        raise SystemExit("GeoLibre project exceeds hard project-size budget after optimization")
    if not perf["inline_budget_ok"]:
        raise SystemExit("GeoLibre project still contains an oversized inline GeoJSON layer")
    if not perf["visible_layer_budget_ok"]:
        raise SystemExit("GeoLibre project exceeds default-visible thematic layer budget")
    if not perf["mobile_hard_budget_ok"]:
        raise SystemExit(
            "Default GeoLibre map exceeds hard initial-load budget; create a smaller overview.geojson/default project"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
