"""依 geolibre-analysis 正式章節契約產製宜蘭分析報告。"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import quote


def build_report(out: Path) -> None:
    summary = json.loads((out / "summary.json").read_text(encoding="utf-8"))
    results = json.loads((out / "result.geojson").read_text(encoding="utf-8"))["features"]
    schools = json.loads((out / "sensitive-schools.geojson").read_text(encoding="utf-8"))["features"]
    project = json.loads((out / "map.geolibre.json").read_text(encoding="utf-8"))
    qa_path = out / "viewer-qa" / "viewer-qa.json"
    qa = json.loads(qa_path.read_text(encoding="utf-8")) if qa_path.exists() else None
    project_url = project["metadata"]["projectUrl"]
    base = project_url.rsplit("/", 1)[0] + "/"
    web_root = base.split("/analysis/", 1)[0] + "/"
    self_viewer = f"{web_root}?locale=zh-TW&url={quote(project_url, safe='')}&loading=true"
    official_viewer = f"https://web.geolibre.app/?url={quote(project_url, safe='')}&layout=viewer&locale=zh-TW&loading=true"

    def link(name: str, label: str | None = None) -> str:
        return f"[{label or name}]({base}{name})"

    type_inputs = summary["input_count_by_facility_type"]
    type_hits = summary["result_count_by_facility_type"]
    hazard_hits = summary["result_count_by_hazard_group"]
    direct = Counter()
    for feature in results:
        for group in {m["group"] for m in feature["properties"].get("matched_hazard_details", []) if m.get("intersects")}:
            direct[group] += 1
    school_names = sorted({re.sub(r"(?<=國民小學)1$", "", f["properties"]["facility_name"]) for f in schools})
    sources = summary["data_sources"]
    flood = next((s for s in sources if "淹水災點" in s.get("name", "")), {})
    debris = next((s for s in sources if "土石流" in s.get("name", "")), {})
    geology = [s for s in sources if s.get("role") == "official_geological_sensitive_area"]
    result_path = out / "result.geojson"
    perf_path = out / "performance.json"
    perf = json.loads(perf_path.read_text(encoding="utf-8")) if perf_path.exists() else {}
    no_hit = summary["input_facility_count"] - summary["result_count"]

    lines = [
        "# 宜蘭縣公共設施複合災害暴露查核",
        "",
        f"- 任務：`{summary['task_id']}`",
        f"- 分析範圍：{summary['geographic_scope']}全縣",
        f"- 分析期間：歷史淹水資料實際紀錄年度 {', '.join(flood.get('record_years_in_yilan', []))}；地質敏感區採公告數值圖；土石流採民國115年度資料",
        f"- 空間門檻：與災害範圍相交，或距範圍／歷史淹水點不超過 {summary['thresholds']['buffer_m']} 公尺",
        "- 核心判斷：設施點位符合任一災害群組即納入；學校直接落在地質敏感區內者另列，不把僅鄰近者算入區內清單",
        f"- 可分析設施點位：{summary['input_facility_count']} 筆；命中：{summary['result_count']} 筆；未命中：{no_hit} 筆",
        f"- 重要子結果：{summary['high_risk_count']} 筆命中兩種以上災害群組；敏感區內學校 {len(schools)} 筆代表點、{len(school_names)} 所學校",
        f"- 報告更新時間：{summary['generated_at']}（UTC）",
        "",
        "## 方法",
        "",
        "本次以宜蘭縣內的學校、醫療機構、消防分隊及政府機關代理點作為設施點位。學校位置由國土測繪中心校地範圍產生代表點；醫療點位來自國土測繪中心地標服務；消防分隊來自消防署資料；政府機關以 iTaiwan 熱點作位置代理。這些位置資料的完整性與精度不同，逐項限制列在「資料來源」章。",
        "",
        f"分析使用三類災害圖資：地質敏感區公告向量範圍（{len(geology)} 個類別）、民國115年度土石流影響範圍，以及國科會近五年歷史淹水災點。先以宜蘭縣界篩選資料，再將幾何統一到 TWD97／121分帶（EPSG:3826）計算距離；設施點與災害範圍相交，或距災害幾何／淹水點不超過 {summary['thresholds']['buffer_m']} 公尺，就記為命中。網頁圖資轉成經緯度（EPSG:4326）。同一設施即使命中多個群組，正式結果仍保留一筆設施並將各次命中記在明細欄。",
        "",
        "學校另做較嚴格的子分析：只計校地代表點與地質敏感區公告向量面直接相交者，不把 300 公尺鄰近者算進去。地圖的地下水補注區 WMS 只供目視參考，計算使用的是公告向量資料。",
        "",
        "## 分類",
        "",
        "結果依設施命中的災害群組標記為「地質敏感區」、「土石流影響範圍」、「近5年歷史淹水災點」。相交與距離門檻內鄰近都會命中；每筆資料另保留實際距離、是否相交及來源編號。",
        "",
        f"「複合災害暴露／查核優先」表示同一設施命中至少 {summary['thresholds']['compound_exposure_groups']} 種不同災害群組，本次共 {summary['high_risk_count']} 筆。這是方便安排後續查核的排序標籤，不是主管機關核定的危險等級；未達兩類的設施仍可能命中單一災害圖資。正式認定須回查公告資料與主管機關程序。",
        "",
        "## 資料品質",
        "",
        "| 設施類別 | 進入空間分析的點位 | 命中 | 未命中 |",
        "|---|---:|---:|---:|",
    ]
    for label in ["學校", "醫療機構", "消防分隊", "政府機關"]:
        n = type_inputs.get(label, 0)
        h = type_hits.get(label, 0)
        lines.append(f"| {label} | {n} | {h} | {n-h} |")
    lines += [
        f"| 合計 | {summary['input_facility_count']} | {summary['result_count']} | {no_hit} |",
        "",
        "設施點位在進入空間比對前已限定於宜蘭縣且具有可用座標；本次留下的 291 筆設施點均有幾何。各來源在形成快取前的原始總列數、缺座標列數及排除列數沒有完整保存在本任務摘要，因此**無法據此宣稱原始資料沒有缺漏**。上表的未命中是有點位但未符合空間條件，不是因資料錯誤而剔除。",
        "",
        "| 災害資料 | 宜蘭縣輸入圖徵／期間 | 命中設施點（含鄰近） | 直接相交設施點 | 品質註記 |",
        "|---|---:|---:|---:|---|",
        f"| 地質敏感區 | {len(geology)} 個公告類別 | {hazard_hits.get('地質敏感區', 0)} | {direct.get('地質敏感區', 0)} | 學校直接相交子集 {len(schools)} 筆點位、{len(school_names)} 所學校 |",
        f"| 土石流影響範圍 | {debris.get('scope_records', '未記錄')} 個範圍圖徵 | {hazard_hits.get('土石流影響範圍', 0)} | {direct.get('土石流影響範圍', 0)} | 使用民國115年度資料 |",
        f"| 歷史淹水災點 | {flood.get('scope_records', '未記錄')} 個點；{', '.join(flood.get('record_years_in_yilan', []))} 年 | {hazard_hits.get('近5年歷史淹水災點', 0)} | 不適用（以距離判定） | 宜蘭縣2023年無紀錄；資料集頁面標示年度與檔案 year 欄位不一致 |",
        "",
        "憲明國小原始校地資料有兩筆相鄰圖徵，因此學校子集的點位數與去重校名數相差一筆。敏感區內學校名稱如下：",
        "",
    ]
    lines += [f"{i}. {name}" for i, name in enumerate(school_names, 1)]
    lines += [
        "",
        "## 重要限制",
        "",
        "- 本分析是公開資料的空間初篩，不能代替法定地質敏感區認定、現勘、鑽探、工程安全鑑定或專業簽證。",
        "- 點位距離災害圖層 300 公尺內只代表位置接近，不表示設施必然受災或存在因果關係。地下水補注敏感區也不等於山崩危險。",
        "- 學校用校地代表點，不代表校門、校舍或校園全部範圍；政府機關用 iTaiwan 熱點作代理點，不是完整機關名冊或正式駐地。醫療資料包含醫院、衛生所及衛生室，不含完整診所名冊。",
        "- 消防署 CSV 欄名寫 TWD97 TM121，但座標數值約為 121／24，程式按經緯度解讀後轉換；正式引用前建議向消防署確認欄位定義。",
        "- 地質敏感區、土石流及淹水資料只用於空間比對；地圖獨立顯示的地下水補注 WMS 是背景參考。其他災害範圍沒有作為獨立地圖圖層呈現。",
        "- 地質敏感區及學校官方原始下載部分遭拒絕存取，淹水資料下載發生連線錯誤；本次依來源章明示使用同版或已核對的快取，發布前應再向主管機關確認是否有更新版。",
        "",
        "## 資料來源",
        "",
        "| 提供單位與資料 | 官方資料集／服務 | 取得日期與座標系統 | 用途及限制 |",
        "|---|---|---|---|",
    ]
    for source in sources:
        name = str(source.get("name", "")).replace("|", "／")
        provider = str(source.get("provider", "")).replace("|", "／")
        url = source.get("dataset_url") or source.get("upstream_url") or source.get("download_url") or ""
        source_link = f"[{name}]({url})" if str(url).startswith("https://") else name
        role = str(source.get("role", "")).replace("_", " ")
        date = str(source.get("record_years_in_yilan") or source.get("announcement_date") or "未標示")
        retrieved = str(source.get("retrieved_at", "未記錄"))
        crs = f"{source.get('source_crs', '未記錄')} → {source.get('analysis_crs', '未記錄')}"
        limitation = str(source.get("limitation") or "未提供特定限制說明").replace("|", "／").replace("\n", " ")
        lines.append(f"| {provider}・{source_link} | [{url}]({url}) | {date}；取得／快取日期 {retrieved}；{crs} | {role}。{limitation} |")
    lines += [
        "",
        "| 來源取得狀況 | 本次處理方式 |",
        "|---|---|",
        "| NLSC 縣界與學校範圍原始下載有 HTTP 403 | 使用先前同版官方鄉鎮界線聯集縣界及校地圖衍生點位快取；縣界以約100公尺容差簡化，僅供縣級範圍分析 |",
        "| 國科會歷史淹水災點下載發生 TLS 連線錯誤 | 使用 2026-09-25 保存的同版官方 CSV 宜蘭子集；資料年度按檔案欄位判讀，沒有 2023 年宜蘭紀錄 |",
        "| 醫療點與政府機關熱點使用已保存的官方 API／開放資料衍生點位 | 醫療地標包含醫院、衛生所與衛生室；iTaiwan 熱點只作政府機關代理位置，皆非完整名冊 |",
        "",
        "## 交付檔案",
        "",
        "| 檔案 | 用途 |",
        "|---|---|",
        f"| {link('index.html')}、{link('map.geolibre.json')} | 穩定地圖入口及 GeoLibre 專案；紅點、黃點與縣界為內嵌向量圖資，地下水補注區為官方 WMS。 |",
        f"| {link('result.geojson')} | 完整正式分析結果，共 {len(results)} 個設施點，對應地圖紅點。 |",
        f"| {link('sensitive-schools.geojson')} | 地質敏感區內學校代表點，共 {len(schools)} 點、去重後 {len(school_names)} 所，對應地圖黃點。 |",
        f"| {link('scope.geojson')} | 宜蘭縣分析範圍面，對應地圖縣界。 |",
        f"| {link('result.csv')} | 逐筆查核清單，與完整結果相同筆數。 |",
        f"| {link('sensitive-schools.csv')} | 區內學校逐點清單，與學校 GeoJSON 相同筆數。 |",
        f"| {link('result.xlsx')} | Excel 分析結果、統計摘要、分析參數、資料來源四個工作表。 |",
        f"| {link('summary.json')} | 機器可讀的筆數、條件、來源及限制摘要。 |",
        f"| {link('performance.json')} | 專案容量與首次載入效能預算結果；不能單獨證明地圖畫面正常。 |",
        "| overview.geojson | 本次完整成果只有111個設施點且小於大型資料門檻，依技能門檻不需另產 overview。 |",
        f"| {link('report.md')}、{link('report.html')} | 正式 Markdown 報告與適合瀏覽器閱讀的網頁版。 |",
        f"| {link('viewer-qa/viewer-qa.json')} | 雙入口、桌面與手機 viewport 的瀏覽器驗收紀錄。 |" if qa else "| viewer-qa/viewer-qa.json | 本次尚未產生瀏覽器驗收紀錄。 |",
        f"| {link('viewer-qa/self_hosted-desktop.png')}、{link('viewer-qa/self_hosted-android.png')}、{link('viewer-qa/official-desktop.png')}、{link('viewer-qa/official-android.png')} | 自架與官方 GeoLibre 在桌面及 Android viewport 的實際瀏覽器畫面。 |" if qa else "| viewer-qa/*.png | 雙入口瀏覽器 QA 後產生；目前尚未產出。 |",
        f"| {link('map-overview.png')} | 自架 GeoLibre 桌面版實際畫面截圖。 |" if (out / "map-overview.png").exists() else "| map-overview.png | 瀏覽器 QA 完成後產生；目前尚未產出。 |",
        "",
        "## 圖層—圖資—檔案對照",
        "",
        "| 地圖中的圖層 | 對應資料 | 對應輸出 | 解讀方式 |",
        "|---|---|---|---|",
        f"| 公共設施複合災害暴露查核結果（紅點） | 四類設施點位與三種災害圖資的空間比對 | {link('result.geojson')}、{link('result.csv')} | {len(results)} 筆相交或 300 公尺內鄰近設施 |",
        f"| 位於地質敏感區內的學校（黃點） | NLSC 校地代表點與公告地質敏感區向量面直接相交 | {link('sensitive-schools.geojson')}、{link('sensitive-schools.csv')} | 紅點的嚴格子集合；只計直接落在區內的點 |",
        f"| 宜蘭縣行政界 | 官方鄉鎮界線聯集衍生快取 | {link('scope.geojson')} | 顯示分析範圍，不是災害圖層 |",
        "| 地下水補注地質敏感區（官方 WMS） | 地質調查及礦業管理中心 WMS | 僅在 map project 作背景顯示 | 目視參考；計算採公告向量檔 |",
        "",
        "山崩與地滑向量區、土石流影響範圍及歷史淹水點都參與紅點的分析，但本次沒有把它們獨立畫成地圖圖層。地圖紅點不是災害範圍面。",
        "",
        "## 效能與發布驗證",
        "",
        f"GeoLibre 專案檔約 {perf.get('project_final_bytes', '未記錄')} bytes；專案、inline 圖層、可見圖層及手機初始載入硬性預算狀態：專案 {perf.get('project_budget_ok', '未記錄')}、inline {perf.get('inline_budget_ok', '未記錄')}、手機 {perf.get('mobile_hard_budget_ok', '未記錄')}。效能檔只說明大小預算，不代表瀏覽器已顯示圖層。",
        "",
        "## 瀏覽器畫面驗證",
        "",
    ]
    if not qa:
        lines.append("目前尚未取得雙入口桌面／手機驗收結果，待 QA 執行後由同一產生器更新本節。")
    else:
        lines.append(f"QA 執行時間：{qa.get('tested_at', '未記錄')}；使用 {qa.get('browser', 'Chromium')}。自架與官方入口均以同一 map project 測試桌面及 Android 手機 viewport。")
        lines += ["", "| 入口 | 裝置模式 | 結果 | ready／錯誤 | 畫布與圖層 | 截圖 |", "|---|---|---|---|---|---|"]
        for key, label in [("self_hosted", "自架 GitHub Pages"), ("official", "官方 GeoLibre 備援")]:
            for mode, mode_label in [("desktop", "桌面"), ("android", "Android 手機 viewport")]:
                item = qa.get("checks", {}).get(key, {}).get(mode, {})
                state = "PASS" if item.get("passed") else "FAIL"
                detail = f"{item.get('load_state', '未確認')}／{item.get('load_errors', '未確認')}"
                visual = f"canvas={item.get('canvas_visible', False)}，圖層={item.get('layer_listed', False)}，彩色像素比例={item.get('colored_pixel_ratio', 0):.3f}"
                shot = item.get("screenshot", "未產出")
                shot_cell = link(shot, "檢視截圖") if shot != "未產出" else shot
                lines.append(f"| {label} | {mode_label} | {state} | {detail} | {visual} | {shot_cell} |")
        lines += ["", f"整體驗收門檻：至少一個入口須同時通過桌面與手機模式。最新紀錄：**{'PASS' if qa.get('overall_pass') else 'FAIL'}**。"]
    lines += [
        "",
        "## 後續查核建議",
        "",
        "建議先用 Excel／CSV 核對設施名稱、代表點座標及命中明細，再向主管機關確認最新公告圖資與原始地址。對位於或鄰近敏感區的校園，應進一步確認實際校舍位置、基地範圍及現地條件；需要工程或安全結論時，交由主管機關與合格專業人員辦理。",
        "",
        "## 總結",
        "",
        f"本次比對 {summary['input_facility_count']} 個宜蘭公共設施點位，{summary['result_count']} 個符合至少一種空間條件，其中 {summary['high_risk_count']} 個命中兩種以上資料群組。另有 {len(school_names)} 所學校的 {len(schools)} 筆代表點直接落在 G0003 地下水補注地質敏感區。紅點呈現全部命中設施，黃點呈現直接相交的學校子集。這些結果適合作為後續核對與查訪順序，不是法定風險或設施安全判定。",
        "",
    ]
    report = "\n".join(lines)
    (out / "report.md").write_text(report, encoding="utf-8")
    try:
        import markdown
    except ImportError as exc:
        raise RuntimeError("產生瀏覽器版報告需要 Python markdown 套件") from exc
    body = markdown.markdown(report, extensions=["tables"])
    page = """<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>宜蘭公共設施災害暴露分析報告</title><style>body{font-family:system-ui,'Noto Sans TC',sans-serif;line-height:1.75;color:#17212f;background:#f5f7fa;margin:0}main{max-width:1050px;margin:auto;padding:36px 24px 80px;background:white}h1,h2{line-height:1.35;color:#123458}h2{border-top:1px solid #dbe3eb;padding-top:28px;margin-top:42px}table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}th,td{border:1px solid #dbe3eb;padding:10px 12px;text-align:left;vertical-align:top;min-width:110px}th{background:#eaf2f9}a{color:#0a61a8}p,li{max-width:100ch}code{background:#eef3f7;padding:2px 4px;border-radius:3px}@media(max-width:700px){main{padding:20px 14px}th,td{font-size:.88rem}}</style><main>""" + body + "</main></html>"
    (out / "report.html").write_text(page, encoding="utf-8")

