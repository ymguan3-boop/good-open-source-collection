from __future__ import annotations

import io
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import pandas as pd
import requests
from shapely.geometry import Point, mapping, shape


ROOT = Path.cwd()
INPUTS = ROOT / "GeoLibre-Web" / "analysis-inputs"
SCOPE_PATH = INPUTS / "yilan-county-scope.geojson"
HOTSPOT_URL = "https://itaiwan.gov.tw/ITaiwanDW/GetFile?fileName=hotspotlist_tw.csv&type=6"
MEDICAL_PATH = INPUTS / "yilan-official-medical.geojson"
GOVERNMENT_PATH = INPUTS / "yilan-government-hotspot-proxies.geojson"
API = "https://api.nlsc.gov.tw/other/MarkBufferAnlys/med/{lon:.6f}/{lat:.6f}/5000"
GRID_METRES = 7000
RADIUS_METRES = 5000
GOVERNMENT_NAME = re.compile(
    r"縣政府|市公所|鎮公所|鄉公所|地政事務所|戶政事務所|衛生局|環境保護局|稅務局|警察局|消防局|監理站|國稅局|區公所|分局|派出所|衛生所|服務站"
)


def write_geojson(path: Path, records: list[dict], metadata: dict) -> None:
    features = []
    for record in records:
        properties = dict(record)
        lon, lat = properties.pop("longitude"), properties.pop("latitude")
        features.append({"type": "Feature", "geometry": mapping(Point(lon, lat)), "properties": properties})
    path.write_text(
        json.dumps({"type": "FeatureCollection", "features": features, "metadata": metadata}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def grid_points(scope) -> list[tuple[float, float]]:
    buffered = scope.buffer(RADIUS_METRES)
    x1, y1, x2, y2 = scope.bounds
    centres = []
    x = int(x1)
    while x <= x2 + GRID_METRES:
        y = int(y1)
        while y <= y2 + GRID_METRES:
            point = Point(x, y)
            if buffered.intersects(point):
                centre = gpd.GeoSeries([point], crs="EPSG:3826").to_crs("EPSG:4326").iloc[0]
                centres.append((centre.x, centre.y))
            y += GRID_METRES
        x += GRID_METRES
    return centres


def get_medical(centre: tuple[float, float]) -> list[dict]:
    url = API.format(lon=centre[0], lat=centre[1])
    error = None
    for _ in range(3):
        try:
            response = requests.get(url, timeout=25, headers={"User-Agent": "GeoLibre-analysis/1.0"})
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, list):
                raise RuntimeError(f"unexpected response type: {type(data)}")
            return data
        except Exception as exc:
            error = exc
    raise RuntimeError(f"NLSC API failed for {centre}: {error}")


def main() -> None:
    scope_payload = json.loads(SCOPE_PATH.read_text(encoding="utf-8"))
    scope = gpd.GeoSeries([shape(scope_payload["features"][0]["geometry"])], crs="EPSG:4326").to_crs("EPSG:3826").iloc[0]
    if "--government-only" not in sys.argv:
        centres = grid_points(scope)
        print(f"medical_grid_queries={len(centres)}", flush=True)
        observed = {}
        with ThreadPoolExecutor(max_workers=5) as pool:
            futures = [pool.submit(get_medical, centre) for centre in centres]
            for completed, future in enumerate(as_completed(futures), 1):
                for item in future.result():
                    identifier = str(item.get("id", ""))
                    if identifier:
                        observed[identifier] = item
                if completed % 20 == 0:
                    print(f"medical_queries_completed={completed}", flush=True)
        medical = []
        marktypes = {}
        for identifier, item in sorted(observed.items()):
            marktype = str(item.get("marktype", ""))
            marktypes[marktype] = marktypes.get(marktype, 0) + 1
            if marktype not in {"9930101", "9930102"}:
                continue
            lon, lat = float(item["lon"]), float(item["lat"])
            geom = gpd.GeoSeries([Point(lon, lat)], crs="EPSG:4326").to_crs("EPSG:3826").iloc[0]
            if not scope.buffer(1).covers(geom):
                continue
            medical.append({
                "facility_id": f"NLSC-MED-{identifier}",
                "facility_name": item.get("name", ""),
                "facility_type": "醫療機構",
                "facility_source": "內政部國土測繪中心醫療設施 API（官方）",
                "source_record_id": identifier,
                "source_date": datetime.now(timezone.utc).date().isoformat(),
                "admin_area": "宜蘭縣",
                "medical_marktype": marktype,
                "address": item.get("addr", ""),
                "longitude": lon,
                "latitude": lat,
            })
        write_geojson(MEDICAL_PATH, medical, {
            "dataset_url": "https://data.gov.tw/dataset/139250",
            "api": "https://api.nlsc.gov.tw/other/MarkBufferAnlys/med",
            "grid_spacing_m": GRID_METRES,
            "query_radius_m": RADIUS_METRES,
            "query_count": len(centres),
            "queried_at_utc": datetime.now(timezone.utc).isoformat(),
            "marktypes_observed": marktypes,
            "included_marktypes": {"9930101": "醫院", "9930102": "衛生所"},
            "limitation": "API 未提供診所完整名冊；僅納入經名稱核對為醫院與衛生所的兩類地標。",
        })
        print(f"medical_records={len(medical)} marktypes={marktypes}", flush=True)

    hotspot_response = requests.get(HOTSPOT_URL, timeout=60, headers={"User-Agent": "GeoLibre-analysis/1.0"})
    hotspot_response.raise_for_status()
    hotspots = pd.read_csv(io.BytesIO(hotspot_response.content), encoding="utf-8-sig")
    hotspots = hotspots[hotspots["Area"].astype(str).str.contains("宜蘭")].copy()
    hotspots = hotspots[hotspots["Name"].astype(str).str.contains(GOVERNMENT_NAME)].copy()
    hotspots = hotspots[~hotspots["Name"].astype(str).str.contains(r"衛生所|衛生室|幼兒園|郵局|圖書館|遊憩區")].copy()
    hotspots["Latitude"] = pd.to_numeric(hotspots["Latitude"], errors="coerce")
    hotspots["Longitude"] = pd.to_numeric(hotspots["Longitude"], errors="coerce")
    hotspots = hotspots.dropna(subset=["Latitude", "Longitude"])
    hotspots["site_key"] = hotspots.apply(lambda row: (round(float(row["Latitude"]), 4), round(float(row["Longitude"]), 4)), axis=1)
    hotspots["site_name"] = hotspots["Name"].astype(str).str.split(r"[-－]", n=1, regex=True).str[0]
    hotspots["name_length"] = hotspots["site_name"].str.len()
    hotspots = hotspots.sort_values(["name_length", "Name"]).drop_duplicates(subset=["site_key"])
    government = []
    accepted_sites: list[tuple[str, Point]] = []
    for index, item in hotspots.iterrows():
        lon, lat = float(item["Longitude"]), float(item["Latitude"])
        geom = gpd.GeoSeries([Point(lon, lat)], crs="EPSG:4326").to_crs("EPSG:3826").iloc[0]
        if not scope.buffer(1).covers(geom):
            continue
        site_name = str(item["site_name"])
        if any(site_name == prior_name and geom.distance(prior_geom) <= 100 for prior_name, prior_geom in accepted_sites):
            continue
        accepted_sites.append((site_name, geom))
        government.append({
            "facility_id": f"ITAIWAN-{index}",
            "facility_name": site_name,
            "facility_type": "政府機關",
            "facility_source": "數位發展部 iTaiwan 熱點（政府機關位置代理點）",
            "source_record_id": str(index),
            "source_date": "2025-11-06",
            "admin_area": "宜蘭縣",
            "agency": str(item["Agency"]),
            "hotspot_name": str(item["Name"]),
            "address": str(item["Address"]),
            "longitude": lon,
            "latitude": lat,
        })
    write_geojson(GOVERNMENT_PATH, government, {
        "dataset_url": "https://data.gov.tw/dataset/5962",
        "download_url": "https://itaiwan.gov.tw/ITaiwanDW/GetFile?fileName=hotspotlist_tw.csv&type=6",
        "filter": GOVERNMENT_NAME.pattern,
        "queried_at_utc": datetime.now(timezone.utc).isoformat(),
        "limitation": "熱點位置僅可當政府機關位置代理點；以約10公尺精度座標聚合相同場址，可能合併同址不同機關；僅涵蓋設有 iTaiwan 熱點且名稱符合條件的機關，不是政府機關完整名冊。",
    })
    print(f"government_proxy_records={len(government)}", flush=True)


if __name__ == "__main__":
    main()

