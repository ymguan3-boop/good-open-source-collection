import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as turf from '@turf/turf';
import { SLUG, availablePacks, dataDirectory, importPacks, importedPacks, packRoot, readRegistry, removePack, saveState, scanFolder } from './taiwanBuildingPacks.js';

// Local-only building information: township databases made by scripts/build-building-master.mjs and
// the open-data tables made by scripts/import-lvr.py live in <project>/data/local. Only the packs the
// user has imported (see taiwanBuildingPacks.js) are opened. Nothing calls an external service.
let masters = null, villages = null, loadedAt = 0;
function open(file) { return new DatabaseSync(file, { readOnly: true }); }
function closeMasters() { for (const item of masters || []) { try { item.db.close(); } catch { /* already closed */ } } masters = null; }
function load() {
  if (masters && Date.now() - loadedAt < 60000) return;
  closeMasters();
  masters = []; loadedAt = Date.now();
  const dir = dataDirectory();
  if (!dir) return;
  for (const pack of importedPacks()) {
    const name = `${pack.slug}-buildings.sqlite`;
    try {
      const db = open(join(pack.root, name)), meta = Object.fromEntries(db.prepare('SELECT key, value FROM meta').all().map(row => [row.key, row.value]));
      masters.push({ name, slug: pack.slug, db, meta, get: db.prepare('SELECT * FROM buildings WHERE build_id = ?') });
    } catch { /* a locked file is skipped until the next refresh */ }
  }
  if (!villages) {
    const file = join(dir, 'yilan-villages.geojson');
    if (existsSync(file)) {
      const collection = JSON.parse(readFileSync(file, 'utf8'));
      villages = collection.features.map(feature => ({ feature, box: turf.bbox(feature) }));
    }
  }
}
function villageAt(lon, lat) {
  const point = turf.point([lon, lat]);
  for (const { feature, box } of villages || []) {
    if (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3]) continue;
    if (turf.booleanPointInPolygon(point, feature)) return { county: feature.properties.COUNTYNAME, town: feature.properties.TOWNNAME, village: feature.properties.VILLNAME };
  }
  return null;
}

// ---- 實價登錄（同路名候選）-------------------------------------------------------------
// Real-price records carry a door number but no coordinates, so a record cannot be placed on a
// building. Records on the road(s) the building faces are offered as candidates only.
let lvr = null, lvrLoadedAt = 0;
function lvrDb() {
  if (lvr && Date.now() - lvrLoadedAt < 60000) return lvr;
  try { lvr?.db.close(); } catch { /* closed */ }
  lvr = null; lvrLoadedAt = Date.now();
  const dir = dataDirectory(), file = dir && join(dir, 'lvr-yilan.sqlite');
  if (!file || !existsSync(file)) return null;
  try {
    const db = open(file), hasRoads = !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'osm_roads'").get();
    lvr = { db, hasRoads, meta: Object.fromEntries(db.prepare('SELECT key, value FROM lvr_meta').all().map(row => [row.key, row.value])) };
  } catch { lvr = null; }
  return lvr;
}
function distanceToSegmentM(lon, lat, a, b) {
  const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110574;
  const px = (lon - a[0]) * kx, py = (lat - a[1]) * ky, dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * ky;
  const t = dx || dy ? Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - t * dx, py - t * dy);
}
const NUMERALS = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function floorsOf(text) {
  const t = String(text || '').replace(/層$/, '');
  if (/^\d+$/.test(t)) return Number(t);
  if (!t) return null;
  let total = 0, current = 0;
  for (const ch of t) { if (ch === '十') { total += (current || 1) * 10; current = 0; } else if (ch in NUMERALS) current = NUMERALS[ch]; else return null; }
  return total + current;
}
const roc = value => /^\d{7}$/.test(String(value || '')) ? `民國 ${Number(String(value).slice(0, 3))} 年 ${Number(String(value).slice(3, 5))} 月` : (value || null);
function lvrCandidates(row, admin) {
  const source = lvrDb();
  if (!source) return { available: false, message: '尚未建立實價登錄資料庫。' };
  if (!source.hasRoads || !admin) return { available: false, message: '尚未建立道路對應，無法判斷建物面對哪條路。' };
  const d = 0.0006, roads = source.db.prepare('SELECT name, coords FROM osm_roads WHERE maxlon >= ? AND minlon <= ? AND maxlat >= ? AND minlat <= ?').all(row.lon - d, row.lon + d, row.lat - d, row.lat + d);
  const near = new Map();
  for (const road of roads) {
    const line = JSON.parse(road.coords);
    for (let i = 1; i < line.length; i++) near.set(road.name, Math.min(near.get(road.name) ?? Infinity, distanceToSegmentM(row.lon, row.lat, line[i - 1], line[i])));
  }
  const facing = [...near].filter(([, meters]) => meters <= 35).sort((a, b) => a[1] - b[1]).slice(0, 3);
  if (!facing.length) return { available: true, roads: [], candidates: [], total: 0, message: '建物 35 公尺內沒有具名道路，未列出候選。' };
  const myFloors = floorsOf(row.build_no), found = [];
  // OSM names carry the lane/alley ("大福路一段11巷"); real-price rows keep road, lane and alley apart.
  const splitName = text => { const m = /^(.*?)(?:(\d+)巷)?(?:(\d+)弄)?$/.exec(text.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))); return { road: m[1] || text, lane: m[2] || null, alley: m[3] || null }; };
  for (const [name] of facing) {
    const part = splitName(name);
    const sql = "SELECT * FROM lvr_trades WHERE town = ? AND road = ? AND target LIKE '%建物%' AND " + (part.lane ? "lane = ?" + (part.alley ? " AND alley = ?" : "") : "lane IS NULL") + " ORDER BY trade_date DESC";
    for (const trade of source.db.prepare(sql).all(admin.town, part.road, ...(part.lane ? (part.alley ? [part.lane, part.alley] : [part.lane]) : []))) {
      const f = floorsOf(trade.total_floors);
      found.push({
        road: name, address: trade.address, tradeDate: roc(trade.trade_date), totalFloors: trade.total_floors, floor: trade.floor, completed: roc(trade.completed),
        buildingType: trade.building_type, mainUse: trade.main_use, areaPing: trade.building_area ? Number((trade.building_area * 0.3025).toFixed(2)) : null,
        totalPriceWan: trade.total_price ? Math.round(trade.total_price / 10000) : null, unitPriceWanPing: trade.unit_price ? Number((trade.unit_price * 3.305785 / 10000).toFixed(1)) : null,
        floorsMatch: myFloors && f ? (myFloors === f ? 'match' : 'differ') : 'unknown', remarks: trade.remarks || null,
      });
    }
  }
  const rank = { match: 0, unknown: 1, differ: 2 };
  found.sort((a, b) => rank[a.floorsMatch] - rank[b.floorsMatch]);
  return { available: true, roads: facing.map(([name, meters]) => ({ name, meters: Math.round(meters) })), total: found.length, matchCount: found.filter(x => x.floorsMatch === 'match').length, candidates: found.slice(0, 25), quarters: source.meta.quarters, source: source.meta.source, roadSource: source.meta.osm_roads };
}

// ---- 各鄉鎮市圖磚索引與本機白模圖磚 ---------------------------------------------------
// The per-town index (about 1 MB of JSON) is sent gzip-compressed and kept compressed in memory;
// white tiles are read asynchronously so many parallel tile requests do not block each other.
const indexCache = new Map();
export function readTownTileset(slug, mode) {
  const root = packRoot(slug);
  if (!root || !['nlsc', 'white'].includes(mode)) throw new Error('此鄉鎮市尚未匯入，或模式不正確');
  const file = join(root, `${slug}-tileset-${mode}.json`);
  if (!existsSync(file)) throw new Error('此鄉鎮市尚未建置圖磚索引');
  const key = `${file}:${statSync(file).mtimeMs}`, cached = indexCache.get(key);
  if (cached) return cached;
  const gz = gzipSync(readFileSync(file), { level: 6 });
  for (const old of [...indexCache.keys()]) if (old.startsWith(`${file}:`)) indexCache.delete(old);
  indexCache.set(key, gz);
  return gz;
}
export async function readWhiteTile(slug, name) {
  const root = packRoot(slug);
  if (!root || !/^[0-9_]+\.glb$/.test(name || '')) throw new Error('白模圖磚名稱不正確，或此鄉鎮市尚未匯入');
  try { return await readFile(join(root, `${slug}-white`, name)); } catch { throw new Error('找不到白模圖磚'); }
}

function lvrSummary() {
  const source = lvrDb(), trades = source?.db.prepare("SELECT COUNT(*) AS n, SUM(target LIKE '%建物%') AS buildings FROM lvr_trades").get();
  return source ? { quarters: source.meta.quarters, trades: trades?.n, buildingTrades: trades?.buildings, source: source.meta.source, roads: source.meta.osm_roads || null } : null;
}
export function buildingInfoStatus() {
  load();
  return {
    masters: (masters || []).map(item => ({ name: item.name, slug: item.slug, ...item.meta, buildings: item.db.prepare('SELECT COUNT(*) AS n FROM buildings').get().n, inArea: item.db.prepare('SELECT SUM(in_area) AS n FROM buildings').get().n })),
    towns: [...new Set((masters || []).flatMap(item => String(item.meta.towns || '').split('、').filter(Boolean)))],
    lvr: lvrSummary(),
  };
}

const centers = new Map();
/** Imported packs with their remembered state, packs that could still be imported, and the open-data summary. */
export function packsOverview() {
  load();
  const registry = readRegistry();
  const imported = (masters || []).map(item => {
    const entry = registry.imported[item.slug] || {};
    // Centre of the built-up area (mean of the building centres inside the township) for "前往".
    if (!centers.has(item.slug)) { const c = item.db.prepare('SELECT AVG(lon) AS lon, AVG(lat) AS lat FROM buildings WHERE in_area = 1').get(); centers.set(item.slug, c?.lon ? { lon: c.lon, lat: c.lat } : null); }
    return { center: centers.get(item.slug), slug: item.slug, towns: item.meta.towns, updatedAt: item.meta.updated_at || null, root: entry.root, importedAt: entry.importedAt || null, loaded: entry.loaded === true, visible: entry.visible !== false,
      buildings: item.db.prepare('SELECT COUNT(*) AS n FROM buildings').get().n, inArea: item.db.prepare('SELECT SUM(in_area) AS n FROM buildings').get().n || 0,
      hasWhite: existsSync(join(entry.root, `${item.slug}-white`)) && existsSync(join(entry.root, `${item.slug}-tileset-white.json`)) };
  }).sort((a, b) => a.towns.localeCompare(b.towns, 'zh-TW'));
  return { imported, whiteMode: registry.whiteMode !== false, lvr: lvrSummary(), dataFolder: dataDirectory() };
}
export const listAvailablePacks = () => availablePacks();
export const scanPackFolder = path => scanFolder(path);
export function importBuildingPacks(slugs, folder) { const added = importPacks(slugs, folder); closeMasters(); return added; }
export function rememberPackState(patch) { saveState(patch); }
export function removeBuildingPack(slug, deleteFiles) {
  if (!SLUG.test(slug || '')) throw new Error('鄉鎮市代號不正確');
  closeMasters();
  const result = removePack(slug, deleteFiles);
  indexCache.clear(); centers.delete(slug);
  return result;
}

export function lookupBuilding(id) {
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(id || '')) throw new Error('建物編號格式不正確');
  load();
  for (const master of masters || []) {
    const row = master.get.get(id);
    if (!row) continue;
    const admin = villageAt(row.lon, row.lat);
    return {
      found: true,
      building: {
        buildId: row.build_id, lon: row.lon, lat: row.lat, e97: row.e97, n97: row.n97, heightM: row.height, buildNo: row.build_no,
        name: row.name, type: row.btype, modelDate: row.mdate, updatedDate: row.m_mdate, sourceDescription: row.source_des, mapFrame: row.c_frameid, lod: row.lod,
      },
      admin,
      lvr: lvrCandidates(row, admin),
      source: { name: master.meta.source, tileset: master.meta.tileset, updatedAt: master.meta.updated_at, rule: master.meta.rule, pendingTiles: Number(master.meta.pending_tiles) || 0 },
    };
  }
  const towns = [...new Set((masters || []).flatMap(item => String(item.meta.towns || '').split('、').filter(Boolean)))];
  return { found: false, reason: masters?.length ? `此建物不在已建置的鄉鎮市（目前：${towns.join('、') || '未記錄'}）` : '尚未建立本機建物主檔' };
}
