"""Validate and rebuild the Yilan old-building carbon-risk project through GeoLibre MCP tools.

This intentionally uses the same in-process MCP tool surface exercised by
GeoLibre/python/tests/test_mcp_server.py. It does not call authoring helpers
directly for project creation/edit/export.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from geolibre.mcp.server import build_server
from geolibre.mcp.workspace import Workspace

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "yilan-old-building-carbon-risk.geolibre.json"
OUT = HERE / "mcp-validated"
OUT.mkdir(parents=True, exist_ok=True)


def call(server, tool: str, /, **arguments):
    result = asyncio.run(server.call_tool(tool, arguments))
    if result.is_error:
        text = result.content[0].text if result.content else "unknown tool error"
        raise RuntimeError(f"{tool} failed: {text}")
    return result.structured_content


def main() -> None:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    source_layers = source["layers"]
    if len(source_layers) != 2:
        raise SystemExit(f"Expected 2 source layers, got {len(source_layers)}")

    server = build_server(Workspace([OUT]))

    catalog = call(server, "list_catalog")
    if "positron" not in catalog.get("basemaps", {}):
        raise SystemExit("GeoLibre catalog does not contain positron basemap")

    project_rel = "map.geolibre.json"
    html_rel = "map.html"

    call(
        server,
        "create_project",
        path=project_rel,
        name=source["name"] + " — MCP validated",
        center=source["mapView"]["center"],
        zoom=source["mapView"]["zoom"],
        basemap="positron",
        overwrite=True,
    )

    for idx, src in enumerate(source_layers):
        props = [f.get("properties", {}) for f in src["geojson"].get("features", [])]
        if len(props) != 12:
            raise SystemExit(f"Layer {src['name']} does not contain 12 townships")

        added = call(
            server,
            "add_geojson_layer",
            path=project_rel,
            name=src["name"],
            data=json.dumps(src["geojson"], ensure_ascii=False),
            style={
                "fillOpacity": src["style"].get("fillOpacity", 0.72),
                "strokeColor": src["style"].get("strokeColor", "#374151"),
                "strokeWidth": src["style"].get("strokeWidth", 1.4),
            },
            index=idx,
        )
        layer_id = added["layerId"]

        column = "screeningScoreV02" if idx == 0 else "oldShare2019"
        call(server, "list_layer_properties", path=project_rel, layer=layer_id)
        call(
            server,
            "classify_layer",
            path=project_rel,
            layer=layer_id,
            column=column,
            class_count=4 if idx == 0 else 5,
            colormap="rdylgn" if idx == 0 else "rdylbu",
            scheme="equal-interval",
        )
        call(
            server,
            "style_layer",
            path=project_rel,
            layer=layer_id,
            style={
                "vectorStyleMode": src["style"]["vectorStyleMode"],
                "vectorStyleProperty": src["style"]["vectorStyleProperty"],
                "vectorStyleClassCount": src["style"]["vectorStyleClassCount"],
                "vectorStyleColorRamp": src["style"]["vectorStyleColorRamp"],
                "vectorStyleClassificationScheme": src["style"]["vectorStyleClassificationScheme"],
                "vectorStyleStops": src["style"]["vectorStyleStops"],
            },
        )

        if idx == 1:
            call(server, "update_layer", path=project_rel, layer=layer_id, visible=False)

        popup = src.get("popup", {})
        call(
            server,
            "set_layer_popup",
            path=project_rel,
            layer=layer_id,
            fields=popup.get("fields"),
            click=popup.get("click", True),
            title=popup.get("titleField"),
            max_width=popup.get("maxWidth", 420),
        )

    call(
        server,
        "set_view",
        path=project_rel,
        center=source["mapView"]["center"],
        zoom=source["mapView"]["zoom"],
        bearing=source["mapView"].get("bearing", 0),
        pitch=source["mapView"].get("pitch", 0),
    )

    call(
        server,
        "add_legend",
        path=project_rel,
        title="綜合碳排風險潛勢初篩",
        legend_dict={
            "D 較低（<35）": "#1a9850",
            "C 中度（35–54.9）": "#fee08b",
            "B 高優先（55–74.9）": "#f46d43",
            "A 極高優先（≥75）": "#d73027",
        },
        position="bottom-left",
        shape="square",
    )

    described = call(server, "describe_project", path=project_rel)
    if described.get("layerCount") != 2:
        raise SystemExit(f"MCP describe_project expected 2 layers: {described}")
    if "legend" not in described.get("mapControls", []):
        raise SystemExit(f"MCP describe_project did not restore legend: {described}")

    exported = call(
        server,
        "export_html",
        path=project_rel,
        out_path=html_rel,
        title=source["name"],
        width="100%",
        height="900px",
        overwrite=True,
    )

    validation = {
        "status": "pass",
        "validation_mode": "GeoLibre MCP tool surface via build_server/Workspace",
        "catalog_has_positron": True,
        "mcp_tools_called": [
            "list_catalog",
            "create_project",
            "add_geojson_layer",
            "list_layer_properties",
            "classify_layer",
            "style_layer",
            "update_layer",
            "set_layer_popup",
            "set_view",
            "add_legend",
            "describe_project",
            "export_html",
        ],
        "describe_project": described,
        "export_html": exported,
        "source_project": SOURCE.name,
    }
    (OUT / "mcp-validation.json").write_text(
        json.dumps(validation, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(validation, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
