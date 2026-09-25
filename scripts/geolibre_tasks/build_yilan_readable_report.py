"""把宜蘭空間分析的機器成果轉成可閱讀、可核對的交付報告。"""

from __future__ import annotations

import html
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
    base = project["metadata"]["projectUrl"].rsplit("/", 1)[0] + "/"
    viewer = "https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/?locale=zh-TW&url=" + quote(project["metadata"]["projectUrl"], safe="")

    def link(name: str, label: str | None = None) -> str:
        return f"[{label or name}]({base}{name})"

    group_counts = summary["result_count_by_hazard_group"]
    type_counts = summary["result_count_by_facility_type"]
    direct = Counter()
    for feature in results:
        for group in {d["group"] for d in feature["properties"].get("matched_hazard_details", []) if d.get("intersects")}:
            direct[group] += 1
    school_names = sorted({re.sub(r"(?<=國民小學)1$", "", f["properties"]["facility_name"]) for f in schools})
    sources = summary["data_sources"]
    input_counts = summary["input_count_by_facility_type"]
    geological = [s for s in sources if str(s.get("official_id", "")).startswith(("G", "L", "H")) or "地質敏感區" in s.get("name", "")]
    flood = next((s for s in sources if "淹水災點" in s.get("name", "")), {})
    debris = next((s for s in sources if "土石流" in s.get("name", "")), {})

    lines = [
        "# 宜蘭縣公共設施與災害圖資交會分析：資料、方法與成果",
        "",
        f"產製時間：{summary['generated_at']}（UTC）。這份報告供初步查核排序，不代表法定危險認定或建築安全鑑定。",
        "",
        "## 先看結果",
        "",
        f"以宜蘭縣內 **{summary['input_facility_count']} 個公共設施點位**進行比對，**{summary['result_count']} 個**落在任一災害範圍內，或距離該範圍／歷史淹水點不超過 **{summary['thresholds']['buffer_m']} 公尺**。其中 {summary['high_risk_count']} 個同時命中兩種以上災害資料群組；這只是『值得優先查核』的意思，**不是官方高風險等級**。",
        "",
        f"各類命中數：學校 {type_counts.get('學校', 0)}、醫療機構 {type_counts.get('醫療機構', 0)}、政府機關 {type_counts.get('政府機關', 0)}、消防分隊 {type_counts.get('消防分隊', 0)}。依災害群組計：地質敏感區 {group_counts.get('地質敏感區', 0)}、土石流影響範圍 {group_counts.get('土石流影響範圍', 0)}、近5年歷史淹水災點 {group_counts.get('近5年歷史淹水災點', 0)}；**同一設施可能同時列入數個群組，不能把群組數相加當作設施總數**。",
        "",
        f"嚴格以學校代表點『直接落在』地質敏感區內來看，為 **{len(schools)} 筆校地點位、{len(school_names)} 所學校**。這些點位命中的都是 **G0003 宜蘭平原地下水補注地質敏感區**，不是山崩、地滑區，也不能據此推論校舍危險。憲明國小在原始校地資料有兩筆相鄰圖徵，所以點位數比校名數多一筆。",
        "",
        "## 打開地圖：畫面上每層是什麼",
        "",
        f"[開啟 GeoLibre 互動地圖]({viewer})。圖層與分析輸入不是同一回事：部分資料只用於比對，沒有另畫在地圖上。",
        "",
        "| 地圖圖層 | 畫面表示 | 對應的交付圖資與來源 |",
        "|---|---|---|",
        f"| 公共設施複合災害暴露查核結果（紅點） | {len(results)} 個命中設施；包括相交與 300 公尺內鄰近點 | {link('result.geojson')}；設施原點位來自下表四類來源，災害判定來自地質敏感區、土石流及歷史淹水資料 |",
        f"| 位於地質敏感區內的學校（黃點） | {len(schools)} 筆**直接相交**的校地代表點，是紅點中的子集合，不含僅鄰近敏感區的學校 | {link('sensitive-schools.geojson')}；學校校地取自國土測繪中心，命中依官方地質敏感區公告向量檔判斷 |",
        f"| 地下水補注地質敏感區（官方 WMS） | 供讀者目視對照的官方影像底圖 | 經濟部地質調查及礦業管理中心 WMS；**只供顯示**，實際點位相交判斷使用公告向量檔，不是依影像像素判讀 |",
        f"| 宜蘭縣行政界 | 顯示分析範圍邊界，不是災害判定 | {link('scope.geojson')}；來自官方行政界或報告記載的替代來源 |",
        "",
        "**沒有獨立畫在此專案地圖上的分析圖資**：山崩與地滑等地質敏感區向量範圍、土石流影響範圍、歷史淹水點。它們確實參與空間計算；如需逐一顯示原始災害圖層，應另依來源授權、資料量與 GeoLibre 相容性製作，不可把紅點誤認為災害範圍面。",
        "",
        "## 設施點位從哪裡來",
        "",
        "| 類別 | 輸入點數 | 資料與定位方式 | 要注意的事 |",
        "|---|---:|---|---|",
        f"| 學校 | {input_counts.get('學校', 0)} | 內政部國土測繪中心校地範圍；每筆校地取一個一定落在校地內的代表點 | 點落在敏感區，不等於整個校園或某棟校舍都在區內 |",
        f"| 醫療機構 | {input_counts.get('醫療機構', 0)} | 國土測繪中心地標／醫療設施 API，保留醫院、衛生所、衛生室 | 不含所有診所，不是完整醫療機構名冊 |",
        f"| 消防分隊 | {input_counts.get('消防分隊', 0)} | 內政部消防署開放資料中的分隊座標 | 原 CSV 的座標欄名與數值形式不一致，已按經緯度解讀，正式使用宜向提供者複核 |",
        f"| 政府機關 | {input_counts.get('政府機關', 0)} | iTaiwan 公共熱點中名稱符合政府機關者，以熱點位置作代理點 | 不是機關正式駐地或完整機關名冊，可能位於樓層／櫃臺 |",
        "",
        "## 拿哪些災害資料比對、怎麼比",
        "",
        f"1. **地質敏感區**：使用經濟部地質調查及礦業管理中心公告向量檔（本次納入 {len(geological)} 個來源圖層／類型）。設施點落在區內，或距區界 300 公尺內，列為命中。嚴格的區內學校清單只採『點直接落在區內』。在全部結果中，直接落在地質敏感區的設施點為 {direct.get('地質敏感區', 0)} 個。",
        f"2. **土石流影響範圍**：使用農業部農村發展及水土保持署 115 年度資料；宜蘭範圍有 {debris.get('scope_records', '詳來源表')} 筆原始範圍圖徵。判斷點是否位於範圍內或距邊界 300 公尺內；直接落在影響範圍內為 {direct.get('土石流影響範圍', 0)} 個設施點。",
        f"3. **歷史淹水災點**：使用國家科學及技術委員會提供的近五年災點；宜蘭子集 {flood.get('scope_records', '詳來源表')} 筆，實際年份為 {', '.join(map(str, flood.get('record_years_in_yilan', [])))}。設施點距歷史災點 300 公尺內即列為命中；**這是歷史事件附近，不是淹水潛勢範圍，也不是未來淹水預測**。",
        "",
        "計算時把資料轉為臺灣適用的公尺座標系 EPSG:3826，才能量 300 公尺；輸出到網頁前再轉成經緯度 EPSG:4326。先用宜蘭縣界篩選資料，再逐一比對點與範圍或災點。若同一設施符合多種條件，成果保留一筆設施與各項命中明細。",
        "",
        "## 每個輸出檔案到底是什麼",
        "",
        "| 檔案 | 內容、對應圖層與用途 |",
        "|---|---|",
        f"| {link('index.html', '地圖入口 index.html')}／{link('map.geolibre.json')} | 互動地圖入口與專案設定。專案內含上表四個可見圖層；紅點、黃點與縣界的 GeoJSON 已內嵌，地下水補注區由官方 WMS 顯示。**它不是原始災害資料全集**。 |",
        f"| {link('result.geojson')}／{link('result.csv')} | {len(results)} 筆命中設施的點位圖資／同內容表格。GeoJSON 對應地圖**紅點**；CSV 可篩選設施類別、命中群組及距離。包含區內及 300 公尺內鄰近者。 |",
        f"| {link('sensitive-schools.geojson')}／{link('sensitive-schools.csv')} | {len(schools)} 筆直接位於地質敏感區內的學校代表點，對應地圖**黃點**；去重後 {len(school_names)} 所，並非『所有附近學校』。 |",
        f"| {link('scope.geojson')} | 宜蘭縣分析邊界，對應地圖**縣界**，不是災害範圍。 |",
        f"| {link('result.xlsx')} | Excel：分析結果、統計摘要、分析參數、資料來源四個工作表；點位清單與 `result.csv` 對應，不另增加分析個案。 |",
        f"| {link('summary.json')} | 給程式使用的統計、門檻、資料來源、替代資料與限制；不是另一張地圖。 |",
        f"| {link('performance.json')} | 地圖檔容量與效能預算檢查；只驗大小，**不等於瀏覽器已成功畫出圖層**。 |",
        f"| {link('report.md')}／{link('report.html')} | 本報告的 Markdown 原稿與適合在瀏覽器閱讀的 HTML 版本；不含新增圖資。 |",
        "",
        "## 區內學校清單",
        "",
        "以下以學校名稱去重；點位及每筆原始名稱、座標請看 `sensitive-schools.csv`。",
        "",
    ]
    lines += [f"{i}. {name}" for i, name in enumerate(school_names, 1)]
    lines += ["", "## 資料來源連結與採用依據", "", "下表是本次程式實際記錄的來源；『備援／快取』表示官方服務當時無法穩定取得時使用先前保存的衍生資料，不應誤說為當次重新下載。", "", "| 資料／圖層 | 提供者 | 官網或資料集 | 本次作用與限制 |", "|---|---|---|---|"]
    for source in sources:
        title = str(source.get("name", ""))
        provider = str(source.get("provider", ""))
        url = source.get("dataset_url") or source.get("download_url") or ""
        url_text = f"[查看來源]({url})" if str(url).startswith("https://") else "詳來源紀錄"
        note = str(source.get("limitation") or source.get("role") or "")
        lines.append(f"| {title} | {provider} | {url_text} | {note.replace('|', '／')} |")
    lines += ["", "## 替代資料與使用界線", ""]
    if summary.get("substitutions"):
        lines += [f"- {str(item).replace(chr(10), ' ')}" for item in summary["substitutions"]]
    else:
        lines.append("- 本次沒有使用替代範圍資料。")
    lines += [
        "- 原資料集網頁的標示年度，不一定等於本次下載檔的每筆紀錄年度；本報告以實際欄位統計為準。",
        "- 點位交會只是初篩。校地代表點不等於校舍位置；熱點不等於正式機關地址；歷史淹水點不等於淹水潛勢圖。",
        "- 地質敏感區的『地下水補注』類型不等於山崩危險。需要作安全、工程或法定判定時，仍須調閱最新公告圖資並實地確認。",
        "",
        "## 總結",
        "",
        f"本次共比對 {summary['input_facility_count']} 個公共設施點位，找出 {summary['result_count']} 個需進一步查看的點位；其中 {len(school_names)} 所學校的 {len(schools)} 筆校地代表點直接落在 G0003 地下水補注地質敏感區。地圖紅點是全部命中設施，黃點是嚴格相交的學校子集；官方 WMS 僅作背景對照。建議先用 Excel／CSV 核對設施名稱與座標，再依官方最新公告、現地狀況與主管機關資料複核，勿直接把此圖當成風險分級或設施安全結論。",
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

