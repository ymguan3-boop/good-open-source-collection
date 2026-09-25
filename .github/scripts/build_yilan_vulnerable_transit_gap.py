from __future__ import annotations

import asyncio
import csv
import io
import json
import math
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote

import requests

from geolibre.mcp.server import build_server
from geolibre.mcp.workspace import Workspace

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT = REPO_ROOT / "GeoLibre-Web" / "analysis" / "yilan-vulnerable-transit-gap"
OUT.mkdir(parents=True, exist_ok=True)

ECON_URL = "https://segisws.moi.gov.tw/STATWSSTData/OpenService.asmx/GetAdminSTDataForOpenCode?oCode=ECC48479C0B91632E91C5874DF23C60E51A1FBEE829C41DB1C77A88194F09938EEEF8D4FBBD14F1FEDD4BAFEE0D072B7DDE79C332EB9258D"
CONV_URL = "https://segisws.moi.gov.tw/STATWSSTData/OpenService.asmx/GetAdminSTDataForOpenCode?oCode=ECC48479C0B91632E91C5874DF23C60E51A1FBEE829C41DB1C77A88194F09938197BD211528B77F4EDD4BAFEE0D072B7DDE79C332EB9258D"

ECON_META = "https://segis.moi.gov.tw/STATCloud/QueryInterfaceView?COL=aQN%252fHCX5M1xcy0qa5dIGIw%253d%253d&MCOL=jKBRvLmz4PSIl8kKYNJmZw%253d%253d"
CONV_META = "https://segis.moi.gov.tw/STATCloud/QueryInterfaceView?COL=XstSF3HYqIa8C%252bcHRT4OZQ%253d%253d&MCOL=rJKUJpShFsKhAOJqtLtzkw%253d%253d"
CODE_DOC = "https://segis.moi.gov.tw/STATCloud/template/%E9%8A%80%E9%AB%AE%E5%AE%89%E5%B1%85%E9%9C%80%E6%B1%82%E6%8C%87%E6%95%B8%E4%BB%A3%E7%A2%BC%E8%AA%AA%E6%98%8E.pdf"

PUBLIC_BASE = "https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/analysis/yilan-vulnerable-transit-gap"
PUBLIC_PROJECT = PUBLIC_BASE + "/map.geolibre.json"
PRIMARY_VIEWER = (
    "https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/"
    "?locale=zh-TW&url=" + quote(PUBLIC_PROJECT, safe="")
)
FALLBACK_VIEWER = "https://web.geolibre.app/?url=" + quote(PUBLIC_PROJECT, safe="")


def fetch_geojson(url: str) -> dict:
    r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=180)
    r.raise_for_status()
    obj = json.loads(r.text.lstrip("\ufeff"))
    if not isinstance(obj, dict) or obj.get("type") != "FeatureCollection":
        raise RuntimeError("SEGIS response is not a GeoJSON FeatureCollection")
    return obj


def cell_estimate(v):
    # SEGIS documents NULL as a privacy-suppressed count <3. 0 is emitted as 0,
    # so use 1.5 as a transparent midpoint estimate for suppressed cells.
    if v is None:
        return 1.5, 1
    try:
        return float(v), 0
    except Exception:
        return 0.0, 1


def aggregate(props: dict, cols: list[str]) -> tuple[float, int]:
    total = 0.0
    suppressed = 0
    for c in cols:
        v, s = cell_estimate(props.get(c))
        total += v
        suppressed += s
    return total, suppressed


def minmax(values):
    lo, hi = min(values), max(values)
    return lo, hi


def norm(v, lo, hi):
    return 0.0 if hi <= lo else (v - lo) / (hi - lo)


def percentile(values, q):
    vals = sorted(values)
    if not vals:
        return 0.0
    pos = (len(vals) - 1) * q
    low = int(math.floor(pos))
    high = int(math.ceil(pos))
    if low == high:
        return vals[low]
    frac = pos - low
    return vals[low] * (1 - frac) + vals[high] * frac


def mcp_call(server, tool, **args):
    res = asyncio.run(server.call_tool(tool, args))
    if res.is_error:
        text = res.content[0].text if res.content else "unknown MCP error"
        raise RuntimeError(f"{tool}: {text}")
    return res.structured_content


def main():
    econ = fetch_geojson(ECON_URL)
    conv = fetch_geojson(CONV_URL)

    econ_y = [f for f in econ["features"] if f.get("properties", {}).get("COUNTY") == "宜蘭縣"]
    conv_y = [f for f in conv["features"] if f.get("properties", {}).get("COUNTY") == "宜蘭縣"]
    if len(econ_y) != 233 or len(conv_y) != 233:
        raise RuntimeError(f"Unexpected Yilan feature count econ={len(econ_y)} conv={len(conv_y)}")

    conv_by_id = {f["properties"]["V_ID"]: f for f in conv_y}
    if set(conv_by_id) != {f["properties"]["V_ID"] for f in econ_y}:
        raise RuntimeError("Economic and convenience village IDs do not match")

    records = []
    features = []

    for ef in econ_y:
        ep = ef["properties"]
        vid = ep["V_ID"]
        cp = conv_by_id[vid]["properties"]

        gcols = [k for k in ep if k.startswith("G") and len(k) == 9]
        vuln_cols = [k for k in gcols if k.startswith("G12") or k.startswith("G13")]
        lcols = [k for k in cp if k.startswith("L") and len(k) == 9]
        bus_gap_cols = [k for k in lcols if k.startswith("L13")]

        econ_total, econ_supp = aggregate(ep, gcols)
        vuln_count, vuln_supp = aggregate(ep, vuln_cols)
        transit_total, transit_supp = aggregate(cp, lcols)
        bus_gap_count, bus_gap_supp = aggregate(cp, bus_gap_cols)

        vuln_rate = vuln_count / econ_total if econ_total else 0.0
        bus_gap_rate = bus_gap_count / transit_total if transit_total else 0.0
        joint_pressure = math.sqrt(max(0.0, vuln_rate) * max(0.0, bus_gap_rate))

        records.append({
            "county": "宜蘭縣",
            "town_id": ep["TOWN_ID"],
            "town": ep["TOWN"],
            "village_id": vid,
            "village": ep["VILLAGE"],
            "data_period": ep.get("INFO_TIME", "113Y"),
            "elderly_econ_est": econ_total,
            "vulnerable_elderly_est": vuln_count,
            "vulnerable_rate_pct": vuln_rate * 100,
            "elderly_transit_est": transit_total,
            "bus_gap_elderly_est": bus_gap_count,
            "bus_gap_rate_pct": bus_gap_rate * 100,
            "joint_pressure_raw": joint_pressure,
            "economic_suppressed_cells": econ_supp,
            "vulnerable_suppressed_cells": vuln_supp,
            "transit_suppressed_cells": transit_supp,
            "bus_gap_suppressed_cells": bus_gap_supp,
            "_geometry": ef["geometry"],
        })

    pvals = [r["joint_pressure_raw"] for r in records]
    counts_log = [math.log1p(r["vulnerable_elderly_est"]) for r in records]
    plo, phi = minmax(pvals)
    clo, chi = minmax(counts_log)

    for r in records:
        pressure_norm = norm(r["joint_pressure_raw"], plo, phi)
        scale_norm = norm(math.log1p(r["vulnerable_elderly_est"]), clo, chi)
        r["priority_score"] = 100 * (0.80 * pressure_norm + 0.20 * scale_norm)

    scores = [r["priority_score"] for r in records]
    positive_scores = [s for s in scores if s > 0]
    if not positive_scores:
        raise RuntimeError("All priority scores are zero; cannot classify")
    # Many villages legitimately have zero combined pressure. If percentiles are
    # computed over all villages, P50 collapses to zero and the D class loses
    # meaning. Classify positive-score villages by their own distribution while
    # keeping zero/low-positive villages in D.
    p50, p75, p90 = (
        percentile(positive_scores, .50),
        percentile(positive_scores, .75),
        percentile(positive_scores, .90),
    )

    for r in records:
        s = r["priority_score"]
        if s >= p90:
            band = "A 極高優先"
        elif s >= p75:
            band = "B 高優先"
        elif s >= p50:
            band = "C 中度"
        else:
            band = "D 較低"
        r["priority_band"] = band
        suppressed = (
            r["economic_suppressed_cells"] + r["transit_suppressed_cells"]
        )
        r["data_quality"] = "較高" if suppressed == 0 else ("中等" if suppressed <= 6 else "需注意")

    records.sort(key=lambda x: x["priority_score"], reverse=True)
    for i, r in enumerate(records, 1):
        r["rank"] = i

    # Township aggregation using the original estimated counts, not mean village ranks.
    towns = defaultdict(lambda: {
        "elderly_econ_est": 0.0,
        "vulnerable_elderly_est": 0.0,
        "elderly_transit_est": 0.0,
        "bus_gap_elderly_est": 0.0,
        "village_count": 0,
        "a_count": 0,
        "b_count": 0,
    })
    for r in records:
        t = towns[r["town"]]
        for k in ["elderly_econ_est", "vulnerable_elderly_est", "elderly_transit_est", "bus_gap_elderly_est"]:
            t[k] += r[k]
        t["village_count"] += 1
        t["a_count"] += int(r["priority_band"].startswith("A"))
        t["b_count"] += int(r["priority_band"].startswith("B"))

    town_rows = []
    for town, t in towns.items():
        vr = t["vulnerable_elderly_est"] / t["elderly_econ_est"] if t["elderly_econ_est"] else 0
        br = t["bus_gap_elderly_est"] / t["elderly_transit_est"] if t["elderly_transit_est"] else 0
        town_rows.append({
            "town": town,
            **t,
            "vulnerable_rate_pct": vr * 100,
            "bus_gap_rate_pct": br * 100,
            "joint_pressure_raw": math.sqrt(vr * br),
        })
    town_rows.sort(key=lambda x: x["joint_pressure_raw"], reverse=True)
    for i, t in enumerate(town_rows, 1):
        t["rank"] = i

    # Build final GeoJSON properties.
    props_keep = [
        "rank", "town", "village", "village_id", "data_period",
        "vulnerable_elderly_est", "vulnerable_rate_pct",
        "bus_gap_elderly_est", "bus_gap_rate_pct",
        "priority_score", "priority_band", "data_quality",
    ]
    rec_by_id = {r["village_id"]: r for r in records}
    for ef in econ_y:
        r = rec_by_id[ef["properties"]["V_ID"]]
        properties = {k: r[k] for k in props_keep}
        for k in ["vulnerable_elderly_est","bus_gap_elderly_est","vulnerable_rate_pct","bus_gap_rate_pct","priority_score"]:
            properties[k] = round(float(properties[k]), 2)
        features.append({"type": "Feature", "geometry": r["_geometry"], "properties": properties})

    analysis_geojson = {"type": "FeatureCollection", "features": features}

    # Create GeoLibre project through the actual MCP tool surface.
    workspace = Workspace([OUT])
    server = build_server(workspace)
    project_name = "map.geolibre.json"

    catalog = mcp_call(server, "list_catalog")
    if "positron" not in catalog.get("basemaps", {}):
        raise RuntimeError("positron basemap not available")

    mcp_call(
        server, "create_project", path=project_name,
        name="宜蘭縣經濟弱勢高齡 × 公車可近性缺口（113年）",
        center=[121.72, 24.69], zoom=9.1, basemap="positron", overwrite=True,
    )
    added = mcp_call(
        server, "add_geojson_layer", path=project_name,
        name="村里弱勢高齡公共運輸缺口",
        data=json.dumps(analysis_geojson, ensure_ascii=False),
        style={"fillOpacity": 0.76, "strokeColor": "#374151", "strokeWidth": 0.8},
    )
    layer_id = added["layerId"]
    mcp_call(server, "list_layer_properties", path=project_name, layer=layer_id)
    mcp_call(
        server, "classify_layer", path=project_name, layer=layer_id,
        column="priority_score", class_count=4, colormap="rdylgn", scheme="quantile",
    )
    mcp_call(
        server, "style_layer", path=project_name, layer=layer_id,
        style={
            "vectorStyleMode": "graduated",
            "vectorStyleProperty": "priority_score",
            "vectorStyleClassCount": 4,
            "vectorStyleColorRamp": "rdylgn",
            "vectorStyleClassificationScheme": "manual",
            "vectorStyleStops": [
                {"value": 0, "color": "#1a9850"},
                {"value": round(p50, 3), "color": "#fee08b"},
                {"value": round(p75, 3), "color": "#f46d43"},
                {"value": round(p90, 3), "color": "#d73027"},
            ],
        },
    )
    mcp_call(
        server, "set_layer_popup", path=project_name, layer=layer_id,
        title="village",
        fields=[
            {"field": "town", "label": "鄉鎮市", "kind": "text"},
            {"field": "village", "label": "村里", "kind": "text"},
            {"field": "vulnerable_elderly_est", "label": "經濟弱勢高齡估計人數", "kind": "number", "format": {"decimals": 1}},
            {"field": "vulnerable_rate_pct", "label": "經濟弱勢高齡比率", "kind": "number", "format": {"decimals": 2, "suffix": "%"}},
            {"field": "bus_gap_elderly_est", "label": "距公車站≥500m高齡估計人數", "kind": "number", "format": {"decimals": 1}},
            {"field": "bus_gap_rate_pct", "label": "公車站距離缺口率", "kind": "number", "format": {"decimals": 2, "suffix": "%"}},
            {"field": "priority_score", "label": "相對優先分數", "kind": "number", "format": {"decimals": 1}},
            {"field": "priority_band", "label": "優先分級", "kind": "text"},
            {"field": "data_quality", "label": "資料品質提示", "kind": "text"},
        ],
        click=True, max_width=430,
    )
    mcp_call(
        server, "add_legend", path=project_name,
        title="弱勢高齡 × 公車可近性缺口",
        legend_dict={
            f"D 較低（<{p50:.1f}）": "#1a9850",
            f"C 中度（{p50:.1f}–{p75:.1f}）": "#fee08b",
            f"B 高優先（{p75:.1f}–{p90:.1f}）": "#f46d43",
            f"A 極高優先（≥{p90:.1f}）": "#d73027",
        },
        position="bottom-left", shape="square",
    )
    mcp_call(server, "set_view", path=project_name, center=[121.72,24.69], zoom=9.1, bearing=0, pitch=0)
    described = mcp_call(server, "describe_project", path=project_name)
    if described.get("layerCount") != 1 or described["layers"][0].get("featureCount") != 233:
        raise RuntimeError(f"GeoLibre describe_project validation failed: {described}")

    # CSV — result rows.
    csv_fields = [
        "rank","town","village","village_id","data_period",
        "elderly_econ_est","vulnerable_elderly_est","vulnerable_rate_pct",
        "elderly_transit_est","bus_gap_elderly_est","bus_gap_rate_pct",
        "joint_pressure_raw","priority_score","priority_band","data_quality",
        "economic_suppressed_cells","vulnerable_suppressed_cells",
        "transit_suppressed_cells","bus_gap_suppressed_cells",
    ]
    with (OUT / "result.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=csv_fields)
        w.writeheader()
        for r in records:
            row={k:r[k] for k in csv_fields}
            for k,v in list(row.items()):
                if isinstance(v,float): row[k]=round(v,4)
            w.writerow(row)

    top = records[:20]
    top_table = "\n".join(
        f"| {r['rank']} | {r['town']} | {r['village']} | {r['priority_score']:.1f} | {r['priority_band']} | {r['vulnerable_rate_pct']:.2f}% | {r['bus_gap_rate_pct']:.2f}% |"
        for r in top
    )
    town_table = "\n".join(
        f"| {t['rank']} | {t['town']} | {t['vulnerable_rate_pct']:.2f}% | {t['bus_gap_rate_pct']:.2f}% | {t['a_count']} | {t['b_count']} |"
        for t in town_rows
    )

    report = f"""# 宜蘭縣經濟弱勢高齡 × 公共運輸服務缺口分析

## 一、分析目的

本分析以宜蘭縣 233 個村里為單位，篩選**經濟弱勢高齡人口比例較高，且住家距公車站牌較遠**的區域，作為交通、社福與高齡服務資源進一步查核的優先參考。

## 二、官方資料

- 內政部 SEGIS「113年行政區銀髮安居資料之經濟狀況需求指數_村里」
- 內政部 SEGIS「113年行政區銀髮安居資料之環境便利需求指數_村里」
- 統計期：113 年（2024）
- 平台取得時間：115/04/23

經濟弱勢定義採官方代碼：
- G13：低收入戶
- G12：中低收入戶

公車可近性缺口採官方代碼：
- L13：住家與公車站牌距離 **500 公尺以上**
- L12：100–500 公尺
- L11：100 公尺內

## 三、方法

每個村里計算：

1. **經濟弱勢高齡比率** = (G12 + G13 老年人口估計數) / 經濟狀況資料之老年人口估計數。
2. **公車可近性缺口率** = L13 老年人口估計數 / 環境便利資料之老年人口估計數。
3. **雙重壓力** = sqrt(經濟弱勢高齡比率 × 公車可近性缺口率)。
4. **相對優先分數** = 80% × 雙重壓力在宜蘭各村里的 min-max 正規化 + 20% × 經濟弱勢高齡人數(log1p)的 min-max 正規化。

分級採宜蘭縣內相對分位：
分級門檻是在**優先分數大於 0 的村里**中計算，以避免大量 0 分村里使 P50 退化為 0：
- A 極高優先：正分數村里 P90 以上（分數 ≥ {p90:.2f}）
- B 高優先：正分數村里 P75–P90
- C 中度：正分數村里 P50–P75
- D 較低：低於正分數村里 P50（包含 0 分）

**這不是政府官方指數，也不能解讀為同一個人同時具有低收入與距公車站≥500m。** 兩套資料是村里層級交叉指標，因此本分析反映的是「區域雙重需求壓力」。

SEGIS 對小於 3 人的格位以 NULL 抑制；本分析為避免將 NULL 當 0，採 1.5 人作透明的中點估計，並保留 suppressed-cell 欄位供查核。

## 四、前 20 名村里

| 排名 | 鄉鎮市 | 村里 | 優先分數 | 分級 | 經濟弱勢高齡比率 | 公車缺口率 |
|---:|---|---|---:|---|---:|---:|
{top_table}

## 五、鄉鎮市彙整

| 排名 | 鄉鎮市 | 經濟弱勢高齡比率 | 公車缺口率 | A級村里數 | B級村里數 |
|---:|---|---:|---:|---:|---:|
{town_table}

## 六、使用限制

- 公車缺口只反映**站牌距離**，不代表班次頻率、候車時間、無障礙車輛、票價或路線可達性。
- 資料統計期為 2024；2025–2026 新增、停駛或調整的公車路線不在這次 SEGIS 指標內。
- 經濟弱勢與公車距離資料並非個人層級聯結，不能宣稱某一特定高齡者同時符合兩條件。
- 本結果適合作為政策與審計的**初篩名單**，後續宜再串 TDX 最新站牌/班次、長照據點、醫療及實地交通條件。

## 七、資料來源

- 經濟狀況資料：{ECON_META}
- 環境便利資料：{CONV_META}
- 銀髮安居代碼說明：{CODE_DOC}
"""
    (OUT / "report.md").write_text(report, encoding="utf-8")

    summary = {
        "task_id": "yilan-vulnerable-transit-gap",
        "analysis_title": "宜蘭縣經濟弱勢高齡 × 公共運輸服務缺口",
        "version": "1.0",
        "status": "completed",
        "period": "113Y (2024)",
        "released_on_segis": "2026-04-23",
        "spatial_unit": "village",
        "result_count": len(records),
        "methodology": {
            "economic_vulnerability": "G12 (middle-low income) + G13 (low income) elderly",
            "transit_gap": "L13: home is >=500m from a bus stop",
            "joint_pressure": "sqrt(vulnerable_rate * bus_gap_rate)",
            "priority_score": "80% normalized joint pressure + 20% normalized log1p(vulnerable elderly count)",
            "bands": {
                "classification_population": "villages with priority_score > 0; zero scores remain in D",
                "A_extreme": f"score >= positive-score P90 ({p90:.3f})",
                "B_high": f"positive-score P75 ({p75:.3f}) <= score < P90",
                "C_medium": f"positive-score P50 ({p50:.3f}) <= score < P75",
                "D_lower": f"score < positive-score P50 ({p50:.3f}), including zero",
            },
            "suppressed_cells": "SEGIS NULL (<3 persons) imputed at midpoint 1.5 for screening; suppression counts retained."
        },
        "top_results": [
            {
                "rank": r["rank"], "town": r["town"], "village": r["village"],
                "priority_score": round(r["priority_score"],2),
                "priority_band": r["priority_band"],
                "vulnerable_rate_pct": round(r["vulnerable_rate_pct"],2),
                "bus_gap_rate_pct": round(r["bus_gap_rate_pct"],2),
                "vulnerable_elderly_est": round(r["vulnerable_elderly_est"],1),
                "bus_gap_elderly_est": round(r["bus_gap_elderly_est"],1),
            } for r in records[:20]
        ],
        "township_summary": [
            {
                "rank": t["rank"], "town": t["town"],
                "vulnerable_rate_pct": round(t["vulnerable_rate_pct"],2),
                "bus_gap_rate_pct": round(t["bus_gap_rate_pct"],2),
                "a_priority_villages": t["a_count"],
                "b_priority_villages": t["b_count"],
            } for t in town_rows
        ],
        "caveats": [
            "Area-level screening; not a person-level intersection of vulnerability and bus distance.",
            "Bus gap measures stop distance only, not frequency or service quality.",
            "Source period is 2024; subsequent network changes are not included.",
        ],
        "sources": {
            "economic_metadata": ECON_META,
            "convenience_metadata": CONV_META,
            "code_definition": CODE_DOC,
        },
        "files": {
            "geolibre_project": "map.geolibre.json",
            "excel": "result.xlsx",
            "csv": "result.csv",
            "report": "report.md",
            "summary": "summary.json",
        },
        "public_project_url": PUBLIC_PROJECT,
        "primary_platform": "self-hosted GeoLibre-Web on GitHub Pages",
        "primary_geolibre_url": PRIMARY_VIEWER,
        "compatibility_fallback_url": FALLBACK_VIEWER,
        "mcp_validation": {
            "status": "pass",
            "layer_count": described.get("layerCount"),
            "feature_count": described["layers"][0].get("featureCount"),
            "map_controls": described.get("mapControls"),
        },
    }
    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({
        "status": "pass",
        "villages": len(records),
        "thresholds": {"p50": p50, "p75": p75, "p90": p90},
        "top10": [
            [r["rank"], r["town"], r["village"], round(r["priority_score"],2),
             round(r["vulnerable_rate_pct"],2), round(r["bus_gap_rate_pct"],2)]
            for r in records[:10]
        ],
        "towns": [
            [t["rank"], t["town"], round(t["vulnerable_rate_pct"],2),
             round(t["bus_gap_rate_pct"],2), t["a_count"], t["b_count"]]
            for t in town_rows
        ],
        "describe_project": described,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
