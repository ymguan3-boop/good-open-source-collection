"""Import 內政部實價登錄 (買賣) quarterly ZIPs for one county into a local SQLite file.

  python scripts/import-lvr.py --zips D:/.../114S1.zip D:/.../114S2.zip ... --county g --db data/local/lvr-yilan.sqlite

County prefix: g = 宜蘭縣. Reads <county>_lvr_land_a.csv (main), *_a_build.csv, *_a_land.csv.
Only open-data columns are stored; nothing is geocoded here.
"""
import argparse, csv, io, re, sqlite3, zipfile, sys, hashlib
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ap = argparse.ArgumentParser()
ap.add_argument("--zips", nargs="+", required=True)
ap.add_argument("--county", default="g")
ap.add_argument("--db", required=True)
args = ap.parse_args()

FULL = str.maketrans("０１２３４５６７８９－", "0123456789-")
CN = {"○": 0, "〇": 0, "零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}


def cn_to_int(text):
    """Chinese numerals up to 99 (floors), e.g. 十一 -> 11."""
    if not text:
        return None
    if text.isdigit():
        return int(text)
    total, current = 0, 0
    for ch in text:
        if ch == "十":
            total += (current or 1) * 10
            current = 0
        elif ch in CN:
            current = CN[ch]
        else:
            return None
    return total + current


TOWN = re.compile(r"^(?P<city>.{2}[縣市])(?P<town>.{1,3}?[鄉鎮市區])(?P<rest>.*)$")
DOOR = re.compile(r"(?:(?P<lane>[0-9]+)巷)?(?:(?P<alley>[0-9]+)弄)?(?P<no>[0-9]+)(?:之(?P<sub>[0-9]+))?號")


def parse_address(raw):
    """Split a door-number address into road / lane / alley / number / floor (no geocoding)."""
    text = (raw or "").translate(FULL).replace(" ", "")
    t = TOWN.match(text)
    if not t:
        return {}
    rest = t.group("rest")
    d = DOOR.search(rest)
    if not d:
        return {}
    floor = re.search(r"(地下)?([0-9一二三四五六七八九十]+)樓", rest[d.end():])
    return {
        "road": rest[:d.start()] or None, "lane": d.group("lane"), "alley": d.group("alley"),
        "no": int(d.group("no")), "no_sub": d.group("sub"),
        "floor": cn_to_int(floor.group(2)) if floor else None,
    }


def num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


db = sqlite3.connect(args.db)
db.executescript("""
CREATE TABLE IF NOT EXISTS lvr_trades(serial TEXT PRIMARY KEY, quarter TEXT, town TEXT, target TEXT, address TEXT,
  road TEXT, lane TEXT, alley TEXT, no INTEGER, no_sub TEXT, floor INTEGER, trade_date TEXT, total_floors TEXT,
  building_type TEXT, main_use TEXT, material TEXT, completed TEXT, building_area REAL, land_area REAL,
  total_price REAL, unit_price REAL, zoning TEXT, parking_type TEXT, remarks TEXT, elevator TEXT, age TEXT);
CREATE INDEX IF NOT EXISTS lvr_trades_road ON lvr_trades(town, road, no);
CREATE TABLE IF NOT EXISTS lvr_land(serial TEXT, section TEXT, area REAL, zoning TEXT, parcel TEXT, parcel_norm TEXT);
CREATE INDEX IF NOT EXISTS lvr_land_parcel ON lvr_land(section, parcel_norm);
CREATE TABLE IF NOT EXISTS lvr_meta(key TEXT PRIMARY KEY, value TEXT);
""")


def read(zf, name):
    if name not in zf.namelist():
        return []
    with zf.open(name) as fh:
        rows = list(csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig", newline="")))
    return rows[1:]  # row 0 is the English header line


total = 0
for zip_path in args.zips:
    quarter = Path(zip_path).stem
    with zipfile.ZipFile(zip_path) as zf:
        main = read(zf, f"{args.county}_lvr_land_a.csv")
        build = {r["編號"]: r for r in read(zf, f"{args.county}_lvr_land_a_build.csv")}
        land = read(zf, f"{args.county}_lvr_land_a_land.csv")
        for r in main:
            a = parse_address(r["土地位置建物門牌"]) if "建物" in r["交易標的"] else {}
            b = build.get(r["編號"], {})
            db.execute("INSERT OR REPLACE INTO lvr_trades VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                r["編號"], quarter, r["鄉鎮市區"], r["交易標的"], r["土地位置建物門牌"],
                a.get("road"), a.get("lane"), a.get("alley"), a.get("no"), a.get("no_sub"), a.get("floor"),
                r["交易年月日"], r["總樓層數"], r["建物型態"], r["主要用途"], r["主要建材"], r["建築完成年月"],
                num(r["建物移轉總面積平方公尺"]), num(r["土地移轉總面積平方公尺"]), num(r["總價元"]), num(r["單價元平方公尺"]),
                r["都市土地使用分區"] or r["非都市土地使用分區"], r["車位類別"], r["備註"], r["電梯"], b.get("屋齡")))
            total += 1
        db.execute("DELETE FROM lvr_land WHERE serial IN (%s)" % ",".join("?" * len(set(r["編號"] for r in land))), list(set(r["編號"] for r in land))) if land else None
        for r in land:
            parcel = (r.get("地號") or "").strip()
            db.execute("INSERT INTO lvr_land VALUES (?,?,?,?,?,?)", (r["編號"], r["土地位置"], num(r["土地移轉面積平方公尺"]), r["使用分區或編定"], parcel,
                                                                    f"{int(parcel[:4])}-{int(parcel[4:])}" if re.fullmatch(r"\d{8}", parcel) and int(parcel[4:]) else (str(int(parcel[:4])) if re.fullmatch(r"\d{8}", parcel) else parcel)))
db.executemany("INSERT OR REPLACE INTO lvr_meta VALUES (?,?)", [
    ("source", "內政部不動產交易實價登錄（lvr.land.moi.gov.tw）開放資料；政府資料開放授權條款"),
    ("quarters", ",".join(Path(z).stem for z in args.zips)),
    ("note", "買賣主檔；門牌已拆解為路段／巷／弄／號／樓，未做地理編碼；地號為 段+地號，需地籍圖才能定位"),
])
db.commit()
n = db.execute("SELECT COUNT(*), SUM(target LIKE '%建物%'), SUM(road IS NOT NULL AND no IS NOT NULL AND target LIKE '%建物%') FROM lvr_trades").fetchone()
print(f"匯入 {total} 筆；資料庫共 {n[0]} 筆，含建物 {n[1]}，門牌可解析（路＋號）{n[2]}")
print("土地地號列:", db.execute("SELECT COUNT(*) FROM lvr_land").fetchone()[0])
db.close()
