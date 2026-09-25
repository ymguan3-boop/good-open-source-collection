from __future__ import annotations

import csv
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
import requests
from shapely.geometry import Point, Polygon, mapping, shape
from shapely.ops import unary_union


TASK_ID = "yilan-public-facility-hazard-exposure-2026-09"
ANALYSIS_CRS = "EPSG:3826"
WEB_CRS = "EPSG:4326"
BUFFER_M = 300
COUNTY = "宜蘭縣"
PAGES_ROOT = "https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/"
USER_AGENT = "GeoLibre-analysis/yilan-public-facility-hazard-exposure-2026-09 (+https://github.com/ymguan3-boop/good-open-source-collection)"

URLS = {
    "county_boundary_dataset": "https://data.gov.tw/dataset/7442",
    "county_boundary_download": "https://www.tgos.tw/tgos/VirtualDir/Product/1cd4f4c9-6b01-4cf9-bf6c-23a73aa17d24/%E7%9B%B4%E8%BD%84%E5%B8%82%E3%80%81%E7%B8%A3%28%E5%B8%82%29%E7%95%8C%E7%B7%9A1140318.zip",
    "county_boundary_arcgis_query": "https://dwgis1.ncdr.nat.gov.tw/server/rest/services/MAP0751/Coastline2025/MapServer/35/query",
    "school_dataset": "https://data.gov.tw/dataset/174606",
    "school_download": "https://www.tgos.tw/tgos/VirtualDir/Product/5f346c6b-edde-4fe7-8685-5585c0fb7852/%E5%90%84%E7%B4%9A%E5%AD%B8%E6%A0%A1%E7%AF%84%E5%9C%8D%E5%9C%96_121_1150409.zip",
    "fire_dataset": "https://data.gov.tw/dataset/5969",
    "fire_download": "https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/57F3DD1D-A40E-49A6-8410-57303B2FF87E/resource/C38B7AC2-E7F3-4DD5-A3F3-88E623B55924/download",
    "flood_dataset": "https://data.gov.tw/dataset/130016",
    "flood_download": "https://mas.nstc.gov.tw/OPENDATA/GetFile?fileodr=1&format=csv&serialno=455",
    "debris_dataset": "https://data.gov.tw/dataset/176526",
    "debris_download": "https://data.moa.gov.tw/OpenData/GetOpenDataFile.aspx?FileType=SHP&RID=71085&id=J73",
    "geology_dataset": "https://data.gov.tw/dataset/27744",
    "geology_index": "https://www.gsmma.gov.tw/uploads/1719480931378tHI9XTJa.csv",
    "osm_overpass": "https://overpass-api.de/api/interpreter",
}

OVERPASS_ENDPOINTS = [
    URLS["osm_overpass"],
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

OSM_QUERY = """[out:json][timeout:180];
area["name"="宜蘭縣"]["boundary"="administrative"]["admin_level"="6"]->.a;
(
  nwr["amenity"~"school|college|university|kindergarten|hospital|clinic|fire_station|townhall"](area.a);
  nwr["office"="government"](area.a);
);
out center tags;"""


def now_utc() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def first_existing(columns: list[str], candidates: list[str]) -> str | None:
    for candidate in candidates:
        if candidate in columns:
            return candidate
    return None


def download_bytes(url: str, session: requests.Session, timeout: int = 180) -> bytes:
    response = session.get(url, timeout=timeout, headers={"User-Agent": USER_AGENT})
    response.raise_for_status()
    return response.content


def decode_text(payload: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp950", "big5", "big5hkscs", "latin1"):
        try:
            return payload.decode(encoding)
        except UnicodeDecodeError:
            continue
    return payload.decode("utf-8", errors="replace")


def extract_archive(payload: bytes, filename: str, root: Path) -> Path:
    archive = root / filename
    archive.write_bytes(payload)
    extracted = root / f"{archive.stem}-extracted"
    extracted.mkdir(parents=True, exist_ok=True)
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as zf:
            zf.extractall(extracted)
        return extracted
    signature = archive.read_bytes()[:8]
    unrar = shutil.which("unrar")
    if signature.startswith(b"Rar!") and unrar:
        attempt = subprocess.run([unrar, "x", "-o+", str(archive), str(extracted)], capture_output=True, text=True)
        if attempt.returncode == 0:
            return extracted
    unar = shutil.which("unar")
    if signature.startswith(b"Rar!") and unar:
        attempt = subprocess.run([unar, "-f", "-o", str(extracted), str(archive)], capture_output=True, text=True)
        if attempt.returncode == 0:
            return extracted
    seven_zip = shutil.which("7z") or shutil.which("7zz")
    if not seven_zip:
        raise RuntimeError(f"需要 7z 解壓縮官方 GIS 壓縮檔，但執行環境未提供：{filename}")
    subprocess.run([seven_zip, "x", str(archive), f"-o{extracted}", "-y"], check=True, capture_output=True)
    return extracted


def read_shape(path: Path, crs: str | None = None) -> gpd.GeoDataFrame:
    last_error: Exception | None = None
    for encoding in ("utf-8", "cp950", "big5", "big5hkscs", "latin1"):
        try:
            frame = gpd.read_file(path, encoding=encoding)
            if frame.crs is None and crs:
                frame = frame.set_crs(crs, allow_override=True)
            elif frame.crs is None:
                raise ValueError(f"缺少 CRS：{path}")
            frame = frame[frame.geometry.notna() & ~frame.geometry.is_empty].copy()
            invalid = ~frame.geometry.is_valid
            if invalid.any():
                frame.loc[invalid, "geometry"] = frame.loc[invalid, "geometry"].make_valid()
            return frame
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"無法讀取 SHP：{path}; {last_error}")


def official_crs(row: dict[str, Any]) -> str:
    meridian = str(row.get("座標系統1", ""))
    datum = str(row.get("座標系統2", ""))
    if "119" in meridian:
        return "EPSG:3827" if datum == "TWD67" else "EPSG:3825"
    return "EPSG:3828" if datum == "TWD67" else "EPSG:3826"


def scope_from_official_boundary(session: requests.Session, temp: Path, substitutions: list[str]) -> tuple[Any, dict[str, Any]]:
    try:
        extracted = extract_archive(
            download_bytes(URLS["county_boundary_download"], session),
            "nlsc-county-boundary.zip",
            temp,
        )
        paths = list(extracted.rglob("*.shp"))
        if not paths:
            raise RuntimeError("官方縣市界線 ZIP 未找到 SHP")
        frame = read_shape(paths[0])
        name_col = first_existing(list(frame.columns), ["COUNTYNAME", "縣市名稱", "COUNTY_NA"])
        if not name_col:
            raise RuntimeError("官方縣市界線缺少 COUNTYNAME 欄位")
        selected = frame[frame[name_col].astype(str).str.contains(COUNTY, na=False)]
        if selected.empty:
            raise RuntimeError("官方縣市界線找不到宜蘭縣")
        scope = unary_union(selected.to_crs(ANALYSIS_CRS).geometry)
        return scope, {
            "name": "直轄市、縣市界線(TWD97經緯度)",
            "provider": "內政部國土測繪中心",
            "dataset_url": URLS["county_boundary_dataset"],
            "download_url": URLS["county_boundary_download"],
            "retrieved_at": now_utc(),
            "source_crs": str(frame.crs),
            "analysis_crs": ANALYSIS_CRS,
            "role": "official_scope_boundary",
            "limitation": "行政界線供本次範圍篩選與地圖定位，不代表地籍界址判定。",
        }
    except Exception as exc:
        substitutions.append(f"官方 NLSC 縣市界線下載或解析失敗：{exc}")
        static_scope_path = Path("GeoLibre-Web/analysis-inputs/yilan-county-scope.geojson")
        if static_scope_path.exists():
            payload = json.loads(static_scope_path.read_text(encoding="utf-8"))
            features = payload.get("features", [])
            if features and features[0].get("geometry"):
                substitutions.append("使用已驗證的宜蘭縣範圍快取：由官方 NLSC 鄉鎮市區界線聯集並以約100公尺容差簡化")
                cached_scope = gpd.GeoSeries([shape(features[0]["geometry"])], crs=WEB_CRS).to_crs(ANALYSIS_CRS).iloc[0]
                return cached_scope, {
                    "name": "宜蘭縣縣界（NLSC鄉鎮市區界線衍生快取）",
                    "provider": "內政部國土測繪中心（衍生）",
                    "dataset_url": "https://data.gov.tw/dataset/7441",
                    "download_url": "https://github.com/ymguan3-boop/good-open-source-collection/blob/main/GeoLibre-Web/analysis-inputs/yilan-county-scope.geojson",
                    "retrieved_at": now_utc(),
                    "source_crs": WEB_CRS,
                    "analysis_crs": ANALYSIS_CRS,
                    "role": "derived_scope_boundary_cache",
                    "limitation": "原始 NLSC 鄉鎮市區界線為 EPSG:3826；快取為 EPSG:4326，由宜蘭縣各鄉鎮市區聯集並以約100公尺容差簡化，僅供本次縣級範圍篩選。",
                }
        try:
            response = session.get(
                URLS["county_boundary_arcgis_query"],
                params={"where": "1=1", "outFields": "*", "returnGeometry": "true", "outSR": "3826", "f": "geojson"},
                timeout=180,
                headers={"User-Agent": USER_AGENT},
            )
            response.raise_for_status()
            payload = response.json()
            frame = gpd.GeoDataFrame.from_features(payload.get("features", []), crs=ANALYSIS_CRS)
            name_col = first_existing(list(frame.columns), ["CITYNAME", "CITYNAME2", "縣市名稱"])
            if not name_col:
                raise RuntimeError("NCDR 邊界服務缺少縣市名稱欄位")
            selected = frame[frame[name_col].astype(str).str.contains(COUNTY, na=False)]
            if selected.empty:
                raise RuntimeError("NCDR 邊界服務找不到宜蘭縣")
            return unary_union(selected.geometry), {
                "name": "縣市界線（NCDR ArcGIS REST替代服務）",
                "provider": "國家災害防救科技中心",
                "dataset_url": "https://data.gov.tw/dataset/32158",
                "download_url": URLS["county_boundary_arcgis_query"],
                "retrieved_at": now_utc(),
                "source_crs": ANALYSIS_CRS,
                "analysis_crs": ANALYSIS_CRS,
                "role": "official_scope_boundary_substitute",
                "limitation": "因 NLSC TGOS ZIP 端點回傳403，本次以公開官方 GIS REST 查詢服務取得縣市界線；仍建議以資料集7442正式下載檔複核。",
            }
        except Exception as arcgis_exc:
            substitutions.append(f"NCDR 官方 GIS REST 邊界替代也失敗：{arcgis_exc}")
        query = '[out:json][timeout:180];rel["boundary"="administrative"]["name"="宜蘭縣"]["admin_level"="6"];out geom;'
        last_error: Exception | None = None
        for endpoint in OVERPASS_ENDPOINTS:
            try:
                response = session.post(endpoint, data={"data": query}, timeout=90, headers={"User-Agent": USER_AGENT})
                response.raise_for_status()
                elements = response.json().get("elements", [])
                if not elements:
                    raise RuntimeError("無法取得宜蘭縣 OSM 行政關係")
                geometry = elements[0].get("geometry", [])
                coords = [(p["lon"], p["lat"]) for p in geometry if "lon" in p and "lat" in p]
                if len(coords) < 4:
                    raise RuntimeError("OSM 宜蘭縣行政關係缺少可用邊界座標")
                polygon = Polygon(coords)
                if not polygon.is_valid:
                    polygon = polygon.make_valid()
                substitutions.append(f"使用 OSM 宜蘭縣行政關係作範圍替代：{endpoint}")
                return gpd.GeoSeries([polygon], crs=WEB_CRS).to_crs(ANALYSIS_CRS).iloc[0], {
                    "name": "OpenStreetMap 宜蘭縣行政關係（替代）",
                    "provider": "OpenStreetMap contributors",
                    "dataset_url": "https://www.openstreetmap.org/relation/2386982",
                    "download_url": endpoint,
                    "retrieved_at": now_utc(),
                    "source_crs": WEB_CRS,
                    "analysis_crs": ANALYSIS_CRS,
                    "role": "supplemental_scope_boundary",
                    "limitation": "僅作為官方行政界線與官方 GIS REST 替代均失敗時的範圍替代，應以官方界線複核。",
                }
            except Exception as endpoint_exc:
                last_error = endpoint_exc
        raise RuntimeError(f"所有行政範圍替代端點均失敗：{last_error}")


def build_osm_facilities(session: requests.Session, scope: Any) -> tuple[gpd.GeoDataFrame, dict[str, Any]]:
    last_error: Exception | None = None
    elements: list[dict[str, Any]] = []
    endpoint_used = URLS["osm_overpass"]
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            response = session.post(endpoint, data={"data": OSM_QUERY}, timeout=90, headers={"User-Agent": USER_AGENT})
            response.raise_for_status()
            elements = response.json().get("elements", [])
            if elements:
                endpoint_used = endpoint
                break
            raise RuntimeError("Overpass 未回傳設施元素")
        except Exception as exc:
            last_error = exc
    if not elements:
        raise RuntimeError(f"所有 Overpass 設施端點均失敗：{last_error}")
    records: list[dict[str, Any]] = []
    for element in elements:
        tags = element.get("tags", {})
        if "lat" in element and "lon" in element:
            lon, lat = element["lon"], element["lat"]
        elif element.get("center"):
            lon, lat = element["center"].get("lon"), element["center"].get("lat")
        else:
            continue
        if lon is None or lat is None:
            continue
        amenity = tags.get("amenity", "")
        office = tags.get("office", "")
        if amenity in {"hospital", "clinic"}:
            facility_type = "醫療機構"
        elif amenity == "fire_station":
            facility_type = "消防分隊"
        elif amenity in {"school", "college", "university", "kindergarten"}:
            facility_type = "學校"
        elif amenity == "townhall" or office == "government":
            facility_type = "政府機關"
        else:
            continue
        records.append({
            "facility_id": f"OSM-{element.get('type')}-{element.get('id')}",
            "facility_name": tags.get("name") or tags.get("official_name") or f"OSM {element.get('id')}",
            "facility_type": facility_type,
            "facility_source": "OpenStreetMap／Overpass（補充資料）",
            "source_record_id": f"{element.get('type')}/{element.get('id')}",
            "source_date": now_utc(),
            "admin_area": COUNTY,
            "osm_amenity": amenity,
            "osm_office": office,
            "geometry": Point(float(lon), float(lat)),
        })
    if not records:
        raise RuntimeError("Overpass 未回傳宜蘭縣公共設施")
    frame = gpd.GeoDataFrame(records, geometry="geometry", crs=WEB_CRS).to_crs(ANALYSIS_CRS)
    frame = frame[frame.geometry.within(scope.buffer(1))].copy()
    return frame, {
        "name": "OpenStreetMap 宜蘭縣公共設施點位",
        "provider": "OpenStreetMap contributors",
        "dataset_url": "https://www.openstreetmap.org/",
        "download_url": endpoint_used,
        "query": OSM_QUERY,
        "retrieved_at": now_utc(),
        "source_crs": WEB_CRS,
        "analysis_crs": ANALYSIS_CRS,
        "role": "supplemental_facility_points_for_medical_and_government",
        "limitation": "OSM 完整性與定位精度依社群維護狀況而異；醫療機構與政府機關結果不得視為官方完整名冊。",
    }


def build_official_schools(session: requests.Session, scope: Any, temp: Path) -> tuple[gpd.GeoDataFrame, dict[str, Any]]:
    extracted = extract_archive(download_bytes(URLS["school_download"], session), "school121.zip", temp)
    paths = list(extracted.rglob("*.shp"))
    if not paths:
        raise RuntimeError("NLSC 學校範圍圖 ZIP 未找到 SHP")
    frame = read_shape(paths[0], ANALYSIS_CRS)
    id_col = first_existing(list(frame.columns), ["ID", "學校代碼", "schoolId"])
    name_col = first_existing(list(frame.columns), ["BLOCKNAME", "校名", "名稱"])
    month_col = first_existing(list(frame.columns), ["YYYYMM", "資料年月"])
    if not id_col or not name_col:
        raise RuntimeError(f"NLSC 學校範圍圖缺少必要欄位：{list(frame.columns)}")
    frame["school_id"] = frame[id_col].astype(str).str.replace(r"\.0$", "", regex=True)
    frame["facility_name"] = frame[name_col].fillna("").astype(str).str.strip()
    frame["source_date"] = frame[month_col].astype(str) if month_col else "unknown"
    frame = frame[["school_id", "facility_name", "source_date", "geometry"]]
    frame = frame[frame.geometry.notna() & ~frame.geometry.is_empty].copy()
    invalid = ~frame.geometry.is_valid
    if invalid.any():
        frame.loc[invalid, "geometry"] = frame.loc[invalid, "geometry"].make_valid()
    frame = frame.dissolve(by=["school_id", "facility_name", "source_date"], as_index=False)
    frame["geometry"] = frame.geometry.representative_point()
    frame = frame[frame.geometry.within(scope.buffer(1))].copy()
    frame["facility_id"] = "NLSC-121-" + frame["school_id"]
    frame["facility_type"] = "學校"
    frame["facility_source"] = "內政部國土測繪中心（官方）"
    frame["source_record_id"] = frame["school_id"]
    frame["admin_area"] = COUNTY
    frame["osm_amenity"] = ""
    frame["osm_office"] = ""
    return frame[[
        "facility_id", "facility_name", "facility_type", "facility_source",
        "source_record_id", "source_date", "admin_area", "osm_amenity",
        "osm_office", "geometry",
    ]], {
        "name": "各級學校範圍圖_121分帶",
        "provider": "內政部國土測繪中心",
        "dataset_url": URLS["school_dataset"],
        "download_url": URLS["school_download"],
        "retrieved_at": now_utc(),
        "source_crs": ANALYSIS_CRS,
        "analysis_crs": ANALYSIS_CRS,
        "role": "official_school_campus_representative_points",
        "limitation": "學校點位由官方校地 polygon 取 representative point，不代表單一校舍或校門位置。",
    }


def build_official_fire(session: requests.Session, scope: Any) -> tuple[gpd.GeoDataFrame, dict[str, Any]]:
    payload = download_bytes(URLS["fire_download"], session)
    last_error: Exception | None = None
    frame: pd.DataFrame | None = None
    for encoding in ("utf-8-sig", "utf-8", "cp950", "big5"):
        try:
            frame = pd.read_csv(io.BytesIO(payload), encoding=encoding)
            break
        except Exception as exc:
            last_error = exc
    if frame is None:
        raise RuntimeError(f"消防署 CSV 無法解析：{last_error}")
    lon_col = first_existing(list(frame.columns), ["經度", "Longitude", "lon", "LON"])
    lat_col = first_existing(list(frame.columns), ["緯度", "Latitude", "lat", "LAT"])
    name_col = first_existing(list(frame.columns), ["名稱", "單位名稱", "Name", "name"])
    if not lon_col or not lat_col:
        raise RuntimeError(f"消防署 CSV 缺少經緯度欄位：{list(frame.columns)}")
    frame["lon"] = pd.to_numeric(frame[lon_col], errors="coerce")
    frame["lat"] = pd.to_numeric(frame[lat_col], errors="coerce")
    frame = frame.dropna(subset=["lon", "lat"]).copy()
    frame["facility_name"] = frame[name_col].fillna("").astype(str) if name_col else "消防單位"
    out = gpd.GeoDataFrame(
        frame,
        geometry=[Point(x, y) for x, y in zip(frame["lon"], frame["lat"])],
        crs=WEB_CRS,
    ).to_crs(ANALYSIS_CRS)
    out = out[out.geometry.within(scope.buffer(1))].copy()
    out["facility_id"] = [f"NFA-{i}" for i in out.index]
    out["facility_type"] = "消防分隊"
    out["facility_source"] = "內政部消防署（官方）"
    out["source_record_id"] = out.index.astype(str)
    out["source_date"] = now_utc()
    out["admin_area"] = COUNTY
    out["osm_amenity"] = ""
    out["osm_office"] = ""
    return out[[
        "facility_id", "facility_name", "facility_type", "facility_source",
        "source_record_id", "source_date", "admin_area", "osm_amenity",
        "osm_office", "geometry",
    ]], {
        "name": "救援與應變單位點位",
        "provider": "內政部消防署",
        "dataset_url": URLS["fire_dataset"],
        "download_url": URLS["fire_download"],
        "retrieved_at": now_utc(),
        "source_crs": WEB_CRS,
        "analysis_crs": ANALYSIS_CRS,
        "role": "official_fire_station_points",
        "limitation": "資料集包含消防單位及災害應變中心；本分析以名稱／點位作消防分隊類型之篩選，未另行判定勤務編制。",
    }


def load_geology(session: requests.Session, temp: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    index_payload = download_bytes(URLS["geology_index"], session)
    rows = list(csv.DictReader(io.StringIO(decode_text(index_payload))))
    by_id = {row.get("地質敏感區編號"): row for row in rows}
    targets = ["G0003", "H0010", "L0016"]
    unions: dict[str, Any] = {}
    source_records: list[dict[str, Any]] = []
    for official_id in targets:
        row = by_id.get(official_id)
        if not row or not row.get("下載連結"):
            raise RuntimeError(f"官方地質敏感區索引缺少宜蘭相關資料：{official_id}")
        extracted = extract_archive(download_bytes(row["下載連結"], session), f"{official_id}.archive", temp)
        paths = list(extracted.rglob("*.shp"))
        if not paths:
            raise RuntimeError(f"官方地質敏感區 {official_id} 壓縮檔未找到 SHP")
        pieces = []
        for path in paths:
            frame = read_shape(path, official_crs(row)).to_crs(ANALYSIS_CRS)
            pieces.append(frame.geometry)
        geometry = unary_union(pd.concat(pieces, ignore_index=True))
        unions[official_id] = geometry
        source_records.append({
            "name": f"地質敏感區 {official_id} {row.get('地質敏感區名稱', '')}",
            "provider": "經濟部地質調查及礦業管理中心",
            "dataset_url": URLS["geology_dataset"],
            "download_url": row["下載連結"],
            "retrieved_at": now_utc(),
            "source_crs": official_crs(row),
            "analysis_crs": ANALYSIS_CRS,
            "role": "official_geological_sensitive_area",
            "official_id": official_id,
            "category": row.get("地質敏感區類型", ""),
            "announcement_date": row.get("公告日期", ""),
            "limitation": "數值範圍為規劃參考；實際範圍與法定判定以公告圖資、主管機關及專業程序為準。",
        })
    return unions, source_records


def load_flood_points(session: requests.Session, scope: Any) -> tuple[gpd.GeoDataFrame, dict[str, Any]]:
    payload = download_bytes(URLS["flood_download"], session)
    frame = None
    last_error: Exception | None = None
    for encoding in ("utf-8-sig", "utf-8", "cp950", "big5"):
        try:
            frame = pd.read_csv(io.BytesIO(payload), encoding=encoding)
            break
        except Exception as exc:
            last_error = exc
    if frame is None:
        raise RuntimeError(f"近5年淹水災點 CSV 無法解析：{last_error}")
    x_col = first_existing(list(frame.columns), ["X_97", "X", "x"])
    y_col = first_existing(list(frame.columns), ["Y_97", "Y", "y"])
    if not x_col or not y_col:
        raise RuntimeError(f"近5年淹水災點缺少 X_97/Y_97：{list(frame.columns)}")
    frame["x"] = pd.to_numeric(frame[x_col], errors="coerce")
    frame["y"] = pd.to_numeric(frame[y_col], errors="coerce")
    frame = frame.dropna(subset=["x", "y"]).copy()
    points = gpd.GeoDataFrame(frame, geometry=[Point(x, y) for x, y in zip(frame["x"], frame["y"])], crs=ANALYSIS_CRS)
    points = points[points.geometry.within(scope.buffer(1))].copy()
    years = sorted({str(value) for value in points.get("year", pd.Series(dtype=str)).dropna().tolist()})
    return points, {
        "name": "近5年淹水災點資料",
        "provider": "國家科學及技術委員會",
        "dataset_url": URLS["flood_dataset"],
        "download_url": URLS["flood_download"],
        "retrieved_at": now_utc(),
        "source_crs": ANALYSIS_CRS,
        "analysis_crs": ANALYSIS_CRS,
        "role": "official_historical_flood_points",
        "record_years_in_yilan": years,
        "limitation": "資料集備註為 2023 年產製；雖標示近5年，實際涵蓋年度以資料欄位為準，可能未涵蓋 2024-2026 最新事件。官方亦說明局部、零星都市道路或農漁塭淹水可能未納入。",
    }


def load_debris(session: requests.Session, scope: Any, temp: Path) -> tuple[Any, dict[str, Any]]:
    extracted = extract_archive(download_bytes(URLS["debris_download"], session), "debris-impact-115.zip", temp)
    paths = list(extracted.rglob("*.shp"))
    if not paths:
        raise RuntimeError("115年度土石流影響範圍 ZIP 未找到 SHP")
    pieces = []
    for path in paths:
        frame = read_shape(path, ANALYSIS_CRS).to_crs(ANALYSIS_CRS)
        county_col = first_existing(list(frame.columns), ["County", "COUNTY", "縣市"])
        if county_col:
            selected = frame[frame[county_col].astype(str).str.contains("宜蘭", na=False)].copy()
            if not selected.empty:
                frame = selected
        frame = frame[frame.geometry.intersects(scope.buffer(1))].copy()
        if not frame.empty:
            pieces.append(frame)
    if not pieces:
        raise RuntimeError("115年度土石流影響範圍在宜蘭縣沒有可用幾何")
    combined = pd.concat(pieces, ignore_index=True)
    geometry = unary_union(combined.geometry)
    risk_col = first_existing(list(combined.columns), ["Risk", "RISK", "風險等級"])
    risk_values = sorted({str(value) for value in combined[risk_col].dropna().tolist()}) if risk_col else []
    return geometry, {
        "name": "115年度1753條土石流潛勢溪流影響範圍圖",
        "provider": "農業部農村發展及水土保持署",
        "dataset_url": URLS["debris_dataset"],
        "download_url": URLS["debris_download"],
        "retrieved_at": now_utc(),
        "source_crs": ANALYSIS_CRS,
        "analysis_crs": ANALYSIS_CRS,
        "role": "official_debris_flow_impact_area",
        "scope_records": int(len(combined)),
        "risk_values": risk_values,
        "limitation": "潛勢／影響範圍供防災規劃與風險提醒，不代表災害必然發生，也不取代現勘或法定審查。",
    }


def match_facilities(facilities: gpd.GeoDataFrame, scope: Any, geology: dict[str, Any], flood: gpd.GeoDataFrame, debris: Any) -> tuple[gpd.GeoDataFrame, dict[str, Any]]:
    facilities = facilities.copy().to_crs(ANALYSIS_CRS)
    flood_sindex = flood.sindex if not flood.empty else None
    output: list[dict[str, Any]] = []
    for _, row in facilities.iterrows():
        point = row.geometry
        matches: list[dict[str, Any]] = []
        for official_id, geometry in geology.items():
            distance = float(point.distance(geometry))
            if distance <= BUFFER_M:
                matches.append({"group": "地質敏感區", "source_id": official_id, "distance_m": round(distance, 1)})
        flood_count = 0
        flood_distance: float | None = None
        if flood_sindex is not None:
            hits = list(flood_sindex.query(point.buffer(BUFFER_M), predicate="intersects"))
            flood_count = len(hits)
            if hits:
                flood_distance = round(min(float(point.distance(flood.iloc[index].geometry)) for index in hits), 1)
                matches.append({"group": "近5年歷史淹水災點", "source_id": "130016", "distance_m": flood_distance, "match_count": flood_count})
        debris_distance = float(point.distance(debris))
        if debris_distance <= BUFFER_M:
            matches.append({"group": "土石流影響範圍", "source_id": "176526", "distance_m": round(debris_distance, 1)})
        if not matches:
            continue
        groups = sorted({item["group"] for item in matches})
        priority = "複合災害暴露（優先查核）" if len(groups) >= 2 else "單一災害暴露（篩選參考）"
        feature = row.to_dict()
        feature.update({
            "matched_hazard_groups": groups,
            "matched_hazard_details": matches,
            "hazard_group_count": len(groups),
            "flood_point_count_300m": flood_count,
            "screening_priority": priority,
            "analysis_predicate": "public facility point intersects hazard polygon or is within 300 metres of hazard geometry/point",
            "analysis_role": "SCREENING_REFERENCE",
        })
        output.append(feature)
    result = gpd.GeoDataFrame(output, geometry="geometry", crs=ANALYSIS_CRS) if output else gpd.GeoDataFrame(columns=["geometry"], crs=ANALYSIS_CRS)
    stats = {
        "result_count": int(len(result)),
        "high_risk_count": int(sum(result.get("hazard_group_count", pd.Series(dtype=int)).fillna(0).astype(int) >= 2)),
        "result_count_by_facility_type": dict(Counter(result.get("facility_type", pd.Series(dtype=str)).tolist())),
        "result_count_by_hazard_group": dict(Counter(group for groups in result.get("matched_hazard_groups", []) for group in groups)),
    }
    return result, stats


def clean_for_json(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        return [clean_for_json(item) for item in value]
    if isinstance(value, dict):
        return {str(key): clean_for_json(item) for key, item in value.items()}
    try:
        missing = pd.isna(value)
        if isinstance(missing, bool) and missing:
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    return value


def write_outputs(out: Path, scope: Any, result: gpd.GeoDataFrame, stats: dict[str, Any], sources: list[dict[str, Any]], substitutions: list[str], input_facility_count: int) -> None:
    out.mkdir(parents=True, exist_ok=True)
    result_web = result.to_crs(WEB_CRS)
    features = []
    for _, row in result_web.iterrows():
        props = {key: clean_for_json(value) for key, value in row.items() if key != "geometry"}
        features.append({"type": "Feature", "geometry": mapping(row.geometry), "properties": props})
    result_payload = {"type": "FeatureCollection", "name": TASK_ID, "features": features, "metadata": {
        "title": "宜蘭縣公共設施複合災害暴露查核結果",
        "generated_at": now_utc(),
        "crs": WEB_CRS,
        "scope": COUNTY,
        "buffer_m": BUFFER_M,
        "analysis_role": "SCREENING_REFERENCE",
        "limitation": "結果為空間篩選參考，不是法定危險分級、工程安全鑑定或公共設施安全認定。",
    }}
    (out / "result.geojson").write_text(json.dumps(result_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    csv_rows = []
    for feature in features:
        row = dict(feature["properties"])
        row["longitude"] = feature["geometry"]["coordinates"][0]
        row["latitude"] = feature["geometry"]["coordinates"][1]
        row["matched_hazard_groups"] = "、".join(row.get("matched_hazard_groups") or [])
        row["matched_hazard_details"] = json.dumps(row.get("matched_hazard_details") or [], ensure_ascii=False)
        csv_rows.append(row)
    pd.DataFrame(csv_rows).to_csv(out / "result.csv", index=False, encoding="utf-8-sig")

    scope_web = gpd.GeoSeries([scope], crs=ANALYSIS_CRS).to_crs(WEB_CRS).iloc[0]
    scope_payload = {"type": "FeatureCollection", "features": [{"type": "Feature", "geometry": mapping(scope_web), "properties": {"name": COUNTY, "source": URLS["county_boundary_dataset"]}}]}
    (out / "scope.geojson").write_text(json.dumps(scope_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    summary = {
        "task_id": TASK_ID,
        "topic": "審計／稽核專題",
        "analysis_goal": "找出宜蘭縣學校、醫院、消防分隊、政府機關位於或鄰近複合災害圖層的公共設施，形成查核優先清單。",
        "geographic_scope": COUNTY,
        "time_range": "官方近5年淹水災點資料集（實際年度以資料欄位與資料集產製註記為準）；115年度土石流影響範圍；現行官方地質敏感區公告數值檔。",
        "spatial_rules": [
            f"公共設施點位與災害 polygon 相交，或距離災害 geometry／淹水災點不超過 {BUFFER_M} 公尺。",
            "學校位置使用官方校地 polygon representative point；其他設施使用官方座標或 OSM point/center。",
        ],
        "thresholds": {"buffer_m": BUFFER_M, "compound_exposure_groups": 2},
        "input_facility_count": input_facility_count,
        "result_count": stats["result_count"],
        "unique_facility_count": stats["result_count"],
        "high_risk_count": stats["high_risk_count"],
        "screening_priority_definition": "high_risk_count 僅代表同一設施命中兩種以上災害群組，不是官方風險等級。",
        "result_count_by_facility_type": stats["result_count_by_facility_type"],
        "result_count_by_hazard_group": stats["result_count_by_hazard_group"],
        "data_sources": sources,
        "substitutions": substitutions,
        "limitations": [
            "地質敏感區與淹水潛勢／災點為規劃或防災參考，不取代法定公告、現勘、鑽探、水理分析或專業簽證。",
            "OpenStreetMap 僅補充醫療機構與政府機關座標，完整性不等同官方機關名冊。",
            "結果以設施點位判定，未以建物 polygon、校舍棟別、路網可達性或人口暴露計算。",
        ],
        "generated_at": now_utc(),
    }
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    result_df = pd.DataFrame(csv_rows)
    stats_rows = [{"統計項目": "輸入公共設施數", "數值": input_facility_count}, {"統計項目": "命中設施數", "數值": stats["result_count"]}, {"統計項目": "複合災害暴露設施數", "數值": stats["high_risk_count"]}]
    stats_rows += [{"統計項目": f"設施類型：{key}", "數值": value} for key, value in stats["result_count_by_facility_type"].items()]
    stats_rows += [{"統計項目": f"災害群組：{key}", "數值": value} for key, value in stats["result_count_by_hazard_group"].items()]
    params = [{"參數": "分析範圍", "值": COUNTY}, {"參數": "距離門檻（公尺）", "值": BUFFER_M}, {"參數": "分析 CRS", "值": ANALYSIS_CRS}, {"參數": "輸出 CRS", "值": WEB_CRS}, {"參數": "空間條件", "值": "相交或距離不超過300公尺"}, {"參數": "複合暴露定義", "值": "命中兩種以上災害群組；僅為查核排序，不是官方風險分級"}, {"參數": "產製時間", "值": now_utc()}]
    source_rows = []
    for source in sources:
        source_rows.append({"圖層／資料集": source.get("name"), "提供者": source.get("provider"), "資料集網址": source.get("dataset_url"), "下載／服務網址": source.get("download_url"), "資料日期／年度": source.get("record_years_in_yilan", source.get("announcement_date", "")), "取得時間": source.get("retrieved_at"), "來源 CRS": source.get("source_crs"), "分析 CRS": source.get("analysis_crs"), "角色": source.get("role"), "限制": source.get("limitation"), "備註": source.get("query", "")})
    with pd.ExcelWriter(out / "result.xlsx", engine="openpyxl") as writer:
        result_df.to_excel(writer, sheet_name="分析結果", index=False)
        pd.DataFrame(stats_rows).to_excel(writer, sheet_name="統計摘要", index=False)
        pd.DataFrame(params).to_excel(writer, sheet_name="分析參數", index=False)
        pd.DataFrame(source_rows).to_excel(writer, sheet_name="資料來源", index=False)
        for sheet in writer.book.worksheets:
            sheet.freeze_panes = "A2"
            sheet.auto_filter.ref = sheet.dimensions
            for column in sheet.columns:
                width = min(max(len(str(cell.value or "")) for cell in column) + 2, 60)
                sheet.column_dimensions[column[0].column_letter].width = width

    project_url = f"{PAGES_ROOT}analysis/{TASK_ID}/map.geolibre.json"
    result_url = f"{PAGES_ROOT}analysis/{TASK_ID}/result.geojson"
    scope_url = f"{PAGES_ROOT}analysis/{TASK_ID}/scope.geojson"
    project = {
        "version": "0.2.0",
        "name": "宜蘭縣公共設施複合災害暴露查核",
        "mapView": {"center": [121.52, 24.67], "zoom": 9.1, "bearing": 0, "pitch": 0},
        "basemapStyleUrl": "https://tiles.openfreemap.org/styles/liberty",
        "basemapVisible": True,
        "layers": [
            {"id": "yilan-public-facility-exposure", "name": "公共設施複合災害暴露查核結果", "type": "geojson", "source": {"type": "geojson", "data": result_url}, "visible": True, "opacity": 1, "style": {"circleColor": "#dc2626", "circleRadius": 6, "circleStrokeColor": "#ffffff", "circleStrokeWidth": 1}, "metadata": {"resultCount": stats["result_count"], "source": "result.geojson", "analysisRole": "SCREENING_REFERENCE", "popupFields": ["facility_name", "facility_type", "facility_source", "matched_hazard_groups", "matched_hazard_details", "screening_priority", "analysis_predicate"]}},
            {"id": "yilan-county-boundary", "name": "宜蘭縣行政界", "type": "geojson", "source": {"type": "geojson", "data": scope_url}, "visible": True, "opacity": 0.45, "style": {"fillColor": "#64748b", "fillOpacity": 0.05, "strokeColor": "#334155", "strokeWidth": 2}, "metadata": {"source": URLS["county_boundary_dataset"], "role": "context"}},
        ],
        "selectedLayerId": "yilan-public-facility-exposure",
        "metadata": {"description": "宜蘭縣公共設施與官方／補充災害圖層之空間篩選結果。", "projectUrl": project_url, "resultUrl": result_url, "generatedAt": now_utc(), "analysisRole": "SCREENING_REFERENCE", "sources": sources, "substitutions": substitutions, "limitations": summary["limitations"]},
    }
    (out / "map.geolibre.json").write_text(json.dumps(project, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    encoded = project_url.replace("&", "%26")
    (out / "index.html").write_text("<!doctype html><meta charset='utf-8'><title>宜蘭縣公共設施複合災害暴露查核</title><script>location.replace('" + PAGES_ROOT + "?locale=zh-TW&loading=true&url=' + encodeURIComponent('" + project_url + "'))</script>", encoding="utf-8")

    report_lines = [
        f"# 宜蘭縣公共設施複合災害暴露查核\n",
        f"- 任務：`{TASK_ID}`",
        f"- 範圍：{COUNTY}",
        f"- 產製時間（UTC）：{summary['generated_at']}",
        f"- 輸入公共設施數：{input_facility_count}",
        f"- 命中設施數：{stats['result_count']}",
        f"- 複合災害暴露（兩種以上群組）數：{stats['high_risk_count']}（不是官方風險等級）",
        "",
        "## 分析方法",
        f"以公共設施點位與災害幾何套疊；設施與災害 polygon 相交，或距離災害 geometry／淹水災點不超過 {BUFFER_M} 公尺，即列入結果。分析距離使用 `{ANALYSIS_CRS}`，成果輸出為 `{WEB_CRS}`。學校使用 NLSC 校地 polygon 的 representative point；消防分隊優先使用消防署官方座標；醫療機構與政府機關以 OSM／Overpass 補充。",
        "",
        "## 採用資料與依據",
        "|圖層／資料集|提供者|資料集／下載網址|CRS／角色|限制與用途|",
        "|---|---|---|---|---|",
    ]
    for source in sources:
        report_lines.append(f"|{source.get('name','')}|{source.get('provider','')}|{source.get('dataset_url','')}<br>{source.get('download_url','')}|{source.get('source_crs','')} → {source.get('analysis_crs','')}<br>{source.get('role','')}|{source.get('limitation','')}|")
    report_lines += [
        "",
        "## 結果統計",
        json.dumps({"result_count": stats["result_count"], "high_risk_count": stats["high_risk_count"], "by_facility_type": stats["result_count_by_facility_type"], "by_hazard_group": stats["result_count_by_hazard_group"]}, ensure_ascii=False, indent=2),
        "",
        "## 替代與資料限制",
    ]
    if substitutions:
        report_lines.extend([f"- {item}" for item in substitutions])
    else:
        report_lines.append("- 本次未使用替代範圍資料。")
    report_lines += [
        "- `高風險`欄位在工作流中僅表示命中兩種以上災害群組，為查核排序用的複合暴露指標，不是官方風險分級。",
        "- 淹水資料集雖標示近5年，但資料集備註為 2023 年產製；實際年度以下載檔 year 欄位為準。",
        "- OSM 醫療機構與政府機關資料屬補充性點位，不能解讀為完整官方名冊；應與衛生福利部、地方政府機關名冊複核。",
        "- 地質敏感區、淹水災點與土石流影響範圍均為規劃／防災參考資料，不能取代法定公告、現地調查、專業簽證或工程安全鑑定。",
        "",
        "## 交付檔案",
        "- `map.geolibre.json`：GeoLibre 預設互動地圖",
        "- `result.geojson`：完整命中設施點位",
        "- `result.csv`：逐設施清單",
        "- `result.xlsx`：分析結果、統計摘要、分析參數、資料來源",
        "- `summary.json`：可機讀摘要",
        "- `performance.json`：GeoLibre 效能檢查（由 optimizer 產生）",
        "- `index.html`：穩定公開入口",
    ]
    (out / "report.md").write_text("\n".join(report_lines) + "\n", encoding="utf-8")


def main() -> None:
    manifest_path = Path(os.environ.get("GEOLIBRE_TASK_MANIFEST", "GeoLibre-Web/tasks/current-task.json"))
    out = Path(os.environ.get("GEOLIBRE_OUTPUT_DIR", f"GeoLibre-Web/analysis/{TASK_ID}"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("task_id") != TASK_ID:
        raise RuntimeError(f"manifest task_id 不符：{manifest.get('task_id')} != {TASK_ID}")
    out.mkdir(parents=True, exist_ok=True)
    substitutions: list[str] = []
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    with tempfile.TemporaryDirectory(prefix="geolibre-yilan-") as temp_dir:
        temp = Path(temp_dir)
        scope, scope_source = scope_from_official_boundary(session, temp, substitutions)
        source_records = [scope_source]
        osm = gpd.GeoDataFrame(columns=["facility_id", "facility_name", "facility_type", "facility_source", "source_record_id", "source_date", "admin_area", "osm_amenity", "osm_office", "geometry"], geometry="geometry", crs=ANALYSIS_CRS)
        try:
            osm, osm_source = build_osm_facilities(session, scope)
            source_records.append(osm_source)
        except Exception as exc:
            substitutions.append(f"OSM／Overpass 設施補充資料下載失敗，後續僅使用可取得的官方學校／消防資料：{exc}")
        schools = gpd.GeoDataFrame(columns=["facility_id", "facility_name", "facility_type", "source", "geometry"], geometry="geometry", crs=ANALYSIS_CRS)
        fire = gpd.GeoDataFrame(columns=["facility_id", "facility_name", "facility_type", "source", "geometry"], geometry="geometry", crs=ANALYSIS_CRS)
        try:
            schools, source = build_official_schools(session, scope, temp)
            source_records.append(source)
            osm = osm[osm["facility_type"] != "學校"].copy()
        except Exception as exc:
            substitutions.append(f"NLSC 學校範圍圖下載或解析失敗，保留 OSM 學校補充資料：{exc}")
        try:
            fire, source = build_official_fire(session, scope)
            source_records.append(source)
            osm_fire = osm[osm["facility_type"] == "消防分隊"].copy()
            if not osm_fire.empty:
                distances = gpd.sjoin_nearest(osm_fire, fire[["geometry"]], how="left", distance_col="_d")
                osm = osm.drop(index=distances[distances["_d"] <= 100].index, errors="ignore")
        except Exception as exc:
            substitutions.append(f"消防署官方資料下載或解析失敗，保留 OSM 消防分隊補充資料：{exc}")
        facilities = pd.concat([osm, schools, fire], ignore_index=True)
        facilities = gpd.GeoDataFrame(facilities, geometry="geometry", crs=ANALYSIS_CRS)
        facilities = facilities.drop_duplicates(subset=["facility_id"]).reset_index(drop=True)
        geology, geology_sources = load_geology(session, temp)
        source_records.extend(geology_sources)
        flood, flood_source = load_flood_points(session, scope)
        source_records.append(flood_source)
        debris, debris_source = load_debris(session, scope, temp)
        source_records.append(debris_source)
        result, stats = match_facilities(facilities, scope, geology, flood, debris)
        write_outputs(out, scope, result, stats, source_records, substitutions, len(facilities))
        print(json.dumps({"task_id": TASK_ID, "input_facilities": len(facilities), **stats, "substitutions": substitutions}, ensure_ascii=False))


if __name__ == "__main__":
    main()

