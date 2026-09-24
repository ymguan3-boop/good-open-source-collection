#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build a reproducible Yilan flood-risk road screening map for GeoLibre.

Criteria:
1) Road segment is within 100 m of an official flood incident point (2021-2025).
2) Road segment is within 30 m of a national storm-sewer line.
3) Low-lying: DEM local elevation percentile <= 20%, OR absolute elevation <= 5 m.

This is a screening analysis, not a legal/engineering determination.
"""
from __future__ import annotations

import csv
import io
import json
import math
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import requests
from PIL import Image
from pyproj import Transformer
from shapely.geometry import (
    GeometryCollection,
    LineString,
    MultiLineString,
    Point,
    box,
    mapping,
    shape,
)
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "GeoLibre-Web"
OUT.mkdir(parents=True, exist_ok=True)

FLOOD_CSV_URL = (
    "https://mas.nstc.gov.tw/OPENDATA/GetFile"
    "?fileodr=1&format=csv&serialno=455"
)
SEWER_QUERY_URL = (
    "https://gis.liquid.net.tw/arcgis/rest/services/Hosted/"
    "%E9%9B%A8%E6%B0%B4%E4%B8%8B%E6%B0%B4%E9%81%93%E6%B8%85%E6%B7%A4%E7%B4%80%E9%8C%84/"
    "FeatureServer/13/query"
)
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# Conservative fallback extent, used only if the boundary lookup fails.
YILAN_FALLBACK_BBOX = (121.20, 24.30, 122.10, 25.10)  # W,S,E,N
YILAN_CITY_ID = "10002"

FLOOD_START_YEAR = 2021
FLOOD_END_YEAR = 2025
FLOOD_BUFFER_M = 100.0
SEWER_DISTANCE_M = 30.0
LOW_PERCENTILE_MAX = 20.0
ABS_LOW_ELEVATION_M = 5.0
DEM_ZOOM = 14
DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"

UA = (
    "GeoLibre-Yilan-Flood-Risk/1.0 "
    "(public-data screening; repository ymguan3-boop/good-open-source-collection)"
)

session = requests.Session()
session.headers.update({"User-Agent": UA})

to_wgs84 = Transformer.from_crs("EPSG:3826", "EPSG:4326", always_xy=True)
to_tm2 = Transformer.from_crs("EPSG:4326", "EPSG:3826", always_xy=True)

def log(msg: str) -> None:
    print(f"[yilan-flood-risk] {msg}", flush=True)

def get_json(url: str, *, params: dict[str, Any] | None = None, timeout: int = 60) -> Any:
    r = session.get(url, params=params, timeout=timeout)
    r.raise_for_status()
    return r.json()

def fetch_boundary():
    params = {
        "q": "宜蘭縣, 台灣",
        "format": "geojson",
        "polygon_geojson": 1,
        "limit": 1,
        "countrycodes": "tw",
    }
    try:
        data = get_json(NOMINATIM_URL, params=params, timeout=60)
        feats = data.get("features", [])
        if feats:
            geom = shape(feats[0]["geometry"])
            if not geom.is_empty:
                log("Loaded Yilan County boundary from OpenStreetMap/Nominatim.")
                return geom
    except Exception as e:
        log(f"Boundary lookup failed; using fallback bbox: {e}")
    w, s, e, n = YILAN_FALLBACK_BBOX
    return box(w, s, e, n)

def decode_csv(content: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "cp950", "big5"):
        try:
            return content.decode(enc)
        except UnicodeDecodeError:
            pass
    return content.decode("utf-8", errors="replace")

def find_column(columns, candidates):
    normalized = {str(c).strip().lower(): c for c in columns}
    for cand in candidates:
        if cand.lower() in normalized:
            return normalized[cand.lower()]
    for c in columns:
        lc = str(c).strip().lower()
        if any(cand.lower() in lc for cand in candidates):
            return c
    return None

def fetch_flood_points(boundary_wgs84):
    r = session.get(FLOOD_CSV_URL, timeout=90)
    r.raise_for_status()
    text = decode_csv(r.content)
    df = pd.read_csv(io.StringIO(text))
    if len(df.columns) < 4:
        raise RuntimeError("Flood CSV did not contain the expected coordinate fields.")

    year_col = find_column(df.columns, ["year", "年份", "年度"])
    x_col = find_column(df.columns, ["x_97", "x97", "twd97_x", "x"])
    y_col = find_column(df.columns, ["y_97", "y97", "twd97_y", "y"])
    source_col = find_column(df.columns, ["source", "資料來源", "來源"])
    fid_col = find_column(df.columns, ["fid", "id"])

    if year_col is None or x_col is None or y_col is None:
        # Official resource documents the first four fields as FID, year, X_97, Y_97.
        cols = list(df.columns)
        fid_col, year_col, x_col, y_col = cols[:4]
        source_col = cols[4] if len(cols) > 4 else None

    year = pd.to_numeric(df[year_col], errors="coerce")
    # Be defensive if a future export switches to ROC years.
    year = year.where(year >= 1911, year + 1911)
    xs = pd.to_numeric(df[x_col], errors="coerce")
    ys = pd.to_numeric(df[y_col], errors="coerce")

    boundary_tm2 = transform(to_tm2.transform, boundary_wgs84)
    records = []
    for idx in range(len(df)):
        yr = year.iloc[idx]
        x = xs.iloc[idx]
        y = ys.iloc[idx]
        if not (np.isfinite(yr) and np.isfinite(x) and np.isfinite(y)):
            continue
        yr = int(yr)
        if yr < FLOOD_START_YEAR or yr > FLOOD_END_YEAR:
            continue
        p = Point(float(x), float(y))
        if not (boundary_tm2.contains(p) or boundary_tm2.touches(p)):
            continue
        lon, lat = to_wgs84.transform(float(x), float(y))
        records.append(
            {
                "point_tm2": p,
                "point_wgs84": Point(lon, lat),
                "year": yr,
                "source": (
                    str(df.iloc[idx][source_col]).strip()
                    if source_col is not None and pd.notna(df.iloc[idx][source_col])
                    else ""
                ),
                "fid": (
                    str(df.iloc[idx][fid_col]).strip()
                    if fid_col is not None and pd.notna(df.iloc[idx][fid_col])
                    else str(idx)
                ),
            }
        )
    if not records:
        raise RuntimeError("No 2021-2025 flood points were found inside Yilan County.")
    log(f"Official 2021-2025 flood points in Yilan: {len(records)}")
    return records

def fetch_roads(boundary_wgs84):
    west, south, east, north = boundary_wgs84.bounds
    highway_re = (
        "motorway|motorway_link|trunk|trunk_link|primary|primary_link|"
        "secondary|secondary_link|tertiary|tertiary_link|"
        "unclassified|residential|living_street"
    )
    query = f"""
[out:json][timeout:180];
(
  way["highway"~"^({highway_re})$"]({south},{west},{north},{east});
);
out tags geom qt;
"""
    last_err = None
    data = None
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            log(f"Fetching roads from {endpoint} ...")
            rr = session.post(endpoint, data={"data": query}, timeout=240)
            rr.raise_for_status()
            data = rr.json()
            break
        except Exception as e:
            last_err = e
            log(f"Overpass endpoint failed: {e}")
            time.sleep(3)
    if data is None:
        raise RuntimeError(f"All Overpass endpoints failed: {last_err}")

    boundary_tm2 = transform(to_tm2.transform, boundary_wgs84)
    roads = []
    for el in data.get("elements", []):
        if el.get("type") != "way" or not el.get("geometry"):
            continue
        coords = [(float(p["lon"]), float(p["lat"])) for p in el["geometry"]]
        if len(coords) < 2:
            continue
        geom_wgs = LineString(coords)
        geom_tm2 = transform(to_tm2.transform, geom_wgs)
        if geom_tm2.is_empty or not geom_tm2.intersects(boundary_tm2):
            continue
        clipped = geom_tm2.intersection(boundary_tm2)
        if clipped.is_empty:
            continue
        tags = el.get("tags", {})
        roads.append(
            {
                "osm_id": str(el.get("id", "")),
                "name": tags.get("name") or tags.get("name:zh") or tags.get("ref") or "",
                "ref": tags.get("ref", ""),
                "highway": tags.get("highway", ""),
                "geometry_tm2": clipped,
            }
        )
    if not roads:
        raise RuntimeError("No OSM roads were returned for Yilan County.")
    log(f"OSM road ways retained in Yilan: {len(roads)}")
    return roads

def fetch_sewers(boundary_wgs84):
    west, south, east, north = boundary_wgs84.bounds
    all_features = []

    def paged_query(where: str, use_bbox: bool):
        feats = []
        offset = 0
        while True:
            params = {
                "where": where,
                "outFields": "*",
                "returnGeometry": "true",
                "outSR": "4326",
                "f": "geojson",
                "resultOffset": offset,
                "resultRecordCount": 2000,
            }
            if use_bbox:
                params.update(
                    {
                        "geometry": f"{west},{south},{east},{north}",
                        "geometryType": "esriGeometryEnvelope",
                        "inSR": "4326",
                        "spatialRel": "esriSpatialRelIntersects",
                    }
                )
            data = get_json(SEWER_QUERY_URL, params=params, timeout=120)
            batch = data.get("features", [])
            feats.extend(batch)
            if len(batch) < 2000:
                break
            offset += len(batch)
            if offset > 100000:
                break
        return feats

    # First use the official county id. If this deployment encodes it differently,
    # fall back to a spatial envelope query.
    try:
        all_features = paged_query(f"city_id='{YILAN_CITY_ID}'", False)
    except Exception as e:
        log(f"County-id sewer query failed: {e}")

    if not all_features:
        log("No sewer rows returned by city_id; falling back to bbox query.")
        all_features = paged_query("1=1", True)

    boundary_tm2 = transform(to_tm2.transform, boundary_wgs84)
    sewers = []
    for feat in all_features:
        try:
            gw = shape(feat["geometry"])
        except Exception:
            continue
        if gw.is_empty:
            continue
        gt = transform(to_tm2.transform, gw)
        if gt.is_empty or not gt.intersects(boundary_tm2):
            continue
        gt = gt.intersection(boundary_tm2)
        if gt.is_empty:
            continue
        sewers.append(
            {
                "geometry_tm2": gt,
                "properties": feat.get("properties", {}),
            }
        )
    if not sewers:
        raise RuntimeError("No storm-sewer geometries were found in Yilan County.")
    log(f"Storm-sewer line features retained in Yilan: {len(sewers)}")
    return sewers

def line_parts(geom):
    if geom.is_empty:
        return []
    if isinstance(geom, LineString):
        return [geom]
    if isinstance(geom, MultiLineString):
        return [g for g in geom.geoms if not g.is_empty]
    if isinstance(geom, GeometryCollection):
        out = []
        for g in geom.geoms:
            out.extend(line_parts(g))
        return out
    return []

_tile_cache: dict[tuple[int, int, int], Image.Image] = {}

def terrain_pixel(lon: float, lat: float, z: int = DEM_ZOOM):
    lat = max(min(lat, 85.05112878), -85.05112878)
    n = 2 ** z
    x_float = (lon + 180.0) / 360.0 * n
    lat_rad = math.radians(lat)
    y_float = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n
    x = int(math.floor(x_float))
    y = int(math.floor(y_float))
    px = int(min(255, max(0, math.floor((x_float - x) * 256))))
    py = int(min(255, max(0, math.floor((y_float - y) * 256))))
    return x, y, px, py

def elevation_at_lonlat(lon: float, lat: float) -> float:
    x, y, px, py = terrain_pixel(lon, lat)
    key = (DEM_ZOOM, x, y)
    img = _tile_cache.get(key)
    if img is None:
        url = DEM_URL.format(z=DEM_ZOOM, x=x, y=y)
        rr = session.get(url, timeout=45)
        rr.raise_for_status()
        img = Image.open(io.BytesIO(rr.content)).convert("RGB")
        _tile_cache[key] = img
    r, g, b = img.getpixel((px, py))
    return float(r * 256 + g + b / 256.0 - 32768.0)

def local_low_metrics(point_tm2: Point):
    cx, cy = point_tm2.x, point_tm2.y
    lon, lat = to_wgs84.transform(cx, cy)
    center = elevation_at_lonlat(lon, lat)
    neighbors = []
    for radius, count in ((250.0, 8), (500.0, 16)):
        for i in range(count):
            a = 2 * math.pi * i / count
            x = cx + radius * math.cos(a)
            y = cy + radius * math.sin(a)
            lo, la = to_wgs84.transform(x, y)
            neighbors.append(elevation_at_lonlat(lo, la))
    arr = np.asarray(neighbors, dtype=float)
    less = float(np.sum(arr < center - 0.05))
    equal = float(np.sum(np.abs(arr - center) <= 0.05))
    percentile = 100.0 * (less + 0.5 * equal) / max(1, len(arr))
    median = float(np.median(arr))
    depression = median - center
    low = percentile <= LOW_PERCENTILE_MAX or center <= ABS_LOW_ELEVATION_M
    return center, percentile, median, depression, low

def nearest_flood_metrics(seg, flood_records):
    distances = [(seg.distance(rec["point_tm2"]), rec) for rec in flood_records]
    distances.sort(key=lambda x: x[0])
    near = [(d, rec) for d, rec in distances if d <= FLOOD_BUFFER_M + 1e-6]
    nearest_d, nearest_rec = distances[0]
    return {
        "nearest_m": float(nearest_d),
        "count": len(near),
        "years": sorted({rec["year"] for _, rec in near}),
        "sources": sorted({rec["source"] for _, rec in near if rec["source"]}),
        "nearest_year": nearest_rec["year"],
        "nearest_fid": nearest_rec["fid"],
    }

def risk_score(flood_count, flood_years, elevation, percentile, sewer_dist):
    flood = min(40.0, 20.0 + 4.0 * max(0, flood_count - 1) + 6.0 * max(0, flood_years - 1))
    if elevation <= ABS_LOW_ELEVATION_M:
        low = 30.0
    else:
        low = max(10.0, 30.0 * (1.0 - min(LOW_PERCENTILE_MAX, percentile) / LOW_PERCENTILE_MAX))
    sewer = max(0.0, 30.0 * (1.0 - min(SEWER_DISTANCE_M, sewer_dist) / SEWER_DISTANCE_M))
    return round(min(100.0, flood + low + sewer), 1)

def make_feature(geom_tm2, props):
    geom_wgs = transform(to_wgs84.transform, geom_tm2)
    return {"type": "Feature", "geometry": mapping(geom_wgs), "properties": props}

def feature_collection(features, **meta):
    out = {"type": "FeatureCollection", "features": features}
    if meta:
        out["metadata"] = meta
    return out

def write_json(path: Path, obj: Any):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

def main():
    generated = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    boundary_wgs = fetch_boundary()
    flood_records = fetch_flood_points(boundary_wgs)
    roads = fetch_roads(boundary_wgs)
    sewers = fetch_sewers(boundary_wgs)

    flood_union = unary_union([r["point_tm2"].buffer(FLOOD_BUFFER_M) for r in flood_records])
    sewer_union = unary_union([s["geometry_tm2"] for s in sewers])

    candidates = []
    for road in roads:
        intersected = road["geometry_tm2"].intersection(flood_union)
        for seg in line_parts(intersected):
            if seg.length < 5.0:
                continue
            sd = float(seg.distance(sewer_union))
            if sd > SEWER_DISTANCE_M:
                continue
            candidates.append((road, seg, sd))
    log(f"Road segments meeting flood<=100m and sewer<=30m before DEM test: {len(candidates)}")

    results = []
    dem_failures = 0
    for idx, (road, seg, sewer_dist) in enumerate(candidates, start=1):
        p = seg.interpolate(0.5, normalized=True)
        try:
            elev, pct, neigh_med, depression, low = local_low_metrics(p)
        except Exception as e:
            dem_failures += 1
            log(f"DEM sample failed for candidate {idx}: {e}")
            continue
        if not low:
            continue
        fm = nearest_flood_metrics(seg, flood_records)
        score = risk_score(fm["count"], len(fm["years"]), elev, pct, sewer_dist)
        if score >= 70:
            level = "高"
        elif score >= 55:
            level = "中"
        else:
            level = "注意"
        props = {
            "道路名稱": road["name"] or f"OSM道路 {road['osm_id']}",
            "道路編號": road["ref"],
            "道路類型": road["highway"],
            "OSM_way_id": road["osm_id"],
            "分析路段長度_m": round(float(seg.length), 1),
            "最近淹水點距離_m": round(fm["nearest_m"], 1),
            "100m內淹水點數": int(fm["count"]),
            "淹水年份": "、".join(str(y) for y in fm["years"]),
            "淹水年份數": len(fm["years"]),
            "最近淹水資料年份": int(fm["nearest_year"]),
            "最近淹水FID": fm["nearest_fid"],
            "淹水資料來源": "；".join(fm["sources"][:6]),
            "最近雨水下水道距離_m": round(sewer_dist, 1),
            "DEM高程_m": round(elev, 2),
            "局部高程百分位_pct": round(pct, 1),
            "周邊500m高程中位數_m": round(neigh_med, 2),
            "相對低窪深度_m": round(depression, 2),
            "低窪判定": (
                f"高程≤{ABS_LOW_ELEVATION_M:g}m"
                if elev <= ABS_LOW_ELEVATION_M
                else f"局部高程百分位≤{LOW_PERCENTILE_MAX:g}%"
            ),
            "風險分數": score,
            "風險等級": level,
            "分析條件": (
                f"淹水點≤{FLOOD_BUFFER_M:g}m；雨水下水道≤{SEWER_DISTANCE_M:g}m；"
                f"局部高程百分位≤{LOW_PERCENTILE_MAX:g}%或高程≤{ABS_LOW_ELEVATION_M:g}m"
            ),
        }
        results.append({"road": road, "seg": seg, "props": props})

    if not results:
        raise RuntimeError(
            "Analysis completed but found zero road segments meeting all criteria. "
            "Review thresholds or source coverage."
        )

    log(f"Final low-lying risk road segments: {len(results)} (DEM failures: {dem_failures})")

    # Prepare contextual sewer lines and flood points near final results.
    risk_union = unary_union([r["seg"] for r in results])
    context_zone = risk_union.buffer(120.0)

    sewer_features = []
    for s in sewers:
        if not s["geometry_tm2"].intersects(context_zone):
            continue
        clipped = s["geometry_tm2"].intersection(context_zone)
        for part in line_parts(clipped):
            if part.length < 2:
                continue
            pr = s["properties"]
            sewer_features.append(
                make_feature(
                    part,
                    {
                        "管線類別": pr.get("ssew_cat"),
                        "管線編號": pr.get("pi_num"),
                        "管型": pr.get("pi_typ"),
                        "管寬": pr.get("pi_widt"),
                        "管高": pr.get("pi_hei"),
                        "管長": pr.get("pi_leng"),
                        "材質": pr.get("pi_mat"),
                        "坡度": pr.get("pi_slop"),
                        "設計流量": pr.get("des_flow"),
                        "CITY_ID": pr.get("city_id"),
                        "TOWN_ID": pr.get("town_id"),
                    },
                )
            )

    flood_features = []
    for rec in flood_records:
        if rec["point_tm2"].distance(risk_union) <= 150.0:
            flood_features.append(
                make_feature(
                    rec["point_tm2"],
                    {
                        "FID": rec["fid"],
                        "年份": rec["year"],
                        "資料來源": rec["source"],
                    },
                )
            )

    risk_features = [make_feature(r["seg"], r["props"]) for r in results]
    boundary_feature = {
        "type": "Feature",
        "geometry": mapping(boundary_wgs),
        "properties": {"名稱": "宜蘭縣"},
    }

    metadata_common = {
        "generatedAt": generated,
        "analysisPeriod": f"{FLOOD_START_YEAR}-{FLOOD_END_YEAR}",
        "floodDistanceMeters": FLOOD_BUFFER_M,
        "sewerDistanceMeters": SEWER_DISTANCE_M,
        "lowLyingRule": (
            f"DEM local percentile <= {LOW_PERCENTILE_MAX}% OR elevation <= {ABS_LOW_ELEVATION_M} m"
        ),
        "floodSource": "國科會/國家災害防救科技中心「近5年淹水災點資料」",
        "floodSourceUrl": "https://data.gov.tw/dataset/130016",
        "sewerSource": "內政部國土管理署雨水下水道圖資（公開 ArcGIS Feature Layer 鏡像）",
        "sewerSourceUrl": (
            "https://gis.liquid.net.tw/arcgis/rest/services/Hosted/"
            "%E9%9B%A8%E6%B0%B4%E4%B8%8B%E6%B0%B4%E9%81%93%E6%B8%85%E6%B7%A4%E7%B4%80%E9%8C%84/"
            "FeatureServer/13"
        ),
        "roadSource": "OpenStreetMap via Overpass API",
        "demSource": "AWS Open Data Terrain Tiles (Terrarium)",
        "note": (
            "官方近5年淹水災點目前資料內容更新至2025年；2026年當年度尚未完整納入。"
            "本成果為篩選用空間分析，不取代主管機關認定、現勘或工程設計。"
        ),
    }

    risk_fc = feature_collection(risk_features, **metadata_common)
    flood_fc = feature_collection(flood_features, **metadata_common)
    sewer_fc = feature_collection(sewer_features, **metadata_common)
    boundary_fc = feature_collection([boundary_feature], generatedAt=generated)

    write_json(OUT / "yilan-flood-risk-roads.geojson", risk_fc)
    write_json(OUT / "yilan-flood-points-2021-2025.geojson", flood_fc)
    write_json(OUT / "yilan-storm-sewers-near-risk.geojson", sewer_fc)
    write_json(OUT / "yilan-county-boundary.geojson", boundary_fc)

    road_names = [r["props"]["道路名稱"] for r in results]
    total_km = sum(float(r["seg"].length) for r in results) / 1000.0
    levels = Counter(r["props"]["風險等級"] for r in results)
    summary = {
        **metadata_common,
        "officialFloodPointCountYilan": len(flood_records),
        "roadWayCountScreened": len(roads),
        "stormSewerFeatureCountYilan": len(sewers),
        "preDemCandidateSegmentCount": len(candidates),
        "finalRiskSegmentCount": len(results),
        "uniqueRoadCount": len(set(road_names)),
        "totalRiskSegmentLengthKm": round(total_km, 3),
        "riskLevels": dict(levels),
        "demTileCountFetched": len(_tile_cache),
        "demFailures": dem_failures,
    }
    write_json(OUT / "yilan-flood-risk-summary.json", summary)

    # CSV for audit/review.
    csv_path = OUT / "yilan-flood-risk-roads.csv"
    fieldnames = list(results[0]["props"].keys())
    with csv_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in sorted(results, key=lambda x: (-x["props"]["風險分數"], x["props"]["道路名稱"])):
            writer.writerow(r["props"])

    # A compact human-readable report.
    top = sorted(results, key=lambda x: -x["props"]["風險分數"])[:30]
    md = [
        "# 宜蘭縣近5年淹水 × 低窪 × 雨水下水道道路分析",
        "",
        f"- 產製時間：{generated}",
        f"- 淹水資料期間：{FLOOD_START_YEAR}–{FLOOD_END_YEAR}",
        f"- 宜蘭縣官方淹水點：{len(flood_records)} 點",
        f"- 篩選道路：{len(roads)} 條 OSM way",
        f"- 宜蘭縣雨水下水道：{len(sewers)} 筆",
        f"- 同時符合淹水≤100m、下水道≤30m：{len(candidates)} 個候選路段",
        f"- 再通過低窪判定：**{len(results)} 個風險路段**",
        f"- 涉及道路名稱：{len(set(road_names))} 條",
        f"- 風險路段總長：約 {total_km:.2f} km",
        "",
        "## 低窪判定",
        "",
        f"- DEM 局部高程百分位 ≤ {LOW_PERCENTILE_MAX:.0f}%，或",
        f"- 絕對高程 ≤ {ABS_LOW_ELEVATION_M:.0f} m。",
        "",
        "> 本成果為查核/規劃的篩選參考。官方近5年淹水災點目前內容更新至2025年，2026年度尚未完整納入；正式工程與防災判定仍應以主管機關最新資料、現勘與設計成果為準。",
        "",
        "## 風險分數較高的路段（前30筆）",
        "",
        "| 道路 | 分數 | 等級 | 淹水點數 | 淹水年份 | 下水道距離(m) | DEM高程(m) | 局部百分位(%) |",
        "|---|---:|---|---:|---|---:|---:|---:|",
    ]
    for r in top:
        p = r["props"]
        md.append(
            f"| {p['道路名稱']} | {p['風險分數']} | {p['風險等級']} | "
            f"{p['100m內淹水點數']} | {p['淹水年份']} | "
            f"{p['最近雨水下水道距離_m']} | {p['DEM高程_m']} | "
            f"{p['局部高程百分位_pct']} |"
        )
    (OUT / "yilan-flood-risk-report.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    # GeoLibre project with the analyzed result already visible.
    project = {
        "version": "0.2.0",
        "name": "宜蘭縣近5年淹水－低窪－雨水下水道風險道路",
        "mapView": {"center": [121.72, 24.68], "zoom": 10.0, "bearing": 0, "pitch": 0},
        "basemapStyleUrl": "https://tiles.openfreemap.org/styles/liberty",
        "basemapVisible": True,
        "basemapOpacity": 1,
        "blankBackgroundColor": None,
        "layers": [
            {
                "id": "yilan-boundary",
                "name": "宜蘭縣界",
                "type": "geojson",
                "source": {"type": "geojson"},
                "visible": True,
                "opacity": 1,
                "style": {
                    "fillColor": "#ffffff",
                    "fillOpacity": 0.01,
                    "strokeColor": "#334155",
                    "strokeWidth": 2,
                },
                "geojson": boundary_fc,
            },
            {
                "id": "yilan-storm-sewers-near-risk",
                "name": "風險路段附近雨水下水道",
                "type": "geojson",
                "source": {"type": "geojson"},
                "visible": True,
                "opacity": 0.7,
                "style": {
                    "strokeColor": "#0891b2",
                    "strokeWidth": 2,
                },
                "geojson": sewer_fc,
                "metadata": metadata_common,
            },
            {
                "id": "yilan-flood-points-2021-2025",
                "name": "2021–2025 淹水災點（風險路段周邊）",
                "type": "geojson",
                "source": {"type": "geojson"},
                "visible": True,
                "opacity": 0.9,
                "style": {
                    "fillColor": "#2563eb",
                    "fillOpacity": 0.9,
                    "strokeColor": "#ffffff",
                    "strokeWidth": 1,
                    "circleRadius": 5,
                },
                "geojson": flood_fc,
                "metadata": metadata_common,
            },
            {
                "id": "yilan-flood-risk-roads",
                "name": "分析結果：淹水×低窪×下水道風險道路",
                "type": "geojson",
                "source": {"type": "geojson"},
                "visible": True,
                "opacity": 1,
                "style": {
                    "strokeColor": "#dc2626",
                    "strokeWidth": 6,
                },
                "geojson": risk_fc,
                "metadata": {
                    **metadata_common,
                    "finalRiskSegmentCount": len(results),
                    "uniqueRoadCount": len(set(road_names)),
                    "totalRiskSegmentLengthKm": round(total_km, 3),
                    "csvUrl": (
                        "https://ymguan3-boop.github.io/good-open-source-collection/"
                        "GeoLibre-Web/yilan-flood-risk-roads.csv"
                    ),
                    "reportUrl": (
                        "https://ymguan3-boop.github.io/good-open-source-collection/"
                        "GeoLibre-Web/yilan-flood-risk-report.md"
                    ),
                },
            },
        ],
        "layerGroups": [],
        "styles": {},
        "preferences": {},
        "legend": {},
        "comments": [],
        "metadata": {
            **summary,
            "description": "宜蘭縣道路淹水複合條件空間篩選成果。",
            "analysisRole": "SCREENING_REFERENCE",
        },
        "selectedLayerId": "yilan-flood-risk-roads",
    }
    write_json(OUT / "yilan-flood-risk.geolibre.json", project)
    log("Outputs written successfully.")
    log(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
