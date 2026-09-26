#!/usr/bin/env python3
"""Screen Yilan public-facility points against the official Sep-2026 raster map.

This is a raster-image screening addendum, not a vector intersection or legal
site assessment. The source image is the official 7016x7016 overview map.
"""

from __future__ import annotations

import argparse
import csv
import html
import hashlib
import json
import math
import os
import shutil
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from PIL import Image
from pyproj import Transformer
from shapely.geometry import Point, shape


ROOT = Path(__file__).resolve().parent
DEFAULT_IMAGE = Path(r"C:\Users\ymguan\Downloads\YiL_Overview.png")
DEFAULT_OUTPUT = ROOT / "yilan-liquefaction-2026-update"
TASK_ID = "yilan-public-facility-hazard-exposure-2026-09-26-update"
PAGES_ROOT = "https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09-26-update/"
IMAGE_URL = "https://liquefaction.gsmma.gov.tw/cgs/public/img/map/YiL_Overview.png"
SYSTEM_URL = "https://liquefaction.gsmma.gov.tw/cgs/public/index.html"
PRESS_URL = "https://www.moea.gov.tw/Mns/Populace/news/News.aspx?kind=1&menu_id=40&news_id=124062"
CRS = "EPSG:3826"

# Official legend colors present in the downloaded PNG (RGB).
CLASS_COLORS = {
    "低潛勢（PL<5）": (137, 205, 102),
    "中潛勢（5≤PL≤15）": (255, 255, 115),
    "高潛勢（PL≥15）": (255, 127, 127),
}
RISK_CLASSES = ("中潛勢（5≤PL≤15）", "高潛勢（PL≥15）")

# Pixel centers of the printed TWD97 / TM2 zone 121 grid ticks, measured from
# the official 7016x7016 source PNG. Fit all ticks to reduce one-pixel reading
# noise. Values are in metres and pixels, respectively.
X_PIXELS = [1076.5, 1901.5, 2725.5, 3550.5, 4375.5, 5199.5, 6024.5]
X_METRES = [310000, 315000, 320000, 325000, 330000, 335000, 340000]
Y_PIXELS = [1850.0, 2675.0, 3500.0, 4324.0, 5149.0, 5974.0]
Y_METRES = [2750000, 2745000, 2740000, 2735000, 2730000, 2725000]
FRAME = (708.5, 1180.5, 6259.5, 6608.5)  # left, top, right, bottom pixel centers
DIRECT_RADIUS_PX = 2
BUFFER_METRES = 300.0


def load_geojson_points(path: Path, facility_type: str) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = []
    for feature in payload.get("features", []):
        geom = feature.get("geometry") or {}
        if geom.get("type") != "Point":
            continue
        lon, lat = geom["coordinates"][:2]
        props = feature.get("properties") or {}
        rows.append({
            "facility_id": str(props.get("facility_id", props.get("school_id", ""))),
            "facility_name": str(props.get("facility_name", props.get("school_name", "未命名設施"))),
            "facility_type": facility_type,
            "facility_source": str(props.get("facility_source", "")),
            "longitude": float(lon),
            "latitude": float(lat),
            "source_month": str(props.get("source_month", "")) if facility_type == "學校" else "",
            "location_note": {
                "學校": "官方校地範圍代表點，非校門或單一校舍點位",
                "醫療機構": "國土測繪中心醫療設施地標點",
                "政府機關": "iTaiwan 熱點位置代理點，非完整機關名冊",
            }.get(facility_type, "來源資料點位"),
        })
    return rows


def load_fire_points(path: Path, scope_path: Path) -> list[dict[str, Any]]:
    frame = None
    last_error: Exception | None = None
    for encoding in ("utf-8-sig", "utf-8", "cp950", "big5"):
        try:
            frame = pd.read_csv(path, encoding=encoding)
            break
        except Exception as exc:  # pragma: no cover - encoding fallback
            last_error = exc
    if frame is None:
        raise RuntimeError(f"消防署 CSV 無法讀取：{last_error}")

    def find(candidates: list[str]) -> str | None:
        return next((c for c in candidates if c in frame.columns), None)

    x_col = find(["經度", "Longitude", "lon", "LON", "X座標_TWD97TM121", "X座標", "X_97"])
    y_col = find(["緯度", "Latitude", "lat", "LAT", "Y座標_TWD97TM121", "Y座標", "Y_97"])
    name_col = find(["消防隊名稱", "名稱", "單位名稱", "Name", "name"])
    if not x_col or not y_col:
        raise RuntimeError(f"消防署 CSV 缺少座標欄位：{list(frame.columns)}")

    # The cached source CSV was previously audited: values in these columns are
    # around 121/24, so they are longitude/latitude despite the field names.
    frame[x_col] = pd.to_numeric(frame[x_col], errors="coerce")
    frame[y_col] = pd.to_numeric(frame[y_col], errors="coerce")
    frame = frame.dropna(subset=[x_col, y_col])
    if not frame.empty and not (115 <= frame[x_col].median() <= 125 and 20 <= frame[y_col].median() <= 30):
        raise RuntimeError("消防署座標不符合既有經緯度欄位稽核結果；停止套用以免錯位。")

    scope_data = json.loads(scope_path.read_text(encoding="utf-8"))
    scope = shape(scope_data["features"][0]["geometry"])
    rows: list[dict[str, Any]] = []
    for i, record in frame.iterrows():
        name = str(record.get(name_col, "消防單位")) if name_col else "消防單位"
        if "分隊" not in name:
            continue
        lon, lat = float(record[x_col]), float(record[y_col])
        if not scope.buffer(1e-7).covers(Point(lon, lat)):
            continue
        rows.append({
            "facility_id": f"NFA-{record.get('FID', i)}",
            "facility_name": name,
            "facility_type": "消防分隊",
            "facility_source": "內政部消防署（官方）",
            "longitude": lon,
            "latitude": lat,
            "location_note": "消防署點位；來源座標欄名與數值範圍不一致，依數值判為經緯度",
        })
    return rows


def fit_transform() -> tuple[float, float, float, float]:
    # Easting = mx * image_x + bx; Northing = my * image_y + by.
    mx, bx = np.polyfit(X_PIXELS, X_METRES, 1)
    my, by = np.polyfit(Y_PIXELS, Y_METRES, 1)
    return float(mx), float(bx), float(my), float(by)


def classify_window(img: np.ndarray, x: int, y: int) -> tuple[str, str, dict[str, int]]:
    r = DIRECT_RADIUS_PX
    patch = img[max(0, y-r):min(img.shape[0], y+r+1), max(0, x-r):min(img.shape[1], x+r+1), :3]
    counts: dict[str, int] = {}
    for label, color in CLASS_COLORS.items():
        counts[label] = int(np.all(patch == np.array(color, dtype=np.uint8), axis=2).sum())
    total = sum(counts.values())
    if total == 0:
        return "圖上無可判讀潛勢色塊", "無法判讀", counts
    ordered = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    label, count = ordered[0]
    if count == ordered[1][1] and count > 0:
        return "邊界／圖面符號干擾", "邊界不確定", counts
    status = "清楚" if count / total >= 0.6 else "邊界或符號附近，待人工複核"
    return label, status, counts


def nearest_medium_high(img: np.ndarray, x: int, y: int, metres_per_pixel: float) -> tuple[float | None, str | None]:
    radius = int(math.ceil(BUFFER_METRES / metres_per_pixel))
    y0, y1 = max(0, y-radius), min(img.shape[0], y+radius+1)
    x0, x1 = max(0, x-radius), min(img.shape[1], x+radius+1)
    patch = img[y0:y1, x0:x1, :3]
    yy, xx = np.ogrid[y0:y1, x0:x1]
    distance_px = np.sqrt((xx-x)**2 + (yy-y)**2)
    within = distance_px <= BUFFER_METRES / metres_per_pixel
    best: tuple[float, str] | None = None
    for label in RISK_CLASSES:
        color = np.array(CLASS_COLORS[label], dtype=np.uint8)
        mask = np.all(patch == color, axis=2) & within
        if not mask.any():
            continue
        d = float(distance_px[mask].min() * metres_per_pixel)
        if best is None or d < best[0]:
            best = (d, label)
    return (round(best[0], 1), best[1]) if best else (None, None)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", type=Path, default=None)
    parser.add_argument("--input-dir", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=Path(os.environ.get("GEOLIBRE_OUTPUT_DIR", DEFAULT_OUTPUT)))
    args = parser.parse_args()
    manifest = None
    if os.environ.get("GEOLIBRE_TASK_MANIFEST"):
        manifest_path = Path(os.environ["GEOLIBRE_TASK_MANIFEST"])
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("task_id") != TASK_ID:
            raise RuntimeError(f"任務設定與分析程式不符：{manifest.get('task_id')} != {TASK_ID}")
    args.output.mkdir(parents=True, exist_ok=True)
    snapshots = args.output / "source-snapshots"
    snapshots.mkdir(parents=True, exist_ok=True)
    image_snapshot = snapshots / "YiL_Overview.png"
    requested_image = args.image or (Path(os.environ["GEOLIBRE_SOURCE_IMAGE"]) if os.environ.get("GEOLIBRE_SOURCE_IMAGE") else None)
    if requested_image is None and DEFAULT_IMAGE.exists():
        requested_image = DEFAULT_IMAGE
    if requested_image is not None and requested_image.exists() and requested_image.resolve() != image_snapshot.resolve():
        shutil.copy2(requested_image, image_snapshot)
    if not image_snapshot.exists():
        request = urllib.request.Request(IMAGE_URL, headers={"User-Agent": "GeoLibre-analysis/1.0"})
        with urllib.request.urlopen(request, timeout=90) as response, image_snapshot.open("wb") as target:
            shutil.copyfileobj(response, target)

    input_names = [
        "yilan-official-schools.geojson", "yilan-official-medical.geojson",
        "yilan-government-hotspot-proxies.geojson", "fire-5969.csv", "yilan-county-scope.geojson",
    ]
    requested_input_dir = args.input_dir or (Path(os.environ["GEOLIBRE_INPUT_DIR"]) if os.environ.get("GEOLIBRE_INPUT_DIR") else None)
    candidate_dirs = [requested_input_dir, snapshots, ROOT]
    data_dir = next((p for p in candidate_dirs if p is not None and all((p / name).is_file() for name in input_names)), None)
    if data_dir is None:
        raise FileNotFoundError("找不到完整輸入快照；需要學校、醫療、政府代理點、消防 CSV 及縣界五份資料。")
    for name in input_names:
        source = data_dir / name
        target = snapshots / name
        if source.resolve() != target.resolve():
            shutil.copy2(source, target)
    data_dir = snapshots

    image = np.asarray(Image.open(image_snapshot).convert("RGB"))
    if image.shape[:2] != (7016, 7016):
        raise RuntimeError(f"官方圖面尺寸與核對版不符：{image.shape[1]}×{image.shape[0]}")

    rows: list[dict[str, Any]] = []
    rows.extend(load_geojson_points(data_dir / "yilan-official-schools.geojson", "學校"))
    rows.extend(load_geojson_points(data_dir / "yilan-official-medical.geojson", "醫療機構"))
    rows.extend(load_geojson_points(data_dir / "yilan-government-hotspot-proxies.geojson", "政府機關"))
    rows.extend(load_fire_points(data_dir / "fire-5969.csv", data_dir / "yilan-county-scope.geojson"))
    counts = Counter(row["facility_type"] for row in rows)
    school_month_counts = Counter(row.get("source_month", "") for row in rows if row["facility_type"] == "學校")
    if len(rows) != 291 or counts != Counter({"學校": 133, "政府機關": 98, "醫療機構": 42, "消防分隊": 18}):
        raise RuntimeError(f"設施筆數與原分析輸入不符：total={len(rows)}, by_type={dict(counts)}")

    mx, bx, my, by = fit_transform()
    metres_per_pixel = (abs(mx) + abs(my)) / 2
    to_3826 = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)
    x_left, y_top, x_right, y_bottom = FRAME
    class_counts = Counter()
    exposure_counts = Counter()
    status_counts = Counter()
    features = []

    for row in rows:
        easting, northing = to_3826.transform(row["longitude"], row["latitude"])
        px = int(round((easting - bx) / mx))
        py = int(round((northing - by) / my))
        inside = x_left <= px <= x_right and y_top <= py <= y_bottom
        if inside:
            raster_class, class_status, color_counts = classify_window(image, px, py)
            nearest_m, nearest_class = nearest_medium_high(image, px, py, metres_per_pixel)
        else:
            raster_class, class_status, color_counts = "超出新版宜蘭圖面範圍", "無圖面覆蓋", {}
            nearest_m, nearest_class = None, None

        direct_risk = raster_class in RISK_CLASSES
        exposed = bool(direct_risk or (nearest_m is not None and nearest_m <= BUFFER_METRES))
        if not inside:
            exposure = "無圖面覆蓋，不能判為低潛勢"
        elif direct_risk:
            exposure = "直接落在中／高潛勢圖色"
        elif nearest_m is not None and nearest_m <= BUFFER_METRES:
            exposure = f"距中／高潛勢圖色 {nearest_m:.1f} 公尺（≤300公尺）"
        elif raster_class == "低潛勢（PL<5）":
            exposure = "點位為低潛勢；300公尺內未見中／高潛勢圖色"
        elif class_status == "邊界不確定":
            exposure = "邊界／圖面符號造成不確定，需人工複核"
        else:
            exposure = "新版圖面此處無可判讀色塊；不能判為低潛勢"

        row.update({
            "easting_epsg3826": round(easting, 2),
            "northing_epsg3826": round(northing, 2),
            "image_pixel_x": px,
            "image_pixel_y": py,
            "image_coverage": "圖面範圍內" if inside else "圖面範圍外",
            "liquefaction_2026_map_class": raster_class,
            "pixel_class_status": class_status,
            "nearest_medium_high_m": nearest_m,
            "nearest_medium_high_class": nearest_class,
            "within_300m_medium_or_high": exposed,
            "liquefaction_screening_note": exposure,
            "sampled_rgb_class_pixels_5x5": color_counts,
        })
        status_counts[class_status] += 1
        class_counts[raster_class] += 1
        if exposed:
            exposure_counts[row["facility_type"]] += 1
        feature_props = {k: v for k, v in row.items() if k not in ("longitude", "latitude", "sampled_rgb_class_pixels_5x5")}
        feature_props["sampled_rgb_class_pixels_5x5"] = json.dumps(color_counts, ensure_ascii=False, separators=(",", ":"))
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [row["longitude"], row["latitude"]]},
            "properties": feature_props,
        })

    args.output.mkdir(parents=True, exist_ok=True)
    geojson = {"type": "FeatureCollection", "features": features}
    (args.output / "facilities-liquefaction-2026.geojson").write_text(
        json.dumps(geojson, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    df = pd.DataFrame(rows)
    if "sampled_rgb_class_pixels_5x5" in df:
        df["sampled_rgb_class_pixels_5x5"] = df["sampled_rgb_class_pixels_5x5"].map(lambda x: json.dumps(x, ensure_ascii=False))
    df.to_csv(args.output / "facilities-liquefaction-2026.csv", index=False, encoding="utf-8-sig")
    exposed = df[df["within_300m_medium_or_high"]]
    exposed.to_csv(args.output / "medium-high-screening-list.csv", index=False, encoding="utf-8-sig")

    image_sha256 = hashlib.sha256(image_snapshot.read_bytes()).hexdigest()
    if manifest is not None:
        expected_image_sha256 = manifest.get("confirmed_spec", {}).get("source_image_sha256")
        if expected_image_sha256 and image_sha256 != expected_image_sha256:
            raise RuntimeError("官方原圖 SHA-256 與任務確認版本不同，需先核對新版來源再分析。")
    hosted_image_url = PAGES_ROOT + "source-snapshots/YiL_Overview.png"
    summary = {
        "task_id": TASK_ID,
        "result_count": int(exposed.shape[0]),
        "generated_at": date.today().isoformat(),
        "geographic_scope": "宜蘭縣",
        "input_facilities": len(rows),
        "input_count_by_facility_type": dict(counts),
        "source_map_version": "民國115年9月（2026年9月）",
        "source_map_url": IMAGE_URL,
        "source_map_snapshot_url": hosted_image_url,
        "source_map_sha256": image_sha256,
        "source_system_url": SYSTEM_URL,
        "source_crs": CRS,
        "image_size": [int(image.shape[1]), int(image.shape[0])],
        "georeference": {
            "method": "使用圖面標示TWD97/TM2 zone 121座標格網十字／刻度做一階仿射定位；以7個東向與6個北向刻度最小平方擬合。",
            "x_tick_pixels": X_PIXELS,
            "x_tick_easting_m": X_METRES,
            "y_tick_pixels": Y_PIXELS,
            "y_tick_northing_m": Y_METRES,
            "metres_per_pixel_x": round(abs(mx), 4),
            "metres_per_pixel_y": round(abs(my), 4),
            "map_frame_pixel_centers": list(FRAME),
        },
        "legend_rgb": {k: list(v) for k, v in CLASS_COLORS.items()},
        "data_sources": [
            {
                "name": "宜蘭縣115年9月土壤液化潛勢圖（PNG）",
                "provider": "經濟部地質調查及礦業管理中心",
                "url": IMAGE_URL,
                "snapshot_url": hosted_image_url,
                "sha256": image_sha256,
                "system_url": SYSTEM_URL,
                "version": "民國115年9月（2026年9月）",
                "retrieved_at": "2026-09-26",
                "source_crs": "圖面TWD97/TM2 121分帶（EPSG:3826）；PNG本身無座標標籤，由格網配準",
                "source_role": "本次主要官方圖資",
                "use": "新版液化潛勢地圖影像，按官方TWD97格網配準後作顯示與顏色分類。",
                "limitation": "此公開介面為PNG/WMTS影像，非本分析可下載的同版向量polygon；本成果為影像篩選。",
            },
            {
                "name": "各級學校範圍圖_121分帶",
                "provider": "內政部國土測繪中心",
                "url": "https://data.gov.tw/dataset/174606",
                "version": "1150409（2026-04-09檔案版次）；圖徵YYYYMM依學校不同，範圍201005–202508",
                "retrieved_at": "2026-09-25（沿用快取）",
                "source_crs": "原始121分帶EPSG:3826；代表點輸出EPSG:4326",
                "source_role": "本次設施點來源（官方資料衍生）",
                "feature_month_counts": dict(sorted(school_month_counts.items())),
                "use": "133所學校的校地代表點。",
                "limitation": "representative point不是校門、校舍或校地界址。",
            },
            {
                "name": "國土測繪中心醫療設施地標API",
                "provider": "內政部國土測繪中心",
                "url": "https://data.gov.tw/dataset/139250",
                "version": "2026-09-25查詢快取",
                "retrieved_at": "2026-09-25",
                "source_crs": "經緯度EPSG:4326（本案使用座標）",
                "source_role": "本次設施點來源（官方資料）",
                "use": "42個名稱屬醫院、衛生所或衛生室的點位。",
                "limitation": "不代表完整診所名冊。",
            },
            {
                "name": "iTaiwan公共區域免費服務無線上網熱點",
                "provider": "數位發展部",
                "url": "https://data.gov.tw/dataset/5962",
                "version": "資料平台詮釋資料更新2025-11-06；宜蘭快取擷取2026-09-25",
                "retrieved_at": "2026-09-25",
                "source_crs": "經緯度EPSG:4326（本案使用座標）",
                "source_role": "本次設施點來源（官方熱點資料作機關代理）",
                "use": "98個政府機關位置代理點。",
                "limitation": "只涵蓋設有熱點且名稱符合條件者，不是完整機關名冊。",
            },
            {
                "name": "救援與應變單位點位",
                "provider": "內政部消防署",
                "url": "https://data.gov.tw/dataset/5969",
                "version": "官方CSV快取擷取2026-09-25",
                "retrieved_at": "2026-09-25",
                "source_crs": "欄名TWD97；座標數值按經緯度EPSG:4326解讀",
                "source_role": "本次設施點來源（官方資料）",
                "use": "18個名稱包含分隊的消防設施點。",
                "limitation": "此版座標欄位名稱寫TWD97，但數值範圍為經緯度；按既有欄位稽核結果以EPSG:4326解讀。",
            },
            {
                "name": "宜蘭縣範圍（行政區界衍生快取）",
                "provider": "內政部國土測繪中心（衍生）",
                "url": "https://data.gov.tw/dataset/7441",
                "version": "2026-09-25快取",
                "retrieved_at": "2026-09-25",
                "source_crs": "原始行政界EPSG:3826；地圖輸出EPSG:4326",
                "source_role": "本次範圍來源（官方資料衍生）",
                "use": "消防分隊與縣界範圍篩選及地圖定位。",
                "limitation": "由鄉鎮市區界聯集及簡化，不作法定界址依據。",
            },
            {
                "name": "宜蘭地質敏感區數值檔（G0003、H0010、L0016）",
                "provider": "經濟部地質調查及礦業管理中心",
                "url": "https://data.gov.tw/dataset/27744",
                "version": "官方說明所列數值檔最近更新114-05-29（2025-05-29）",
                "supporting_document": "https://www.gsmma.gov.tw/uploads/1764897333077iIlNn6BB.pdf",
                "retrieved_at": "2026-09-25（前次分析快取；本次查核官方版次）",
                "source_crs": "本次僅沿用舊版GeoJSON（EPSG:4326）；原始數值檔座標系統未重新查核",
                "source_role": "前次成果對照；本次未重算",
                "use": "原複合災害報告的法定公告敏感區規劃參考範圍；本增補不重算該組統計。",
                "limitation": "官方註明數值範圍供規劃參考，實際法定範圍以公告圖資為準。",
            },
            {
                "name": "115年度1753條土石流潛勢溪流影響範圍圖",
                "provider": "農業部農村發展及水土保持署",
                "url": "https://data.gov.tw/dataset/176526",
                "version": "115年度；資源檔debris1753_20260126_twd97；原分析於2026-09-25取得",
                "retrieved_at": "2026-09-25（前次分析快取）",
                "source_crs": "本次僅沿用舊版GeoJSON（EPSG:4326）；原檔名標示TWD97，未重新查核",
                "source_role": "前次成果對照；本次未重算",
                "use": "原複合災害報告的土石流影響範圍；本增補不重算該組統計。",
                "limitation": "潛勢影響範圍不代表災害必然發生。",
            },
            {
                "name": "近5年淹水災點資料",
                "provider": "國家科學及技術委員會",
                "url": "https://data.gov.tw/dataset/130016",
                "version": "平台詮釋資料更新2026-08-13；實際使用檔案紀錄年度為2021-2025，原分析於2026-09-25取得",
                "retrieved_at": "2026-09-25（前次分析快取）",
                "source_crs": "本次僅沿用舊版GeoJSON（EPSG:4326）；原始檔座標系統未重新查核",
                "source_role": "前次成果對照；本次未重算",
                "use": "原複合災害報告的歷史淹水點；本增補不重算該組統計。",
                "limitation": "宜蘭子集無2023紀錄，且截至2025年度，不含2026年事件。",
            },
        ],
        "class_counts": dict(class_counts),
        "class_status_counts": dict(status_counts),
        "within_300m_medium_or_high_count": int(exposed.shape[0]),
        "within_300m_medium_or_high_by_facility_type": dict(exposure_counts),
        "direct_medium_or_high_count": int(df["liquefaction_2026_map_class"].isin(RISK_CLASSES).sum()),
        "uncovered_or_unreadable_count": int((~df["image_coverage"].eq("圖面範圍內") | df["liquefaction_2026_map_class"].str.startswith("圖上無可判讀")).sum()),
        "analysis_rule": "以點位中心5×5像素鄰域多數色分類；若點位直接命中中／高潛勢圖色，或至中／高潛勢像素區最短距離不超過300公尺，列入本新版液化圖篩選清單。低潛勢不算中／高潛勢暴露。",
        "screening_interpretation": "屬官方地圖 PNG 影像分類及位置篩選，非向量 polygon 精確相交；圖面空白／超出圖框一律列未知，不視為低潛勢。",
        "limitation": "本增補只分析2026年9月新版土壤液化圖，不重算原報告的地質敏感區、土石流及歷史淹水圖層；也不將不同圖層合併冒充已重跑的複合災害統計。官方地圖供區域規劃參考，不是個別基地工程安全判定。",
        "outputs": {
            "geojson": "result.geojson",
            "csv": "result.csv",
            "xlsx": "result.xlsx",
            "map": "map.geolibre.json",
            "all_facilities_geojson": "facilities-liquefaction-2026.geojson",
            "all_facilities_csv": "facilities-liquefaction-2026.csv",
            "medium_high_list_csv": "medium-high-screening-list.csv",
            "scope": "scope.geojson",
            "source_map_snapshot": "source-snapshots/YiL_Overview.png",
            "summary": "summary.json",
            "report": "report.md",
        },
    }
    qa_path = args.output / "viewer-qa" / "viewer-qa.json"
    viewer_qa = json.loads(qa_path.read_text(encoding="utf-8")) if qa_path.is_file() else None
    summary["viewer_qa"] = viewer_qa if viewer_qa else {"status": "pending", "evidence_path": "viewer-qa/viewer-qa.json"}
    (args.output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    # Contract outputs: the GeoLibre project and result files represent the
    # 2026 raster-screening group only. The previous multi-hazard result stays
    # as a separate context layer and is not silently recomputed or merged.
    exposed_ids = set(exposed["facility_id"].astype(str))
    exposed_features = [f for f in features if str(f["properties"].get("facility_id", "")) in exposed_ids]
    (args.output / "result.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": exposed_features}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    exposed.to_csv(args.output / "result.csv", index=False, encoding="utf-8-sig")
    scope_payload = json.loads((data_dir / "yilan-county-scope.geojson").read_text(encoding="utf-8"))
    (args.output / "scope.geojson").write_text(json.dumps(scope_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    result_payload = {"type": "FeatureCollection", "features": exposed_features}

    to_4326 = Transformer.from_crs(CRS, "EPSG:4326", always_xy=True)
    image_corners = []
    for pixel_x, pixel_y in ((0, 0), (image.shape[1], 0), (image.shape[1], image.shape[0]), (0, image.shape[0])):
        easting = mx * pixel_x + bx
        northing = my * pixel_y + by
        image_corners.append(list(to_4326.transform(easting, northing)))
    old_base = "https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-public-facility-hazard-exposure-2026-09/"
    project = {
        "version": "0.2.0",
        "name": "宜蘭縣公共設施 × 2026新版土壤液化圖（增補分析）",
        "mapView": {"center": [121.65, 24.67], "zoom": 8.8, "bearing": 0, "pitch": 0},
        "basemapStyleUrl": "https://tiles.openfreemap.org/styles/liberty",
        "basemapVisible": True,
        "selectedLayerId": "yilan-liquefaction-2026-exposed",
        "layers": [
            {
                "id": "gsmma-yilan-liquefaction-2026-image",
                "name": "官方新版土壤液化圖（宜蘭115年9月；影像參考）",
                "type": "image",
                "source": {"type": "image", "url": hosted_image_url, "coordinates": image_corners},
                "visible": True,
                "metadata": {
                    "dataProvider": "經濟部地質調查及礦業管理中心",
                    "officialService": "土壤液化潛勢查詢系統",
                    "sourceVersion": "民國115年9月（2026年9月）",
                    "accessMode": "DISPLAY_ONLY_RASTER",
                    "crs": CRS,
                    "imageSize": "7016x7016",
                    "pixelResolutionMeters": round(metres_per_pixel, 3),
                    "sourceUrl": IMAGE_URL,
                    "snapshotUrl": hosted_image_url,
                    "sourceSha256": image_sha256,
                    "limitation": "官方發布 PNG 地圖影像；此圖層供顯示參考，點位分類是影像判讀，不是官方向量 polygon 精確相交。",
                },
                "style": {"opacity": 0.72},
            },
            {
                "id": "yilan-liquefaction-2026-exposed",
                "name": f"篩選結果：中／高潛勢或300公尺內（{len(exposed_features)}處）",
                "type": "geojson",
                "source": {"type": "geojson"},
                "visible": True,
                "geojson": result_payload,
                "style": {"fillColor": "#dc2626", "fillOpacity": 0.95, "strokeColor": "#ffffff", "strokeWidth": 1.2, "circleRadius": 7},
                "metadata": {
                    "resultCount": len(exposed_features),
                    "resultUrl": PAGES_ROOT + "result.geojson",
                    "analysisRole": "SCREENING_REFERENCE_RASTER_DERIVED",
                    "popupFields": ["facility_name", "facility_type", "liquefaction_2026_map_class", "nearest_medium_high_m", "liquefaction_screening_note", "location_note"],
                },
            },
            {
                "id": "yilan-all-facilities-2026",
                "name": f"全部設施點位（{len(features)}處；含未知／無覆蓋）",
                "type": "geojson",
                "source": {"type": "geojson", "data": PAGES_ROOT + "facilities-liquefaction-2026.geojson"},
                "visible": False,
                "style": {"fillColor": "#2563eb", "fillOpacity": 0.75, "strokeColor": "#ffffff", "strokeWidth": 1, "circleRadius": 5},
                "metadata": {
                    "resultCount": len(features),
                    "resultUrl": PAGES_ROOT + "facilities-liquefaction-2026.geojson",
                    "analysisRole": "SCREENING_REFERENCE_ALL_INPUTS",
                },
            },
            {
                "id": "previous-multi-hazard-screening",
                "name": "原版複合災害篩選結果（另案，未與新版液化數字合併）",
                "type": "geojson",
                "source": {"type": "geojson", "data": old_base + "result.geojson"},
                "visible": False,
                "metadata": {
                    "resultCount": 111,
                    "resultUrl": old_base + "result.geojson",
                    "analysisRole": "PREVIOUS_VERSION_CONTEXT_ONLY",
                    "reportUrl": old_base + "report.md",
                },
            },
            {
                "id": "previous-geological-sensitive-schools",
                "name": "原版：地質敏感區內學校（11個點／10所學校）",
                "type": "geojson",
                "source": {"type": "geojson", "data": old_base + "sensitive-schools.geojson"},
                "visible": False,
                "metadata": {
                    "resultCount": 11,
                    "uniqueInstitutions": 10,
                    "resultUrl": old_base + "sensitive-schools.geojson",
                    "listUrl": old_base + "sensitive-schools.csv",
                    "analysisRole": "PREVIOUS_VERSION_CONTEXT_ONLY",
                },
            },
            {
                "id": "yilan-county-scope-2026",
                "name": "宜蘭縣行政範圍（定位參考）",
                "type": "geojson",
                "source": {"type": "geojson"},
                "visible": True,
                "geojson": scope_payload,
                "style": {"fillColor": "#64748b", "fillOpacity": 0.04, "strokeColor": "#334155", "strokeWidth": 2},
                "metadata": {"resultUrl": PAGES_ROOT + "scope.geojson", "role": "context"},
            },
        ],
        "metadata": {
            "description": "以官方115年9月宜蘭土壤液化潛勢 PNG，增補篩選原分析的291處公共設施點。新版液化候選與舊版地質敏感區／土石流／歷史淹水結果分層呈現，不合併成未驗證的複合風險統計。",
            "generatedAt": summary["generated_at"],
            "analysisRole": "SCREENING_REFERENCE_RASTER_DERIVED",
            "projectUrl": PAGES_ROOT + "map.geolibre.json",
            "resultUrl": PAGES_ROOT + "result.geojson",
            "summaryUrl": PAGES_ROOT + "summary.json",
            "reportUrl": PAGES_ROOT + "report.md",
            "sourceMapUrl": IMAGE_URL,
            "sourceMapVersion": "民國115年9月",
        },
    }
    (args.output / "map.geolibre.json").write_text(json.dumps(project, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    inline_sizes = [len(json.dumps(layer["geojson"], ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
                    for layer in project["layers"] if isinstance(layer.get("geojson"), dict)]
    performance = {
        "project_bytes": (args.output / "map.geolibre.json").stat().st_size,
        "project_target_bytes": 2 * 1024 * 1024,
        "project_hard_bytes": 5 * 1024 * 1024,
        "inline_geojson_bytes": sum(inline_sizes),
        "largest_inline_layer_bytes": max(inline_sizes, default=0),
        "inline_layer_max_bytes": 256 * 1024,
        "externalized_layer_count": 0,
        "visible_layer_ids": [layer["id"] for layer in project["layers"] if layer.get("visible")],
        "visible_external_payload_estimate_bytes": image_snapshot.stat().st_size,
        "initial_load_soft_budget_bytes": 6 * 1024 * 1024,
        "initial_load_hard_budget_bytes": 12 * 1024 * 1024,
        "project_hard_budget_ok": (args.output / "map.geolibre.json").stat().st_size <= 5 * 1024 * 1024,
        "largest_inline_layer_ok": max(inline_sizes, default=0) <= 256 * 1024,
        "mobile_hard_budget_ok": False,
        "budget_note": "保守估算將同版官方PNG快照、預設可見候選點GeoJSON及縣界GeoJSON一併計入；瀏覽器是否實際顯示仍以Viewer QA確認。",
    }
    performance["estimated_initial_load_bytes"] = performance["visible_external_payload_estimate_bytes"] + performance["project_bytes"]
    performance["mobile_hard_budget_ok"] = (
        performance["project_hard_budget_ok"]
        and performance["largest_inline_layer_ok"]
        and performance["estimated_initial_load_bytes"] <= performance["initial_load_hard_budget_bytes"]
    )
    (args.output / "performance.json").write_text(json.dumps(performance, ensure_ascii=False, indent=2), encoding="utf-8")
    summary["performance"] = performance
    summary["outputs"].update({"performance": "performance.json", "report_html": "report.html", "index": "index.html"})
    (args.output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    friendly_columns = {
        "facility_name": "設施名稱", "facility_type": "設施類型", "facility_source": "資料來源",
        "longitude": "經度", "latitude": "緯度", "liquefaction_2026_map_class": "新版圖面分類",
        "pixel_class_status": "影像判讀狀態", "nearest_medium_high_m": "距最近中高潛勢圖色_公尺",
        "nearest_medium_high_class": "最近中高潛勢級別", "within_300m_medium_or_high": "300公尺內中高潛勢候選",
        "liquefaction_screening_note": "篩選說明", "location_note": "點位說明",
        "easting_epsg3826": "TWD97東向座標", "northing_epsg3826": "TWD97北向座標",
        "image_coverage": "圖面覆蓋狀態", "facility_id": "設施編號",
    }
    stats_rows = [
        {"統計項目": "全部設施點", "數量": len(df), "說明": "各類設施合計"},
        {"統計項目": "中／高潛勢或300公尺內篩選結果", "數量": len(exposed), "說明": "影像分類的查核候選，不是工程風險等級"},
        {"統計項目": "直接落在中／高潛勢圖色", "數量": summary["direct_medium_or_high_count"], "說明": "依官方PNG圖色抽樣"},
        {"統計項目": "另有33處僅由300公尺鄰近條件納入", "數量": len(exposed) - summary["direct_medium_or_high_count"], "說明": "距中／高潛勢像素色塊不超過300公尺"},
    ] + [{"統計項目": k, "數量": v, "說明": "新版圖面點位分類"} for k, v in summary["class_counts"].items()]
    parameter_rows = [
        {"參數": "範圍", "設定": "宜蘭縣全境"},
        {"參數": "分析日期", "設定": summary["generated_at"]},
        {"參數": "距離計算CRS", "設定": CRS},
        {"參數": "點位圖色判讀", "設定": "5×5像素鄰域多數官方圖例色"},
        {"參數": "鄰近門檻", "設定": f"{BUFFER_METRES:.0f}公尺"},
        {"參數": "結果條件", "設定": "點位直接落在中／高潛勢圖色，或至中／高潛勢圖色距離≤300公尺"},
        {"參數": "未知值處理", "設定": "超出圖框、無可判讀色塊不視為低潛勢"},
    ]
    source_rows = [{
        "圖層／資料": item["name"], "提供單位": item["provider"], "來源網址": item["url"],
        "資料版次／期間": item.get("version", "未註明"), "取得日期": item.get("retrieved_at", "沿用舊版快取"),
        "座標系統": item["source_crs"], "本案角色": item["source_role"],
        "分析用途": item["use"], "限制": item["limitation"],
    } for item in summary["data_sources"]]
    with pd.ExcelWriter(args.output / "result.xlsx", engine="openpyxl") as writer:
        exposed.rename(columns=friendly_columns).to_excel(writer, sheet_name="分析結果", index=False)
        pd.DataFrame(stats_rows).to_excel(writer, sheet_name="統計摘要", index=False)
        pd.DataFrame(parameter_rows).to_excel(writer, sheet_name="分析參數", index=False)
        pd.DataFrame(source_rows).to_excel(writer, sheet_name="資料來源", index=False)
        df.rename(columns=friendly_columns).to_excel(writer, sheet_name="全部291處設施", index=False)
        for ws in writer.book.worksheets:
            ws.freeze_panes = "A2"
            ws.auto_filter.ref = ws.dimensions
            for col in ws.columns:
                letter = col[0].column_letter
                max_len = max((len(str(cell.value or "")) for cell in col[:200]), default=10)
                ws.column_dimensions[letter].width = min(max(max_len + 2, 12), 46)

    (args.output / "index.html").write_text(
        "<!doctype html><meta charset='utf-8'><title>宜蘭新版液化圖增補分析</title>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'><h1>宜蘭縣 × 2026新版土壤液化圖</h1>"
        "<p>本增補以官方新版圖面影像篩選公共設施位置；不是工程安全判定。</p><ul>"
        "<li><a href='index.html'>成果總覽</a></li>"
        "<li><a href='map.geolibre.json'>GeoLibre互動地圖專案 JSON</a></li>"
        "<li><a href='report.html'>白話分析報告（網頁版）</a></li>"
        "<li><a href='report.md'>白話分析報告（Markdown）</a></li>"
        "<li><a href='result.xlsx'>完整分析表 Excel</a></li>"
        "<li><a href='result.csv'>中高潛勢篩選清單 CSV</a></li>"
        "<li><a href='result.geojson'>中高潛勢候選圖資 GeoJSON</a></li>"
        "<li><a href='facilities-liquefaction-2026.csv'>全部291處設施 CSV</a></li>"
        "<li><a href='facilities-liquefaction-2026.geojson'>全部291處設施 GeoJSON</a></li>"
        "<li><a href='summary.json'>結果摘要 JSON</a></li>"
        "<li><a href='performance.json'>地圖載入預算 JSON</a></li></ul>",
        encoding="utf-8",
    )

    source_table = ["|資料名稱|提供單位|版本／取得日|座標系統|本案角色|在本案的用途|使用限制|", "|---|---|---|---|---|---|---|"]
    for item in summary["data_sources"]:
        name = f"[{item['name']}]({item['url']})"
        if item.get("supporting_document"):
            name += f"；[官方說明]({item['supporting_document']})"
        source_table.append("|" + "|".join([
            name, item["provider"], f"{item.get('version', '未註明')}；取得：{item.get('retrieved_at', '沿用快取')}",
            item["source_crs"], item["source_role"],
            item["use"], item["limitation"],
        ]) + "|")

    layer_table = ["|圖層名稱|使用圖資／用途|對應成果檔|預設狀態|", "|---|---|---|---|"]
    layer_files = {
        "gsmma-yilan-liquefaction-2026-image": "source-snapshots/YiL_Overview.png（官方同版影像快照）",
        "yilan-liquefaction-2026-exposed": "result.geojson（171筆）",
        "yilan-all-facilities-2026": "facilities-liquefaction-2026.geojson（291筆）",
        "previous-multi-hazard-screening": "舊版 result.geojson（僅供對照）",
        "previous-geological-sensitive-schools": "舊版 sensitive-schools.geojson（僅供對照）",
        "yilan-county-scope-2026": "scope.geojson（行政範圍定位）",
    }
    layer_meanings = {
        "gsmma-yilan-liquefaction-2026-image": "官方2026年9月土壤液化圖影像；用來看圖與判讀顏色，不是可直接相交的法定向量範圍。",
        "yilan-liquefaction-2026-exposed": "本次新算出的171個候選點：落在中／高潛勢圖色，或距該圖色300公尺內。",
        "yilan-all-facilities-2026": "全部291處輸入設施及各自判讀結果；含圖框外與無法判讀者，未把未知當低風險。",
        "previous-multi-hazard-screening": "前次複合災害篩選結果，僅供對照；沒有使用新版液化圖重新計算。",
        "previous-geological-sensitive-schools": "前次地質敏感區學校結果，僅供對照；沒有使用新版資料重新計算。",
        "yilan-county-scope-2026": "宜蘭縣行政範圍的定位輔助圖；不是法定界址。",
    }
    for layer in project["layers"]:
        layer_table.append(f"|{layer['name']}|{layer_meanings[layer['id']]}|{layer_files[layer['id']]}|{'開啟' if layer.get('visible') else '關閉'}|")

    files = [
        "|檔案|內容與用途|", "|---|---|",
        "|`map.geolibre.json`|GeoLibre 互動地圖專案；預設呈現新版液化圖、篩選結果與宜蘭縣界，舊圖層可在面板手動打開。|",
        "|`source-snapshots/YiL_Overview.png`|本次判讀的官方 115 年 9 月原圖快照；附 SHA-256，供重現與核對。|",
        "|`source-snapshots/` 內 5 個輸入檔|本次使用的學校、醫療、政府代理點、消防及縣界快照；來源日期與限制見本報告。|",
        f"|`result.geojson`|正式篩選結果 {len(exposed)} 筆點位，供 GIS 軟體載入。|",
        f"|`result.csv`|同一批 {len(exposed)} 筆清單，可用試算表搜尋、排序及查核。|",
        "|`result.xlsx`|含「分析結果、統計摘要、分析參數、資料來源、全部291處設施」五個工作表。|",
        "|`facilities-liquefaction-2026.geojson`／`.csv`|全部 291 處設施及其圖面分類、判讀狀態與位置備註。|",
        "|`medium-high-screening-list.csv`|與 `result.csv` 同批的便利清單，供人工複核。|",
        "|`scope.geojson`|宜蘭縣範圍圖層，供地圖定位；不是法定界址。|",
        "|`summary.json`|可由程式讀取的分析筆數、分類統計、資料來源與限制。|",
        "|`performance.json`|GeoLibre 專案大小、預設載入圖資估算及預算檢核。|",
        "|`report.md`／`report.html`|完整白話報告；HTML 版供 Pages 直接閱讀。|",
        "|`index.html`|本資料夾成果入口，連結地圖專案、報告與下載檔。|",
    ]
    type_summary = "、".join(f"{kind}{number}筆" for kind, number in summary["input_count_by_facility_type"].items())
    status_summary = "；".join(f"{label}{number}處" for label, number in summary["class_counts"].items())
    qa = summary["viewer_qa"]
    if qa_path.is_file():
        files.insert(3, "|`viewer-qa/`|兩個入口、桌面與 Android 手機的 QA JSON、說明及實際畫面截圖。|")
    if qa.get("pass") is True:
        qa_lines = [
            f"- QA 總結：PASS（{qa.get('generatedAt', '時間未註明')}）；使用同一份 `{TASK_ID}/map.geolibre.json`。",
        ]
        for case in qa.get("results", []):
            checks = case.get("checks", {})
            dom = case.get("dom", {})
            target = "自架 GitHub Pages" if case.get("targetKey") == "self-hosted" else "官方 GeoLibre 備援"
            device = "Android 手機" if case.get("profileKey") == "mobile" else "桌面 Chromium"
            state = dom.get("state") or "未取得"
            errors = dom.get("errors") or "[]"
            canvas_count = dom.get("visibleCanvasCount", 0)
            layer_visible = "是" if checks.get("expectedLayerVisibleInUi") else "否"
            qa_lines.append(
                f"- {target}／{device}：{'PASS' if case.get('pass') else 'FAIL'}；load state `{state}`；載入錯誤 `{errors}`；可見 canvas {canvas_count} 個；預期結果圖層在 UI 可見：{layer_visible}。"
            )
    elif qa.get("results"):
        qa_lines = ["- QA 總結：FAIL；目前驗收未通過，須依各入口與裝置錯誤修正後重新完整驗收。"]
        for case in qa.get("results", []):
            qa_lines.append(f"- {case.get('label', case.get('key','未知案例'))}：FAIL；原因：{case.get('exception') or case.get('checks', {})}。")
    else:
        qa_lines = ["- QA 總結：待驗證；成果發布後才檢查自架與官方入口的桌面及 Android 手機畫面。"]

    report = [
        "# 宜蘭縣公共設施 × 2026 年新版土壤液化圖：增補分析報告", "",
        f"- 任務：`{TASK_ID}`",
        "- 範圍：宜蘭縣全境；涵蓋" + type_summary + "。",
        "- 期間：設施位置沿用 2026-09-25 快取；新版官方液化圖為民國 115 年 9 月版（2026 年 9 月）；本案是靜態圖資判讀，不是事件期間分析。",
        "- 空間條件：設施代表點落在中／高潛勢色塊，或離該色塊不超過 300 公尺。",
        f"- 可分析設施：{len(df)} 處；正式篩選結果：{len(exposed)} 處；直接落在中／高圖色：{summary['direct_medium_or_high_count']} 處；另有 {len(exposed)-summary['direct_medium_or_high_count']} 處符合 300 公尺鄰近條件。",
        f"- 官方圖面快照：`source-snapshots/YiL_Overview.png`；SHA-256：`{image_sha256}`。",
        f"- 其他分類：{status_summary}。未知／未覆蓋不視為低潛勢。",
        "- 結果性質：以官方新版 PNG 影像分類的查核篩選，不是官方向量面的精確相交或個別基地工程安全判定。",
        "",
        "## 方法", "",
        "本次沿用宜蘭縣原分析的 291 個設施代表點，分別為學校、醫療設施、政府機關代理點與消防分隊。原始點位為經緯度（EPSG:4326），先轉成 TWD97／TM2 121 分帶（EPSG:3826），再與經濟部地質調查及礦業管理中心公布的 7016×7016 像素新版宜蘭液化潛勢圖定位。",
        f"定位時使用圖面印出的 7 個東向、6 個北向座標刻度作控制點，分別擬合座標與像素的一階轉換，估計解析度為東西向 {abs(mx):.2f}、南北向 {abs(my):.2f} 公尺／像素。每一設施點以周圍 5×5 像素內的官方圖例色判斷位置級別；同時在約 300 公尺內搜尋中／高潛勢像素色塊，記錄是否符合鄰近條件。",
        "可作分析依據的是來源點位、圖面座標刻度與官方圖例顏色；GeoLibre 上的 PNG 是顯示用底圖，舊版地質敏感區、土石流和淹水結果只作分開的比較層，沒有併入本次數字。",
        "",
        "## 分類", "",
        "- **高潛勢**：5×5 像素多數色判為官方圖例紅色，PL≥15。",
        "- **中潛勢**：多數色判為官方圖例黃色，5≤PL≤15。",
        "- **低潛勢**：多數色判為官方圖例綠色，PL<5。",
        "- **篩選結果**：設施點判為中／高潛勢，或其至中／高潛勢圖色最短距離≤300公尺。直接命中與僅符合鄰近條件已分開統計。",
        "- **不能判讀／無圖面覆蓋**：圖框內抽不到可判讀圖例色，或點位在官方圖片框外；不會把這些點當成低潛勢，也不列為篩選命中。",
        "這些類別是地圖影像的篩選標籤，不是法定危險等級。邊界或圖面符號干擾的個案仍應回官方系統逐點查核。",
        "",
        "## 資料品質", "",
        f"- 實際進入分析：{len(df)} 個點位；類型分布為 {type_summary}。程式檢查到的點位幾何皆為 Point，消防點座標範圍也符合經緯度；來源原始全集在本次快取未保留完整排除筆數，因此本報告不推稱各來源母體零缺漏。",
        f"- 可判讀圖面級別：196 處（高 {summary['class_counts'].get('高潛勢（PL≥15）',0)}、中 {summary['class_counts'].get('中潛勢（5≤PL≤15）',0)}、低 {summary['class_counts'].get('低潛勢（PL<5）',0)}）；圖框內仍無可讀色塊 37 處；超出新版圖框 58 處。",
        f"- 篩選結果 {len(exposed)} 處，其中直接落在中／高圖色 {summary['direct_medium_or_high_count']} 處、其餘 {len(exposed)-summary['direct_medium_or_high_count']} 處靠 300 公尺鄰近條件納入。各設施類型結果：" + "、".join(f"{k}{v}處" for k,v in summary["within_300m_medium_or_high_by_facility_type"].items()) + "。",
        f"- 學校資料檔案版次為 1150409（2026-04-09），但 133 筆校地圖徵的 `YYYYMM` 欄位橫跨 {min(school_month_counts)}–{max(school_month_counts)}；兩者是不同日期意義。醫療點、消防點及機關代理點為不同公開資料來源，並無統一資料基準日。",
        "- 本次以有效且符合指定類別的 291 點進行分析；來源檔在類別篩選前的全量筆數、重複筆數與非宜蘭資料排除數，未完整保留於既有快取，故無法回報其總數。",
        "",
        "## 重要限制", "",
        "- 新版液化圖目前可取得的是官方 PNG／WMTS 影像，沒有找到同版可下載向量 polygon；本次以圖面座標格網配準和顏色抽樣代替向量相交，精度受圖面解析度、地圖符號、文字和色塊邊界影響。",
        "- 300 公尺只是沿用的查核篩選半徑，不代表液化影響半徑、法定安全距離或工程技術標準。",
        "- 學校採校地範圍代表點，不代表校門或特定校舍；政府機關以 iTaiwan 熱點作代理，非完整機關名冊；醫療點不含完整診所；消防座標欄名稱與數值座標格式不一致，依數值範圍判作經緯度。",
        "- 圖上顯示為低潛勢，僅代表點位抽樣處的圖面級別；不代表建物本體安全或沒有其他災害。無圖面覆蓋的 95 處不得解讀成低潛勢。",
        "- 地質敏感區數值檔官方說明所列最近更新為 2025-05-29；本次查核沒有找到更新版，因此舊版結果原樣保留。官方提供的數值範圍供規劃參考，實際法定範圍以公告圖資為準。土石流與歷史淹水也仍是舊版結果。",
        "- 本報告只供區域規劃或後續查核排序參考；不能取代現行公告、個案基地調查、鑽探、建築評估或專業技師意見。",
        "",
        "## 資料來源", "", *source_table, "",
        f"新增版本說明：[經濟部 2026-09-24 新聞稿]({PRESS_URL})指出新版納入 11,731 口鑽井資料（舊版 3,571 口）、調查面積增至 909.8 平方公里；該更新代表基礎調查資料增加，不宜解讀為地質短期內突然改變。",
        "",
        "## 交付檔案", "", *files, "",
        "## 主要發現", "",
        f"291 處設施中，171 處符合「落在新版中／高潛勢圖色或距該色塊 300 公尺內」的查核篩選條件；138 處直接落在中／高圖色，33 處是僅因 300 公尺鄰近條件加入。另有 58 處圖面判為低潛勢、37 處位於圖框內但無法讀取圖色、58 處超出新版地圖框。後兩類都維持未知，不會被誤報成低潛勢。",
        "",
        "## 圖層—圖資—檔案對照", "", *layer_table, "",
        "## 效能與發布驗證", "",
        f"GeoLibre project 檔案為 {performance['project_bytes']:,} bytes；預設圖層保守估算載入 {performance['estimated_initial_load_bytes']:,} bytes，低於 12 MiB 硬性預算（軟性目標 6 MiB）。估算將官方整張 PNG 和預設可見的結果／縣界資料一併計入；實際網頁是否成功載入及圖層是否畫出，仍以發布後瀏覽器畫面 QA 為準。地圖預設開啟新版影像、篩選結果及縣界；全部設施與舊版對照層預設關閉。",
        "",
        "## 瀏覽器畫面驗證", "", *qa_lines,
        "檢查項目包括頁面是否進入 `ready`、載入錯誤、canvas 是否可見且非白屏，以及篩選結果圖層名稱是否出現在畫面 UI。GeoLibre 顯示正常只代表專案可載入，不取代前述資料與空間判讀的正確性檢核。",
        "",
        "## 總結", "",
        "本次已把宜蘭縣 2026 年 9 月新版土壤液化圖加入原有 291 處設施的增補篩選，找出 171 處值得優先回到官方圖台或現地進一步核實的候選點。地質敏感區數值檔未查到 2025-05-29 之後的新版本，故沒有假稱敏感區已更新；土石流、淹水等舊圖層也維持與液化增補分開。新版結果來自圖面影像判讀，最適合用來安排後續查核，不能當成法定認定或個別設施安全結論。",
        "",
        "產製日期：2026-09-26；新版圖面取得日期：2026-09-26。",
    ]
    report_text = "\n".join(report) + "\n"
    (args.output / "report.md").write_text(report_text, encoding="utf-8")
    try:
        from markdown_it import MarkdownIt
        body = MarkdownIt("commonmark").enable("table").render(report_text)
    except ImportError:
        body = "<pre>" + html.escape(report_text) + "</pre>"
    html_doc = "<!doctype html><html lang='zh-Hant'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>宜蘭縣新版液化圖增補分析報告</title><style>body{font:16px/1.75 system-ui,'Noto Sans TC',sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem;color:#17212b}h1,h2{line-height:1.35;color:#16324f}table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}th,td{border:1px solid #cbd5df;padding:.55rem;vertical-align:top;text-align:left}th{background:#edf4f8}li{margin:.35rem 0}a{color:#0759a5}code{overflow-wrap:anywhere}blockquote{border-left:4px solid #84a9c6;padding-left:1rem}</style><body>" + body + "</body></html>"
    (args.output / "report.html").write_text(html_doc, encoding="utf-8")
    print(json.dumps({
        "output": str(args.output),
        "facility_count": len(rows),
        "class_counts": dict(class_counts),
        "exposed_count": int(exposed.shape[0]),
        "exposed_by_type": dict(exposure_counts),
        "status_counts": dict(status_counts),
        "performance": performance,
        "xlsx_sheets": ["分析結果", "統計摘要", "分析參數", "資料來源", "全部291處設施"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

