#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Post-process a GeoLibre project for GitHub Pages/mobile delivery.

- Externalizes large inline GeoJSON layers into layers/*.geojson.
- Rewrites them as GeoJSON URL sources (source.data).
- Leaves authoritative analytical outputs untouched.
- Writes performance.json for QA.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

PROJECT_TARGET = int(os.getenv("GEOLIBRE_PROJECT_TARGET_BYTES", 2 * 1024 * 1024))
PROJECT_HARD = int(os.getenv("GEOLIBRE_PROJECT_HARD_BYTES", 5 * 1024 * 1024))
INLINE_MAX = int(os.getenv("GEOLIBRE_INLINE_LAYER_MAX_BYTES", 256 * 1024))
INLINE_FORCE_WHEN_LARGE = 64 * 1024
INITIAL_SOFT = int(os.getenv("GEOLIBRE_INITIAL_LOAD_SOFT_BYTES", 6 * 1024 * 1024))
INITIAL_HARD = int(os.getenv("GEOLIBRE_INITIAL_LOAD_HARD_BYTES", 12 * 1024 * 1024))


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


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: optimize-project.py <analysis-output-dir>")

    out = Path(sys.argv[1]).resolve()
    root = Path.cwd().resolve()
    project_path = out / "map.geolibre.json"
    if not project_path.exists():
        raise SystemExit(f"missing {project_path}")

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
    force_small = original_project_bytes > PROJECT_TARGET
    layer_dir = out / "layers"
    externalized = []
    inline_sizes = []
    used_names: set[str] = set()

    for idx, layer in enumerate(layers):
        if not isinstance(layer, dict):
            continue
        geo = layer.get("geojson")
        if not isinstance(geo, dict):
            continue
        payload = dump_bytes(geo)
        size = len(payload)
        inline_sizes.append({"id": layer.get("id"), "name": layer.get("name"), "bytes": size})
        if size <= INLINE_MAX and not (force_small and size > INLINE_FORCE_WHEN_LARGE):
            continue

        layer_dir.mkdir(parents=True, exist_ok=True)
        base = safe_slug(str(layer.get("id") or layer.get("name") or ""), f"layer-{idx+1}")
        name = base
        n = 2
        while name in used_names:
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
        if public_out:
            source["data"] = urljoin(public_out, rel_file.as_posix())
        else:
            # A local/desktop fallback. GitHub Pages deployments should always
            # have pages_url in the profile and therefore use an absolute URL.
            source["data"] = rel_file.as_posix()
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
    for layer in project.get("layers", []):
        if isinstance(layer, dict) and isinstance(layer.get("geojson"), dict):
            remaining_inline.append({
                "id": layer.get("id"),
                "name": layer.get("name"),
                "bytes": len(dump_bytes(layer["geojson"])),
            })

    # Estimate initial visible external payload only for files created by this
    # optimizer. Existing remote services are not assigned a guessed size.
    visible_external_bytes = sum(x["bytes"] for x in externalized if x["visible"])
    initial_estimate = final_project_bytes + visible_external_bytes
    largest_inline = max((x["bytes"] for x in remaining_inline), default=0)

    perf = {
        "project_original_bytes": original_project_bytes,
        "project_final_bytes": final_project_bytes,
        "project_target_bytes": PROJECT_TARGET,
        "project_hard_bytes": PROJECT_HARD,
        "externalized_layer_count": len(externalized),
        "externalized_layers": externalized,
        "remaining_inline_layer_count": len(remaining_inline),
        "largest_remaining_inline_bytes": largest_inline,
        "inline_layer_max_bytes": INLINE_MAX,
        "visible_external_payload_bytes_estimate": visible_external_bytes,
        "initial_load_bytes_estimate": initial_estimate,
        "initial_load_soft_bytes": INITIAL_SOFT,
        "initial_load_hard_bytes": INITIAL_HARD,
        "project_budget_ok": final_project_bytes <= PROJECT_HARD,
        "inline_budget_ok": largest_inline <= INLINE_MAX,
        "mobile_soft_budget_ok": initial_estimate <= INITIAL_SOFT,
        "mobile_hard_budget_ok": initial_estimate <= INITIAL_HARD,
        "notes": [
            "Initial-load estimate includes project JSON plus optimizer-created visible GeoJSON files only.",
            "Hidden layers and third-party/service URLs may still have runtime costs not estimated here.",
        ],
    }
    (out / "performance.json").write_text(
        json.dumps(perf, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(json.dumps({
        "project_final_bytes": final_project_bytes,
        "externalized": len(externalized),
        "largest_inline": largest_inline,
        "initial_estimate": initial_estimate,
        "mobile_soft_ok": perf["mobile_soft_budget_ok"],
        "mobile_hard_ok": perf["mobile_hard_budget_ok"],
    }, ensure_ascii=False))

    if not perf["project_budget_ok"]:
        raise SystemExit("GeoLibre project exceeds hard project-size budget after optimization")
    if not perf["inline_budget_ok"]:
        raise SystemExit("GeoLibre project still contains an oversized inline GeoJSON layer")
    if not perf["mobile_hard_budget_ok"]:
        raise SystemExit(
            "Default GeoLibre map exceeds hard initial-load budget; create a smaller overview.geojson/default project"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
