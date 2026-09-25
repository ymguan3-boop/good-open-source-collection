#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import json, os, re, html, tempfile
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse
import xml.etree.ElementTree as ET

import numpy as np
import pandas as pd
import requests
import geopandas as gpd
from shapely.geometry import Point, LineString, mapping
from shapely.ops import unary_union
from pyproj import Transformer

TASK_ID = "yilan-road-repeat-construction-audit-2026-09"
COUNTY = "宜蘭縣"
START_DATE = pd.Timestamp("2023-09-25")
END_DATE = pd.Timestamp("2026-09-25 23:59:59")
BUFFER_M = 50.0
REPEAT_MIN = 2
SHORT_REPEAT_DAYS = 180
ANALYSIS_CRS = "EPSG:3826"
WEB_CRS = "EPSG:4326"
PAGES_ROOT = "https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/"
USER_AGENT = "GeoLibreAuditSkill/1.0 (+https://github.com/ymguan3-boop/good-open-source-collection)"

SOURCE_PAGES = [
    "https://mntengmgt.e-land.gov.tw/YilanDigweb/Download/XML/dig.xml",
    "http://mntengmgt.e-land.gov.tw/YilanDigweb/Download/XML/dig.xml",
    "https://odportal.tw/dataset/DSNTMGUM",
    "https://cdn.odportal.tw/dataset/DSNTMGUM",
    "https://mntengmgt.e-land.gov.tw/YilandSvc/",
]
OVERPASS = "https://overpass-api.de/api/interpreter"
YILAN_BBOX = (24.25, 121.25, 25.08, 122.08)  # south, west, north, east
YILAN_PLACES = ("宜蘭縣","宜蘭市","羅東鎮","蘇澳鎮","頭城鎮","礁溪鄉","壯圍鄉","員山鄉","冬山鄉","五結鄉","三星鄉","大同鄉","南澳鄉")

PIPE_KW = ("管線","管路","自來水","台水","電力","台電","電信","中華電信","瓦斯","天然氣","污水","雨水","下水道","寬頻","纜線","輸油")
MAINT_KW = ("養護","道路改善","路面改善","刨鋪","銑鋪","鋪面","瀝青","AC路面","路面修復","路平","修補","重鋪")
DATE_KEYS = ("日期","時間","起日","迄日","開工","完工","施工","核准","begin","start","end","date","ABE","AEN","CBE","CEN","CL_DA")
ID_KEYS = ("案件編號","許可證","申挖","CASE_ID","AC_NO","編號","ID","id")
TITLE_KEYS = ("案件名稱","工程名稱","施工名稱","計畫名稱","CONST_NAME","constname","標題","名稱","project")
LOC_KEYS = ("施工地點","挖掘地點","施工位置","挖掘位置","LOCATION","digsite","road","地址","地點","路段")
UNIT_KEYS = ("申請單位","施工單位","管線單位","主辦單位","承辦單位","UN_NA","constructionunit","機關","單位")
PURPOSE_KEYS = ("施工原因","挖掘原因","用途","PURP","工程類別","案件類別","類別","目的")


def now_utc():
    return datetime.now(timezone.utc).isoformat()


def norm_key(v):
    return re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", "", str(v or "")).lower()


def pick(row, candidates):
    nk = {norm_key(k): k for k in row}
    for cand in candidates:
        c = norm_key(cand)
        for kk, original in nk.items():
            if c and (kk == c or c in kk or kk in c):
                value = row.get(original)
                if value not in (None, ""):
                    return str(value).strip()
    return ""


def parse_date(v):
    s = str(v or "").strip()
    if not s:
        return pd.NaT

    # Microsoft JSON / Unix timestamps.
    m = re.search(r"/?Date\((\d{10,13})", s, re.I)
    if m:
        raw = int(m.group(1))
        unit = "ms" if len(m.group(1)) >= 13 else "s"
        return pd.to_datetime(raw, unit=unit, errors="coerce")
    if re.fullmatch(r"\d{13}", s):
        return pd.to_datetime(int(s), unit="ms", errors="coerce")
    if re.fullmatch(r"1[5-9]\d{8}", s):
        return pd.to_datetime(int(s), unit="s", errors="coerce")

    # Compact Gregorian / ROC calendar formats.
    digits = re.sub(r"\D", "", s)
    if re.fullmatch(r"(19|20)\d{6}", digits[:8] if len(digits) >= 8 else ""):
        base = digits[:8]
        tail = digits[8:14]
        fmt = "%Y%m%d%H%M%S" if len(tail) == 6 else "%Y%m%d"
        value = base + (tail if len(tail) == 6 else "")
        return pd.to_datetime(value, format=fmt, errors="coerce")
    if re.fullmatch(r"1\d{6}", digits[:7] if len(digits) >= 7 else ""):
        roc = digits[:7]
        y, mo, da = int(roc[:3]) + 1911, int(roc[3:5]), int(roc[5:7])
        tail = digits[7:13]
        value = f"{y:04d}{mo:02d}{da:02d}" + (tail if len(tail) == 6 else "")
        fmt = "%Y%m%d%H%M%S" if len(tail) == 6 else "%Y%m%d"
        return pd.to_datetime(value, format=fmt, errors="coerce")

    s = s.replace("年","-").replace("月","-").replace("日"," ").replace("/","-").replace(".","-")
    m = re.match(r"^\s*(1\d{2})-(\d{1,2})-(\d{1,2})(.*)$", s)
    if m:
        s = f"{int(m.group(1))+1911}-{int(m.group(2)):02d}-{int(m.group(3)):02d}{m.group(4)}"
    try:
        d = pd.to_datetime(s, errors="coerce")
        # Reject accidental parsing of identifiers outside the useful time domain.
        if not pd.isna(d) and pd.Timestamp("2000-01-01") <= d <= pd.Timestamp("2035-12-31"):
            return d
        return pd.NaT
    except Exception:
        return pd.NaT


def looks_like_date_value(v):
    s = str(v or "").strip()
    if not s:
        return False
    if re.search(r"/?Date\(\d{10,13}", s, re.I):
        return True
    if re.fullmatch(r"\d{7}|\d{8}|\d{10}|\d{13}|\d{14}", re.sub(r"\D", "", s)):
        d = parse_date(s)
        return not pd.isna(d)
    if re.search(r"(?:19|20)\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}", s):
        return True
    if re.search(r"1\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}", s):
        return True
    return False


def flatten_xml_records(text):
    root = ET.fromstring(text)
    rows = []
    candidates = []
    for elem in root.iter():
        children = list(elem)
        if children and all(len(list(c)) == 0 for c in children):
            d = {}
            for c in children:
                tag = c.tag.split("}")[-1]
                d[tag] = (c.text or "").strip()
            if len(d) >= 3:
                candidates.append(d)
    if candidates:
        maxkeys = max(len(x) for x in candidates)
        rows = [x for x in candidates if len(x) >= max(3, int(maxkeys*0.5))]
    if not rows:
        d = {}
        for e in root.iter():
            if len(list(e)) == 0 and (e.text or "").strip():
                d[e.tag.split("}")[-1]] = (e.text or "").strip()
        if d:
            rows = [d]
    return rows


def flatten_json(obj):
    rows = []
    if isinstance(obj, list):
        for x in obj:
            if isinstance(x, dict):
                rows.append({str(k): "" if v is None else str(v) if not isinstance(v,(dict,list)) else json.dumps(v,ensure_ascii=False) for k,v in x.items()})
    elif isinstance(obj, dict):
        for key in ("result","results","data","items","records","features"):
            if key in obj:
                val = obj[key]
                if key == "features" and isinstance(val,list):
                    for f in val:
                        if isinstance(f,dict):
                            p = dict(f.get("properties") or {})
                            if f.get("geometry") is not None:
                                p["_geojson_geometry"] = json.dumps(f["geometry"],ensure_ascii=False)
                            rows.append({str(k): "" if v is None else str(v) if not isinstance(v,(dict,list)) else json.dumps(v,ensure_ascii=False) for k,v in p.items()})
                else:
                    rows.extend(flatten_json(val))
        if not rows and obj:
            rows = [{str(k): "" if v is None else str(v) if not isinstance(v,(dict,list)) else json.dumps(v,ensure_ascii=False) for k,v in obj.items()}]
    return rows


def extract_urls(base, text):
    t = html.unescape(text).replace("\\/","/")
    urls = set()
    for m in re.findall(r'https?://[^"\'<>\s]+', t):
        urls.add(m.rstrip(");,"))
    for href in re.findall(r'href\s*=\s*["\']([^"\']+)["\']', t, flags=re.I):
        urls.add(urljoin(base, href))
    # Next.js / embedded JSON often contains escaped URL strings.
    try:
        m = re.search(r'<script[^>]+id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>', text, flags=re.S|re.I)
        if m:
            obj = json.loads(html.unescape(m.group(1)))
            def walk(x):
                if isinstance(x, dict):
                    for v in x.values(): walk(v)
                elif isinstance(x, list):
                    for v in x: walk(v)
                elif isinstance(x, str) and (x.startswith("http") or x.startswith("/")):
                    urls.add(urljoin(base, x))
            walk(obj)
    except Exception:
        pass
    return sorted(urls)


def fetch_candidate_rows(session):
    diagnostics = []
    candidates = []
    seen = set()
    queue = list(SOURCE_PAGES)
    for page in list(queue):
        try:
            timeout = 90 if "YilanDigweb/Download/XML/dig.xml" in page else 35
            r = session.get(page, timeout=timeout, allow_redirects=True)
            diagnostics.append({"url":page,"final_url":r.url,"status":r.status_code,"bytes":len(r.content),"content_type":r.headers.get("content-type","")})
            if r.ok:
                ct = r.headers.get("content-type","").lower()
                body = r.text
                if "xml" in ct or body.lstrip().startswith("<?xml") or re.match(r"^\s*<[^!hH]", body):
                    try:
                        rows = flatten_xml_records(body)
                        if len(rows) >= 2:
                            candidates.append((r.url, rows))
                    except Exception:
                        pass
                if "json" in ct or body.lstrip().startswith(("{","[")):
                    try:
                        rows = flatten_json(r.json())
                        if len(rows) >= 2:
                            candidates.append((r.url, rows))
                    except Exception:
                        pass
                for u in extract_urls(r.url, body):
                    lu = u.lower()
                    if any(x in lu for x in ("download","resource","dataset","snapshot",".xml",".json","opendata")):
                        if u not in seen and len(queue) < 90:
                            queue.append(u)
                            seen.add(u)
        except Exception as e:
            diagnostics.append({"url":page,"error":str(e)[:300]})
    # crawl discovered resource-like URLs only, bounded
    for u in queue[len(SOURCE_PAGES):]:
        try:
            timeout = 90 if "YilanDigweb/Download/XML/dig.xml" in u else 30
            r = session.get(u, timeout=timeout, allow_redirects=True)
            diagnostics.append({"url":u,"final_url":r.url,"status":r.status_code,"bytes":len(r.content),"content_type":r.headers.get("content-type","")})
            if not r.ok or len(r.content) < 100:
                continue
            body = r.text
            ct = r.headers.get("content-type","").lower()
            rows = []
            if "xml" in ct or body.lstrip().startswith("<?xml"):
                try: rows = flatten_xml_records(body)
                except Exception: rows = []
            elif "json" in ct or body.lstrip().startswith(("{","[")):
                try: rows = flatten_json(r.json())
                except Exception: rows = []
            if len(rows) >= 2:
                candidates.append((r.url, rows))
        except Exception as e:
            diagnostics.append({"url":u,"error":str(e)[:300]})
    if not candidates:
        return [], diagnostics, None
    # Prefer the candidate that looks most like road-work rows.
    def score(item):
        url, rows = item
        keys = " ".join(rows[0].keys()) if rows else ""
        sample = " ".join(" ".join(x.values()) for x in rows[:5])
        s = len(rows)
        if any(k in keys for k in ("挖掘","施工","案件","LOCATION","AC_NO","CASE_ID","座標","X","Y")): s += 5000
        if any(k in sample for k in ("道路","挖掘","施工","管線")): s += 3000
        # Prefer candidates that actually carry dates; a geometry-only service can
        # otherwise outrank the historical road-work table simply by having more rows.
        date_hits = 0
        for row in rows[:100]:
            for k, v in row.items():
                nk = norm_key(k)
                if any(t in nk for t in ("日期","時間","開工","完工","date","time","start","begin","end","finish","abe","aen","cbe","cen","clda")) or looks_like_date_value(v):
                    if not pd.isna(parse_date(v)):
                        date_hits += 1
                        break
        if date_hits:
            s += 8000 + date_hits * 20
        locality_text = " ".join(" ".join(map(str,row.values())) for row in rows[:80])
        yilan_hits = sum(locality_text.count(name) for name in YILAN_PLACES)
        if yilan_hits:
            s += 25000 + min(yilan_hits,100) * 100
        if any(bad in url.lower() for bad in ("data.ntpc.gov.tw","data.taipei","opendata.taichung")):
            s -= 50000
        if any(bad in locality_text for bad in ("新北市","臺北市","台北市","桃園市","臺中市","台中市","高雄市")) and not yilan_hits:
            s -= 25000
        if "e-land.gov.tw" in url.lower():
            s += 12000
        if "DSNTMGUM" in url: s += 1500
        return s
    ranked = sorted(candidates, key=score, reverse=True)
    print(json.dumps({
        "candidate_sources": [
            {
                "url": u,
                "rows": len(rs),
                "score": score((u,rs)),
                "sample": " ".join(" ".join(map(str,r.values())) for r in rs[:2])[:500]
            }
            for u,rs in ranked[:8]
        ]
    }, ensure_ascii=False))
    best = ranked[0]
    best_text = " ".join(" ".join(map(str,r.values())) for r in best[1][:100])
    if not any(name in best_text for name in YILAN_PLACES):
        raise RuntimeError("找到道路施工候選資料，但最高可信來源無法驗證為宜蘭縣資料；拒絕使用外縣市資料。候選來源已輸出至工作紀錄。")
    return best[1], diagnostics, best[0]


def classify_event(text):
    t = str(text or "")
    if any(k.lower() in t.lower() for k in PIPE_KW):
        return "管線工程"
    if any(k.lower() in t.lower() for k in MAINT_KW):
        return "道路養護工程"
    return "道路挖掘案件"


def pair_to_geom(a, b):
    # return geometry in ANALYSIS_CRS when pair resembles WGS84 or TWD97.
    if 120 <= a <= 123 and 21 <= b <= 26:
        return Point(float(a), float(b)), WEB_CRS
    if 120 <= b <= 123 and 21 <= a <= 26:
        return Point(float(b), float(a)), WEB_CRS
    if 100000 <= a <= 400000 and 2400000 <= b <= 2900000:
        return Point(float(a), float(b)), ANALYSIS_CRS
    if 100000 <= b <= 400000 and 2400000 <= a <= 2900000:
        return Point(float(b), float(a)), ANALYSIS_CRS
    return None, None


def geometry_from_row(row):
    # 1) GeoJSON geometry
    rawg = row.get("_geojson_geometry")
    if rawg:
        try:
            from shapely.geometry import shape
            g = shape(json.loads(rawg))
            return g, WEB_CRS, "geojson"
        except Exception:
            pass
    # 2) WKT
    for k,v in row.items():
        s = str(v or "")
        if re.search(r"\b(POINT|LINESTRING|POLYGON)\s*\(", s, re.I):
            try:
                from shapely import wkt
                g = wkt.loads(s[s.upper().find(re.search(r"(POINT|LINESTRING|POLYGON)",s,re.I).group(1)):])
                minx,miny,maxx,maxy = g.bounds
                crs = WEB_CRS if 119 < minx < 124 and 20 < miny < 27 else ANALYSIS_CRS
                return g, crs, "wkt"
            except Exception:
                pass
    # 3) keyed lon/lat or x/y
    vals = []
    for k,v in row.items():
        nk = norm_key(k)
        try:
            num = float(str(v).replace(",","").strip())
        except Exception:
            continue
        if any(t in nk for t in ("經度","longitude","lon","x座標","twd97x","xcoordinate","xcoord")):
            vals.append(("x",num,k))
        if any(t in nk for t in ("緯度","latitude","lat","y座標","twd97y","ycoordinate","ycoord")):
            vals.append(("y",num,k))
    xs = [x for typ,x,k in vals if typ=="x"]
    ys = [x for typ,x,k in vals if typ=="y"]
    for a in xs:
        for b in ys:
            g, crs = pair_to_geom(a,b)
            if g is not None: return g, crs, "xy_fields"
    # 4) coordinate pairs embedded in geometry/location-like strings
    for k,v in row.items():
        nk = norm_key(k)
        if not any(t in nk for t in ("座標","坐標","coord","poly","geom","location","位置","點位")):
            continue
        nums = []
        for token in re.findall(r"-?\d+(?:\.\d+)?", str(v or "")):
            try: nums.append(float(token))
            except Exception: pass
        pts, crs = [], None
        for i in range(0, len(nums)-1, 2):
            g, c = pair_to_geom(nums[i], nums[i+1])
            if g is not None:
                pts.append((g.x,g.y)); crs = c
        if len(pts) >= 2:
            return LineString(pts), crs, "coord_list"
        if len(pts) == 1:
            return Point(pts[0]), crs, "coord_list"
    return None, None, "missing"


def canonicalize_rows(rows, source_url):
    out = []
    for idx,row in enumerate(rows):
        title = pick(row, TITLE_KEYS)
        loc = pick(row, LOC_KEYS)
        unit = pick(row, UNIT_KEYS)
        purpose = pick(row, PURPOSE_KEYS)
        event_id = pick(row, ID_KEYS) or f"row-{idx+1}"
        # gather all plausible dates; use earliest as start and latest as end,
        # while prioritizing explicit start/end labels.
        dates = []
        starts, ends = [], []
        for k,v in row.items():
            nk = norm_key(k)
            explicit_date_key = any(norm_key(x) in nk for x in DATE_KEYS) or any(
                x in nk for x in ("sdate","edate","bdate","fdate","issued","permit","finish","closed","workfrom","workto","begtime","endtime")
            )
            if explicit_date_key or looks_like_date_value(v):
                d = parse_date(v)
                if not pd.isna(d):
                    dates.append(d)
                    if any(x in nk for x in ("起","開工","start","begin","abe","cbe","sdate","bdate","workfrom","begtime")):
                        starts.append(d)
                    if any(x in nk for x in ("迄","完工","end","finish","aen","cen","clda","edate","fdate","workto","closed")):
                        ends.append(d)
        start = min(starts) if starts else (min(dates) if dates else pd.NaT)
        end = max(ends) if ends else (max(dates) if dates else start)
        g, crs, geom_method = geometry_from_row(row)
        text = " ".join([title,loc,unit,purpose," ".join(str(v) for v in row.values())[:2000]])
        out.append({
            "event_id":str(event_id), "project_name":title, "location":loc, "unit":unit,
            "purpose":purpose, "event_type":classify_event(text), "start_date":start,
            "end_date":end, "geometry":g, "source_crs":crs, "geometry_method":geom_method,
            "source_url":source_url, "raw_fields":json.dumps(row,ensure_ascii=False)[:12000],
        })
    return out


def fetch_osm_roads(session):
    # Split Yilan into four tiles to avoid a single county-wide Overpass timeout.
    endpoints = ("https://overpass.kumi.systems/api/interpreter", OVERPASS)
    s,w,n,e = YILAN_BBOX
    mid_lat=(s+n)/2
    mid_lon=(w+e)/2
    tiles=[(s,w,mid_lat,mid_lon),(s,mid_lon,mid_lat,e),(mid_lat,w,n,mid_lon),(mid_lat,mid_lon,n,e)]
    by_id={}
    failures=[]
    for tile_no,(ts,tw,tn,te) in enumerate(tiles,1):
        query = f"""[out:json][timeout:90];way["highway"]["name"]({ts},{tw},{tn},{te});out tags geom;"""
        tile_data=None
        last_err=None
        for endpoint in endpoints:
            try:
                r=session.post(endpoint,data={"data":query},timeout=120)
                r.raise_for_status()
                tile_data=r.json()
                break
            except Exception as exc:
                last_err=f"{endpoint}: {exc}"
        if tile_data is None:
            failures.append({"tile":tile_no,"bbox":[ts,tw,tn,te],"error":last_err})
            continue
        for el in tile_data.get("elements",[]):
            geom=el.get("geometry") or []
            if len(geom)<2:
                continue
            try:
                line=LineString([(p["lon"],p["lat"]) for p in geom])
            except Exception:
                continue
            tags=el.get("tags") or {}
            rid=f"osm-way-{el.get('id')}"
            by_id[rid]={"road_id":rid,"road_name":tags.get("name",""),"highway":tags.get("highway",""),"geometry":line}
    if failures:
        raise RuntimeError("OpenStreetMap／Overpass 分割查詢仍有區塊失敗，為避免道路中心線不完整而停止分析：" + json.dumps(failures,ensure_ascii=False))
    feats=list(by_id.values())
    if not feats:
        raise RuntimeError("OpenStreetMap／Overpass 未取得道路中心線")
    return gpd.GeoDataFrame(feats, geometry="geometry", crs=WEB_CRS).to_crs(ANALYSIS_CRS)


def prepare_events(rows, source_url):
    records = canonicalize_rows(rows, source_url)
    gdfs = []
    missing_geom = missing_date = outside_period = 0
    for rec in records:
        if pd.isna(rec["start_date"]):
            missing_date += 1; continue
        if rec["start_date"] < START_DATE or rec["start_date"] > END_DATE:
            outside_period += 1; continue
        if rec["geometry"] is None or rec["source_crs"] is None:
            missing_geom += 1; continue
        g = gpd.GeoSeries([rec["geometry"]], crs=rec["source_crs"]).to_crs(ANALYSIS_CRS).iloc[0]
        item = dict(rec); item["geometry"] = g
        gdfs.append(item)
    if not gdfs:
        raise RuntimeError(f"公開道路挖掘資料沒有可同時滿足分析期間與可計算座標的案件；原始列數={len(records)}，缺日期={missing_date}，缺座標={missing_geom}，期間外={outside_period}")
    events = gpd.GeoDataFrame(gdfs, geometry="geometry", crs=ANALYSIS_CRS).reset_index(drop=True)
    return events, {"raw_count":len(records),"usable_count":len(events),"missing_date":missing_date,"missing_geometry":missing_geom,"outside_period":outside_period}


def attach_roads(events, roads):
    ev = events.copy()
    near = gpd.sjoin_nearest(ev, roads[["road_id","road_name","highway","geometry"]], how="left", max_distance=BUFFER_M, distance_col="road_distance_m")
    # Multiple equidistant matches can duplicate events; keep nearest first.
    near = near.sort_values(["event_id","road_distance_m"], na_position="last").drop_duplicates("event_id")
    return gpd.GeoDataFrame(near.drop(columns=["index_right"],errors="ignore"), geometry="geometry", crs=ANALYSIS_CRS)


def build_clusters(events):
    n = len(events)
    parent = list(range(n))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    def union(a,b):
        ra,rb = find(a),find(b)
        if ra != rb: parent[rb] = ra
    sindex = events.sindex
    pairs = []
    for i,row in events.iterrows():
        hits = list(sindex.query(row.geometry.buffer(BUFFER_M), predicate="intersects"))
        for j in hits:
            if j <= i: continue
            d = float(row.geometry.distance(events.iloc[j].geometry))
            if d <= BUFFER_M:
                union(i,j); pairs.append((i,j,d))
    comps = {}
    for i in range(n): comps.setdefault(find(i),[]).append(i)
    results = []
    for members in comps.values():
        if len(members) < REPEAT_MIN: continue
        subset = events.iloc[members].sort_values("start_date")
        local_pairs = [(i,j,d) for i,j,d in pairs if i in members and j in members]
        short = []
        for i,j,d in local_pairs:
            a,b = events.iloc[i], events.iloc[j]
            if a.start_date <= b.start_date: older,newer = a,b
            else: older,newer = b,a
            base_end = older.end_date if not pd.isna(older.end_date) else older.start_date
            gap = (newer.start_date - base_end).days
            if 0 <= gap <= SHORT_REPEAT_DAYS:
                short.append((str(older.event_id),str(newer.event_id),gap,round(d,1)))
        union_geom = unary_union(list(subset.geometry))
        point = union_geom.centroid if not union_geom.is_empty else subset.geometry.iloc[0].centroid
        event_types = sorted(set(subset["event_type"].astype(str)))
        roads = sorted(set(x for x in subset.get("road_name",pd.Series(dtype=str)).fillna("").astype(str) if x))
        min_gap = min((x[2] for x in short), default=None)
        reason = f"{len(subset)}件施工於50公尺範圍形成重複施工群聚"
        if short:
            reason += f"；其中{len(short)}組於前案完工後180天內再施工"
        risk = "高" if short and len(subset) >= 3 else ("中" if short or len(subset) >= 3 else "一般")
        results.append({
            "cluster_id":f"RC-{len(results)+1:04d}",
            "event_count":int(len(subset)),
            "pair_count_50m":int(len(local_pairs)),
            "short_repeat_pair_count":int(len(short)),
            "min_short_gap_days":min_gap,
            "earliest_start":subset.start_date.min().date().isoformat(),
            "latest_start":subset.start_date.max().date().isoformat(),
            "road_names":"、".join(roads),
            "event_types":"、".join(event_types),
            "units":"、".join(sorted(set(x for x in subset["unit"].fillna("").astype(str) if x)))[:1000],
            "event_ids":"、".join(subset["event_id"].astype(str).tolist()),
            "project_names":"｜".join(x for x in subset["project_name"].fillna("").astype(str) if x)[:3000],
            "trigger_reason":reason,
            "audit_priority":risk,
            "geometry":point,
        })
    return gpd.GeoDataFrame(results, geometry="geometry", crs=ANALYSIS_CRS) if results else gpd.GeoDataFrame(columns=["geometry"],geometry="geometry",crs=ANALYSIS_CRS)


def json_safe(v):
    if v is None: return None
    if isinstance(v,(pd.Timestamp,datetime)): return v.isoformat()
    if isinstance(v,(np.integer,np.floating)): return v.item()
    try:
        if pd.isna(v): return None
    except Exception: pass
    return v


def to_feature_collection(gdf, name):
    web = gdf.to_crs(WEB_CRS)
    feats=[]
    for _,r in web.iterrows():
        props={k:json_safe(v) for k,v in r.items() if k!="geometry"}
        feats.append({"type":"Feature","geometry":mapping(r.geometry),"properties":props})
    return {"type":"FeatureCollection","name":name,"features":feats}


def write_xlsx(out, result_df, event_df, stats, sources):
    with pd.ExcelWriter(out/"result.xlsx",engine="openpyxl") as writer:
        result_df.to_excel(writer,sheet_name="分析結果",index=False)
        event_df.to_excel(writer,sheet_name="案件明細",index=False)
        pd.DataFrame([
            {"統計項目":"可分析施工案件數","數值":stats["usable_count"]},
            {"統計項目":"重複施工熱點數","數值":stats["result_count"]},
            {"統計項目":"含180天短期重複施工熱點數","數值":stats["short_repeat_hotspots"]},
            {"統計項目":"高優先熱點數","數值":stats["high_priority_count"]},
        ]).to_excel(writer,sheet_name="統計摘要",index=False)
        pd.DataFrame([
            {"參數":"分析範圍","值":COUNTY},{"參數":"分析期間","值":f"{START_DATE.date()}～{END_DATE.date()}"},
            {"參數":"空間門檻（公尺）","值":BUFFER_M},{"參數":"重複施工最低次數","值":REPEAT_MIN},
            {"參數":"短期再次施工門檻（日）","值":SHORT_REPEAT_DAYS},{"參數":"分析CRS","值":ANALYSIS_CRS},
            {"參數":"輸出CRS","值":WEB_CRS},{"參數":"產製時間","值":now_utc()},
        ]).to_excel(writer,sheet_name="分析參數",index=False)
        pd.DataFrame(sources).to_excel(writer,sheet_name="資料來源",index=False)
        for ws in writer.book.worksheets:
            ws.freeze_panes="A2"; ws.auto_filter.ref=ws.dimensions
            for col in ws.columns:
                width=min(max(len(str(c.value or "")) for c in col)+2,60)
                ws.column_dimensions[col[0].column_letter].width=width


def write_outputs(out, events, roads, result, source_url, diagnostics, quality):
    out.mkdir(parents=True,exist_ok=True)
    result_fc = to_feature_collection(result,TASK_ID)
    (out/"result.geojson").write_text(json.dumps(result_fc,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    result_web = result.to_crs(WEB_CRS)
    rdf = pd.DataFrame([{**{k:json_safe(v) for k,v in r.items() if k!="geometry"},"longitude":r.geometry.x,"latitude":r.geometry.y} for _,r in result_web.iterrows()])
    rdf.to_csv(out/"result.csv",index=False,encoding="utf-8-sig")

    # Event evidence layer and a compact road context layer.
    ev_fc = to_feature_collection(events.drop(columns=["raw_fields"],errors="ignore"),"施工案件")
    (out/"events.geojson").write_text(json.dumps(ev_fc,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    matched_ids=set(events.get("road_id",pd.Series(dtype=str)).dropna().astype(str))
    road_subset=roads[roads["road_id"].astype(str).isin(matched_ids)].copy()
    if len(road_subset)>2000: road_subset=road_subset.iloc[:2000].copy()
    road_fc=to_feature_collection(road_subset,"道路中心線")
    (out/"roads-context.geojson").write_text(json.dumps(road_fc,ensure_ascii=False,separators=(",",":")),encoding="utf-8")

    # Overview required only if large; create one regardless as a stable light viewer input.
    overview = result.copy() if result.empty else result.sort_values(["short_repeat_pair_count","event_count"],ascending=[False,False]).head(1000)
    (out/"overview.geojson").write_text(json.dumps(to_feature_collection(overview,"重複施工熱點摘要"),ensure_ascii=False,separators=(",",":")),encoding="utf-8")

    high_count=int((result.get("audit_priority",pd.Series(dtype=str))=="高").sum()) if not result.empty else 0
    short_count=int((result.get("short_repeat_pair_count",pd.Series(dtype=int)).fillna(0).astype(int)>0).sum()) if not result.empty else 0
    stats={**quality,"result_count":int(len(result)),"high_priority_count":high_count,"short_repeat_hotspots":short_count}
    sources=[
        {"圖層":"道路挖掘案件／道路養護工程／管線工程","提供者":"宜蘭縣政府公開道路挖掘資訊；ODPortal歷史快照作公開備援","URL":source_url or SOURCE_PAGES[0],"資料日期／期間":f"分析篩選 {START_DATE.date()}～{END_DATE.date()}","取得日期":now_utc(),"CRS":"依資料欄位辨識後轉EPSG:3826","角色":"主要施工事件來源","限制":"公開來源可能晚於內部系統、歷史快照可能未涵蓋2026完整案件；無日期或無可計算座標者不納入正式異常判定。"},
        {"圖層":"道路中心線","提供者":"OpenStreetMap / Overpass","URL":OVERPASS,"資料日期／期間":"執行時即時取得","取得日期":now_utc(),"CRS":"EPSG:4326→EPSG:3826","角色":"道路名稱與位置輔助","限制":"OSM為補充性開放資料，不等同宜蘭縣官方道路中心線母庫。"},
    ]
    event_df=pd.DataFrame([{k:json_safe(v) for k,v in r.items() if k not in ("geometry","raw_fields")} for _,r in events.iterrows()])
    write_xlsx(out,rdf,event_df,stats,sources)

    summary={
        "task_id":TASK_ID,"topic":"審計／稽核專題","analysis_goal":"找出宜蘭縣近3年同一路段／50公尺範圍內重複施工2次以上，或前案完工180天內再次施工的道路工程熱點。",
        "geographic_scope":COUNTY,"time_range":{"requested_start":str(START_DATE.date()),"requested_end":str(END_DATE.date())},
        "spatial_rules":["施工事件幾何在EPSG:3826中距離不超過50公尺即建立重複施工關聯","分析期間內同一空間群聚至少2件施工即列入","後案開工距前案完工0～180天另標示短期重複施工"],
        "thresholds":{"distance_m":BUFFER_M,"repeat_min":REPEAT_MIN,"short_repeat_days":SHORT_REPEAT_DAYS},
        "input_layers":["道路挖掘案件","道路養護工程（依案件文字分類）","管線工程（依案件文字分類）","道路中心線"],
        "result_count":int(len(result)),"high_risk_count":high_count,"short_repeat_hotspots":short_count,
        "data_quality":quality,"data_sources":sources,
        "limitations":[
            "公開道路挖掘來源不是縣府內部完整後台資料；若公開快照停在2025，2026案件會形成資料缺口。",
            "道路養護工程與管線工程係依公開案件名稱、用途、單位等文字關鍵詞分類，應於正式查核時回到原始案件核對。",
            "缺少可解析日期或座標的案件不納入50公尺與180天正式判定，避免以道路名稱猜測位置造成誤判。",
            "本成果是查核篩選清單，不代表已認定浪費、公務違失或不當施工；仍需核對施工必要性、緊急搶修、同意整合施工及契約內容。"
        ],"generated_at":now_utc()
    }
    (out/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf-8")
    (out/"source-diagnostics.json").write_text(json.dumps(diagnostics,ensure_ascii=False,indent=2),encoding="utf-8")

    project_url=f"{PAGES_ROOT}analysis/{TASK_ID}/map.geolibre.json"
    overview_url=f"{PAGES_ROOT}analysis/{TASK_ID}/overview.geojson"
    events_url=f"{PAGES_ROOT}analysis/{TASK_ID}/events.geojson"
    roads_url=f"{PAGES_ROOT}analysis/{TASK_ID}/roads-context.geojson"
    project={
        "version":"0.2.0","name":"宜蘭縣道路重複施工審計熱點",
        "mapView":{"center":[121.62,24.67],"zoom":9.3,"bearing":0,"pitch":0},
        "basemapStyleUrl":"https://tiles.openfreemap.org/styles/liberty","basemapVisible":True,
        "layers":[
            {"id":"repeat-hotspots","name":"重複施工查核熱點","type":"geojson","source":{"type":"geojson","data":overview_url},"visible":True,"opacity":1,"style":{"circleColor":"#dc2626","circleRadius":7,"circleStrokeColor":"#ffffff","circleStrokeWidth":1},"metadata":{"popupFields":["cluster_id","road_names","event_count","short_repeat_pair_count","min_short_gap_days","event_types","trigger_reason","audit_priority"]}},
            {"id":"construction-events","name":"施工案件證據點／線","type":"geojson","source":{"type":"geojson","data":events_url},"visible":False,"opacity":0.65,"style":{"circleColor":"#2563eb","circleRadius":4,"strokeColor":"#2563eb","strokeWidth":2}},
            {"id":"road-centerline-context","name":"道路中心線（OSM補充）","type":"geojson","source":{"type":"geojson","data":roads_url},"visible":False,"opacity":0.35,"style":{"strokeColor":"#64748b","strokeWidth":1}},
        ],
        "selectedLayerId":"repeat-hotspots",
        "metadata":{"generatedAt":now_utc(),"analysisRole":"AUDIT_SCREENING_REFERENCE","sourceUrl":source_url,"limitations":summary["limitations"]}
    }
    (out/"map.geolibre.json").write_text(json.dumps(project,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    viewer=PAGES_ROOT+"?locale=zh-TW&loading=true&url="
    (out/"index.html").write_text("<!doctype html><meta charset='utf-8'><title>宜蘭縣道路重複施工審計熱點</title><script>location.replace("+json.dumps(viewer)+"+encodeURIComponent("+json.dumps(project_url)+"))</script>",encoding="utf-8")

    report=[
        "# 宜蘭縣道路工程重複施工與資源浪費風險分析","",
        f"- 任務：`{TASK_ID}`",f"- 分析期間：{START_DATE.date()}～{END_DATE.date()}",f"- 空間門檻：{BUFFER_M:.0f} 公尺",f"- 重複施工：期間內至少 {REPEAT_MIN} 件",f"- 短期再次施工：前案完工後 {SHORT_REPEAT_DAYS} 天內",f"- 可分析案件：{stats['usable_count']} 件",f"- 重複施工熱點：{stats['result_count']} 處",f"- 含180天短期再次施工熱點：{stats['short_repeat_hotspots']} 處","",
        "## 方法",
        "將公開施工案件轉為 TWD97 / TM2 121 分帶（EPSG:3826），以案件幾何間 50 公尺距離建立關聯群組；分析期間內同一群組至少 2 件即列入。若後案開工日距前案完工日 0～180 天，另標示為短期重複施工。道路中心線以 OSM / Overpass 補充道路名稱與位置脈絡。",
        "",
        "## 分類",
        "公開案件名稱、用途、申請／施工單位文字含自來水、電力、電信、瓦斯、污／雨水、下水道等關鍵詞時歸為「管線工程」；含路面改善、刨鋪、銑鋪、瀝青、養護、修補等關鍵詞時歸為「道路養護工程」；其餘保留為「道路挖掘案件」。此分類用於查核篩選，正式認定須回查原始案件。",
        "",
        "## 資料品質",
        f"- 原始公開資料列數：{stats['raw_count']}",
        f"- 可同時取得期間內日期與可計算幾何者：{stats['usable_count']}",
        f"- 缺日期而未納入：{stats['missing_date']}",
        f"- 缺座標／幾何而未納入：{stats['missing_geometry']}",
        f"- 分析期間外：{stats['outside_period']}",
        "",
        "## 重要限制",
        *[f"- {x}" for x in summary["limitations"]],
        "",
        "## 資料來源",
        f"- 宜蘭縣政府道路挖掘便民查詢系統：{SOURCE_PAGES[0]}",
        f"- ODPortal 宜蘭縣道路挖掘管理資訊歷史快照：{SOURCE_PAGES[1]}",
        f"- OSM / Overpass 道路中心線：{OVERPASS}",
        "",
        "## 交付檔案",
        "- `map.geolibre.json`：GeoLibre 互動專案",
        "- `overview.geojson`：預設顯示熱點摘要",
        "- `result.geojson`：完整熱點結果",
        "- `events.geojson`：納入計算的施工案件",
        "- `roads-context.geojson`：道路中心線脈絡",
        "- `result.csv`、`result.xlsx`：查核清單與明細",
        "- `summary.json`：機讀摘要",
        "- `source-diagnostics.json`：公開資料取得診斷",
        "- `performance.json`：由 GeoLibre optimizer 產生",
    ]
    (out/"report.md").write_text("\n".join(report)+"\n",encoding="utf-8")


def main():
    manifest_path=Path(os.environ.get("GEOLIBRE_TASK_MANIFEST","GeoLibre-Web/tasks/current-task.json"))
    out=Path(os.environ.get("GEOLIBRE_OUTPUT_DIR",f"GeoLibre-Web/analysis/{TASK_ID}"))
    manifest=json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("task_id")!=TASK_ID:
        raise RuntimeError(f"manifest task_id 不符：{manifest.get('task_id')} != {TASK_ID}")
    session=requests.Session(); session.headers.update({"User-Agent":USER_AGENT,"Accept-Language":"zh-TW,zh;q=0.9,en;q=0.7"})
    rows, diagnostics, source_url=fetch_candidate_rows(session)
    if rows:
        sample = rows[0]
        print(json.dumps({
            "source_probe": source_url,
            "row_count": len(rows),
            "sample_keys": list(sample.keys()),
            "sample_values": {str(k): str(v)[:240] for k,v in list(sample.items())[:30]}
        }, ensure_ascii=False))
    if not rows:
        out.mkdir(parents=True,exist_ok=True)
        (out/"source-diagnostics.json").write_text(json.dumps(diagnostics,ensure_ascii=False,indent=2),encoding="utf-8")
        raise RuntimeError("無法從宜蘭縣道路挖掘公開系統或 ODPortal 公開快照取得可解析的案件資料；已輸出 source-diagnostics.json，不以假資料替代。")
    events, quality=prepare_events(rows,source_url)
    try:
        roads=fetch_osm_roads(session)
        events=attach_roads(events,roads)
    except Exception as exc:
        print("WARNING: 道路中心線補充資料取得失敗，核心50公尺分析仍以施工案件幾何執行：", exc)
        roads=gpd.GeoDataFrame(columns=["road_id","road_name","highway","geometry"], geometry="geometry", crs=ANALYSIS_CRS)
        events=events.copy()
        events["road_id"]=""
        events["road_name"]=events["location"].fillna("")
        events["highway"]=""
        events["road_distance_m"]=np.nan
    result=build_clusters(events)
    write_outputs(out,events,roads,result,source_url,diagnostics,quality)
    print(json.dumps({"task_id":TASK_ID,"source_url":source_url,**quality,"result_count":len(result)},ensure_ascii=False))


if __name__=="__main__":
    main()
