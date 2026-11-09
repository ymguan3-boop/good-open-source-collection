import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as turf from '@turf/turf';
import { gunzipSync } from 'node:zlib';
import { sampleHeights } from './taiwanDtm.js';
import { cadastreStatus, parcelAt, parcelsAtPoints } from './taiwanCadastre.js';
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

// ---- 白模著色用的資料類型（地籍／建管／實價登錄）-----------------------------------------
// bit 1 = 地籍, bit 2 = 建管, bit 4 = 實價登錄（同路名候選）。地籍與建管目前沒有資料來源：只有鄉鎮資料庫內
// 含 building_flags(build_id, cadastre, permit) 表時才會標示，否則一律不標，不推測。
const NAME_SPLIT = text => { const m = /^(.*?)(?:(\d+)巷)?(?:(\d+)弄)?$/.exec(text.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))); return { road: m[1] || text, lane: m[2] || null, alley: m[3] || null }; };
const classCache = new Map();
export function buildingClasses(slug) {
  if (!SLUG.test(slug || '')) throw new Error('鄉鎮市代號不正確');
  load();
  const master = (masters || []).find(item => item.slug === slug);
  if (!master) throw new Error('此鄉鎮市尚未匯入');
  const source = lvrDb(), stamp = `${slug}:${master.meta.updated_at}:${source?.meta?.quarters || ''}:${source ? 1 : 0}:${cadastreStatus().importedAt || ''}`, cached = classCache.get(slug);
  if (cached?.stamp === stamp) return cached.body;
  const town = String(master.meta.towns || '').split('、')[0], classes = {}, counts = { total: 0, flagged: 0, lvr: 0, cadastre: 0, permit: 0 };
  const flags = new Map();
  let hasFlags = false;
  try {
    if (master.db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'building_flags'").get()) {
      hasFlags = true;
      for (const row of master.db.prepare('SELECT build_id, cadastre, permit FROM building_flags').all()) flags.set(row.build_id, (row.cadastre ? 1 : 0) | (row.permit ? 2 : 0));
    }
  } catch { /* optional table */ }
  // 實價登錄：同路名（含巷弄）有 114 年買賣含建物的交易，才視為有候選。
  let tradeKeys = null, grid = null;
  if (source?.hasRoads) {
    tradeKeys = new Set();
    for (const t of source.db.prepare("SELECT DISTINCT road, lane, alley FROM lvr_trades WHERE town = ? AND target LIKE '%建物%'").all(town)) tradeKeys.add(`${t.road}|${t.lane || ''}|${t.alley || ''}`);
    grid = new Map();
    const cell = v => Math.floor(v / 0.001);
    for (const road of source.db.prepare('SELECT name, coords FROM osm_roads').all()) {
      const part = NAME_SPLIT(road.name), line = JSON.parse(road.coords);
      const entry = { name: road.name, key: `${part.road}|${part.lane || ''}|${part.alley || ''}`, line };
      const keys = new Set();
      for (const p of line) keys.add(`${cell(p[0])},${cell(p[1])}`);
      for (const k of keys) { if (!grid.has(k)) grid.set(k, []); grid.get(k).push(entry); }
    }
  }
  // 地籍：建物中心落在已匯入地籍圖的某一筆地號內即標示（本機 data/local/cadastre-yilan.sqlite）。
  const buildingRows = master.db.prepare('SELECT build_id, lon, lat FROM buildings').all(), parcelIds = parcelsAtPoints(buildingRows.map(row => [row.lon, row.lat]));
  buildingRows.forEach((row, index) => {
    counts.total++;
    let mask = (flags.get(row.build_id) || 0) | (parcelIds?.[index] ? 1 : 0);
    if (grid && tradeKeys.size) {
      const near = new Map(), seen = new Set(), cx = Math.floor(row.lon / 0.001), cy = Math.floor(row.lat / 0.001);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const road of grid.get(`${cx + dx},${cy + dy}`) || []) {
        if (seen.has(road)) continue;
        seen.add(road);
        let best = near.get(road.name)?.m ?? Infinity;
        for (let i = 1; i < road.line.length; i++) best = Math.min(best, distanceToSegmentM(row.lon, row.lat, road.line[i - 1], road.line[i]));
        near.set(road.name, { m: best, key: road.key });
      }
      const facing = [...near.values()].filter(item => item.m <= 35).sort((a, b) => a.m - b.m).slice(0, 3);
      if (facing.some(item => tradeKeys.has(item.key))) mask |= 4;
    }
    if (mask) { classes[row.build_id] = mask; counts.flagged++; if (mask & 1) counts.cadastre++; if (mask & 2) counts.permit++; if (mask & 4) counts.lvr++; }
  });
  const body = gzipSync(JSON.stringify({
    slug, town, counts, classes,
    available: { cadastre: hasFlags || !!parcelIds, permit: hasFlags, lvr: !!tradeKeys?.size },
    note: '實價登錄為「同路名候選」（交易只有門牌、沒有座標），不代表該棟確有交易；地籍為建物中心所在的地號（本機地籍圖）；建管目前沒有資料來源，不標示。',
  }), { level: 6 });
  classCache.set(slug, { stamp, body });
  return body;
}

// ---- 本機建物統計（取代逐格下載官方圖磚）------------------------------------------------
// Counts building centres inside a polygon straight from the imported township databases. Same
// rule as the online NLSC analysis (BUILD_ID de-duplication, centre inside the area), same result shape.
export function localBuildingAnalysis({ geometry, slugs }) {
  if (!['Polygon', 'MultiPolygon'].includes(geometry?.type)) throw new Error('建物統計需要面積範圍');
  const polygon = turf.feature(geometry), box = turf.bbox(polygon);
  // County boundaries may include far islands (e.g. 釣魚臺 at 123.5°E); only the imported packs limit the search.
  if (!box.every(Number.isFinite) || box[0] < 100 || box[2] > 130 || box[1] < 15 || box[3] > 30) throw new Error('範圍座標不在臺灣附近');
  load();
  const wanted = new Set(Array.isArray(slugs) ? slugs.filter(slug => SLUG.test(slug)) : []);
  const used = (masters || []).filter(item => !wanted.size || wanted.has(item.slug));
  if (!used.length) throw new Error('沒有可用的已匯入鄉鎮市資料庫');
  const unique = new Map(), warnings = [];
  const select = 'SELECT build_id, lon, lat, height, build_no, name, mdate FROM buildings WHERE lon BETWEEN ? AND ? AND lat BETWEEN ? AND ?';
  let candidates = 0;
  for (const master of used) {
    for (const row of master.db.prepare(select).all(box[0], box[2], box[1], box[3])) {
      candidates++;
      if (unique.has(row.build_id) || !turf.booleanPointInPolygon([row.lon, row.lat], polygon)) continue;
      unique.set(row.build_id, { type: 'Feature', geometry: { type: 'Point', coordinates: [row.lon, row.lat] }, properties: { buildingId: row.build_id, name: row.name || '', modelDate: row.mdate || null, heightM: row.height, buildNo: row.build_no, countRule: '建物中心位於範圍內' } });
    }
    if (Number(master.meta.pending_tiles) > 0) warnings.push(`${master.meta.towns} 建檔尚有 ${master.meta.pending_tiles} 個圖磚未完成`);
  }
  const missing = [...wanted].filter(slug => !used.some(item => item.slug === slug));
  if (missing.length) warnings.push(`有 ${missing.length} 個鄉鎮市未匯入：${missing.join('、')}`);
  return {
    buildingCount: unique.size, buildingCountComplete: warnings.length === 0, buildingSource: '本機建物主檔（NLSC 分棟版 3D Tiles 屬性，已匯入）',
    buildingCountRule: 'BUILD_ID 去重，建物中心座標位於量測範圍內（非建物足跡相交）；直接查本機資料庫，不下載官方圖磚',
    buildingCoverage: '只代表建檔時的官方模型版本與涵蓋，不代表現況或法定建物清冊', buildingCandidateTiles: 0, buildingScannedTiles: 0, buildingFailedTiles: 0,
    buildingWarning: warnings.length ? `本機建物主檔不完整：${warnings.join('；')}` : null, localDatabase: true, candidatesChecked: candidates,
    databases: used.map(item => ({ slug: item.slug, towns: item.meta.towns, builtAt: item.meta.updated_at })),
    sourceUrls: [], geojson: { type: 'FeatureCollection', features: [...unique.values()] },
  };
}

// ---- 建物明細＋官方 DTM 地面高程 ------------------------------------------------------------
// Per-building rows for the buildings inside the selected area (optionally only those carrying 實價登錄/地籍/建管
// marks), with the ground elevation read from the official 2025 20 m DTM at the building centre.
const CLASS_BIT = { lvr: 4, cadastre: 1, permit: 2 };
export function buildingElevationDetail({ geometry, slugs, marks = [] }) {
  const bits = marks.reduce((sum, key) => sum | (CLASS_BIT[key] || 0), 0);
  const base = localBuildingAnalysis({ geometry, slugs });
  const table = {};
  if (bits) for (const database of base.databases) Object.assign(table, JSON.parse(gunzipSync(buildingClasses(database.slug))).classes);
  const picked = base.geojson.features.filter(f => !bits || ((table[f.properties.buildingId] || 0) & bits) === bits);
  const heights = sampleHeights(picked.map(f => f.geometry.coordinates));
  const rows = picked.map((f, i) => ({
    buildId: f.properties.buildingId, lon: Number(f.geometry.coordinates[0].toFixed(6)), lat: Number(f.geometry.coordinates[1].toFixed(6)), floors: f.properties.buildNo || null,
    modelHeightM: Number.isFinite(f.properties.heightM) ? Number(f.properties.heightM.toFixed(1)) : null, groundM: heights[i] === null ? null : Number(heights[i].toFixed(1)),
    marks: [(table[f.properties.buildingId] || 0) & 1 ? '地籍' : null, (table[f.properties.buildingId] || 0) & 2 ? '建管' : null, (table[f.properties.buildingId] || 0) & 4 ? '實價登錄(同路名候選)' : null].filter(Boolean).join('＋'),
  }));
  const values = rows.map(r => r.groundM).filter(v => v !== null).sort((a, b) => a - b), middle = Math.floor(values.length / 2);
  return {
    totalInArea: base.buildingCount, matched: rows.length, withGround: values.length, markFilter: marks, databases: base.databases, complete: base.buildingCountComplete, warning: base.buildingWarning,
    stats: values.length ? { minM: Number(values[0].toFixed(1)), maxM: Number(values.at(-1).toFixed(1)), meanM: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)), medianM: Number((values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2).toFixed(1)) } : null,
    rows,
    source: '建物：本機建物主檔（NLSC 分棟版 3D Tiles 屬性）；地面高程：內政部地政司 2025 全臺 20 公尺 DTM（建物中心所在 20 公尺格網，原始格網，非工程測量）',
    note: bits ? '「實價登錄」標示為同路名候選（實價登錄沒有座標），不代表該棟確有交易。' : null,
  };
}
// ---- 屋齡（實價登錄的「建築完成年月」）--------------------------------------------------
// The NLSC model has no construction year. Only real-price records carry it, and those have no coordinates:
// the result is a list of transactions (and their distinct door numbers), never a count of buildings.
export function ageTrades({ town, minYears = 30, now = new Date(), slug = null, withElevation = false }) {
  const source = lvrDb();
  if (!source) throw new Error('尚未建立實價登錄資料庫');
  const years = Number(minYears);
  if (!Number.isFinite(years) || years < 0 || years > 200) throw new Error('屋齡年數不正確');
  if (!/^[一-龥]{2,6}$/.test(town || '')) throw new Error('請指定鄉鎮市區');
  const all = source.db.prepare("SELECT * FROM lvr_trades WHERE town = ? AND target LIKE '%建物%' ORDER BY trade_date DESC").all(town);
  const nowIndex = now.getFullYear() * 12 + now.getMonth();
  const parse = value => { const m = /^(\d{3})(\d{2})(\d{2})?$/.exec(String(value || '').trim()); return m ? { year: Number(m[1]) + 1911, month: Math.min(12, Math.max(1, Number(m[2]))) } : null; };
  const rows = [], undated = [];
  for (const trade of all) {
    const done = parse(trade.completed);
    if (!done) { undated.push(trade); continue; }
    const ageYears = (nowIndex - (done.year * 12 + done.month - 1)) / 12;
    if (ageYears >= years) rows.push({ trade, ageYears });
  }
  rows.sort((a, b) => b.ageYears - a.ageYears);
  const door = address => { const m = /^(.*?號)/.exec(String(address || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))); return m ? m[1] : null; };
  const doors = new Set(rows.map(item => door(item.trade.address)).filter(Boolean));
  const list = rows.map(({ trade, ageYears }) => ({
    roadKey: `${trade.road}|${trade.lane || ''}|${trade.alley || ''}`, tradeDate: roc(trade.trade_date), address: trade.address, completed: roc(trade.completed), ageYears: Number(ageYears.toFixed(1)), totalFloors: trade.total_floors, floor: trade.floor,
    buildingType: trade.building_type, mainUse: trade.main_use, areaPing: trade.building_area ? Number((trade.building_area * 0.3025).toFixed(2)) : null,
    totalPriceWan: trade.total_price ? Math.round(trade.total_price / 10000) : null, unitPriceWanPing: trade.unit_price ? Number((trade.unit_price * 3.305785 / 10000).toFixed(1)) : null,
  }));
  // 每筆交易的道路層級 DTM：面對該路的建物（35 公尺內）的地面高程範圍；實價登錄沒有座標，不能對到單一建物。
  let elevation = null;
  if (withElevation) {
    if (!slug) throw new Error('尚未匯入該鄉鎮市的本機建物資料庫，無法計算 DTM');
    elevation = ageCandidateBuildings({ slug, minYears: years, now });
    for (const row of list) { const e = elevation.byRoad[row.roadKey]; row.roadBuildings = e?.count ?? 0; row.groundMinM = e?.minM ?? null; row.groundMaxM = e?.maxM ?? null; row.groundMeanM = e?.meanM ?? null; }
  }  return {
    town, minYears: years, asOf: now.toISOString().slice(0, 10), quarters: source.meta.quarters, source: source.meta.source,
    summary: { buildingTrades: all.length, withCompletionDate: all.length - undated.length, withoutCompletionDate: undated.length, matchingTrades: rows.length, distinctDoorNumbers: doors.size },
    rows: list, elevation: elevation ? { candidateBuildings: elevation.candidateBuildings, buildingsInTown: elevation.buildingsInTown, stats: elevation.stats, buildings: elevation.rows, notes: elevation.notes } : null,
    notes: [
      '建築年份只來自實價登錄的「建築完成年月」；NLSC 三維建物模型沒有屋齡欄位（其 MDATE 是模型製作日期）。',
      '實價登錄只含該期間有買賣的交易，沒有座標，無法對到 3D 建物，因此下列是「交易筆數」與「不同門牌數」，不是' + town + '屋齡達標的建物棟數。',
      `未登載建築完成年月的 ${undated.length} 筆交易無法判斷屋齡，未計入。`,
    ],
  };
}

// ---- 屋齡達標的「道路層級候選建物」＋ DTM 地面高程 --------------------------------------------
// Real-price records have no coordinates and the NLSC model has no building age, so no building can be proved to be
// N years old. The honest approximation: buildings facing a road (≤35 m, same road/lane/alley name) that has at least
// one transaction whose 建築完成年月 is N or more years ago. Every row is a candidate, never a confirmed old building.
export function ageCandidateBuildings({ slug, minYears = 30, now = new Date() }) {
  if (!SLUG.test(slug || '')) throw new Error('鄉鎮市代號不正確');
  const years = Number(minYears);
  if (!Number.isFinite(years) || years < 0 || years > 200) throw new Error('屋齡年數不正確');
  load();
  const master = (masters || []).find(item => item.slug === slug);
  if (!master) throw new Error('此鄉鎮市尚未匯入');
  const source = lvrDb();
  if (!source?.hasRoads) throw new Error('尚未建立實價登錄資料庫或道路對應');
  const town = String(master.meta.towns || '').split('、')[0], nowIndex = now.getFullYear() * 12 + now.getMonth();
  const tradeKeys = new Map();
  let oldTrades = 0;
  for (const t of source.db.prepare("SELECT road, lane, alley, completed FROM lvr_trades WHERE town = ? AND target LIKE '%建物%'").all(town)) {
    const m = /^(\d{3})(\d{2})(\d{2})?$/.exec(String(t.completed || '').trim());
    if (!m) continue;
    const age = (nowIndex - ((Number(m[1]) + 1911) * 12 + Math.min(12, Math.max(1, Number(m[2]))) - 1)) / 12;
    if (age < years) continue;
    oldTrades++;
    const key = `${t.road}|${t.lane || ''}|${t.alley || ''}`, entry = tradeKeys.get(key) || { count: 0, oldest: 0 };
    entry.count++; entry.oldest = Math.max(entry.oldest, age); tradeKeys.set(key, entry);
  }
  const grid = new Map(), cell = v => Math.floor(v / 0.001);
  for (const road of source.db.prepare('SELECT name, coords FROM osm_roads').all()) {
    const part = NAME_SPLIT(road.name), line = JSON.parse(road.coords), entry = { name: road.name, key: `${part.road}|${part.lane || ''}|${part.alley || ''}`, line }, keys = new Set();
    for (const p of line) keys.add(`${cell(p[0])},${cell(p[1])}`);
    for (const k of keys) { if (!grid.has(k)) grid.set(k, []); grid.get(k).push(entry); }
  }
  const total = master.db.prepare('SELECT COUNT(*) AS n FROM buildings WHERE in_area = 1').get().n, picked = [];
  for (const row of master.db.prepare('SELECT build_id, lon, lat, height, build_no FROM buildings WHERE in_area = 1').all()) {
    const near = new Map(), seen = new Set(), cx = cell(row.lon), cy = cell(row.lat);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const road of grid.get(`${cx + dx},${cy + dy}`) || []) {
      if (seen.has(road)) continue;
      seen.add(road);
      let best = near.get(road.name)?.m ?? Infinity;
      for (let i = 1; i < road.line.length; i++) best = Math.min(best, distanceToSegmentM(row.lon, row.lat, road.line[i - 1], road.line[i]));
      near.set(road.name, { m: best, key: road.key, name: road.name });
    }
    const facing = [...near.values()].filter(item => item.m <= 35).sort((a, b) => a.m - b.m).slice(0, 3), hit = facing.filter(item => tradeKeys.has(item.key));
    if (hit.length) picked.push({ row, keys: hit.map(item => item.key), roads: hit.map(item => item.name), oldTrades: hit.reduce((n, item) => n + tradeKeys.get(item.key).count, 0), oldest: Math.max(...hit.map(item => tradeKeys.get(item.key).oldest)) });
  }
  const heights = sampleHeights(picked.map(p => [p.row.lon, p.row.lat]));
  // Per road (key = road|lane|alley): ground elevation range of the buildings facing it, so each transaction can show a road-level DTM range.
  const byRoad = new Map();
  picked.forEach((p, i) => { if (heights[i] === null) return; for (const key of p.keys) { const e = byRoad.get(key) || { count: 0, min: Infinity, max: -Infinity, sum: 0 }; e.count++; e.min = Math.min(e.min, heights[i]); e.max = Math.max(e.max, heights[i]); e.sum += heights[i]; byRoad.set(key, e); } });
  const rows = picked.map((p, i) => ({ buildId: p.row.build_id, lon: Number(p.row.lon.toFixed(6)), lat: Number(p.row.lat.toFixed(6)), floors: p.row.build_no || null,
    modelHeightM: Number.isFinite(p.row.height) ? Number(p.row.height.toFixed(1)) : null, groundM: heights[i] === null ? null : Number(heights[i].toFixed(1)), roads: p.roads.join('、'), oldTrades: p.oldTrades, oldestYears: Number(p.oldest.toFixed(1)) }));
  const values = rows.map(r => r.groundM).filter(v => v !== null).sort((a, b) => a - b), middle = Math.floor(values.length / 2);
  return {
    town, minYears: years, asOf: now.toISOString().slice(0, 10), buildingsInTown: total, candidateBuildings: rows.length, oldTrades, roadsWithOldTrades: tradeKeys.size,
    stats: values.length ? { minM: Number(values[0].toFixed(1)), maxM: Number(values.at(-1).toFixed(1)), meanM: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)), medianM: Number((values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2).toFixed(1)) } : null,
    rows, byRoad: Object.fromEntries([...byRoad].map(([key, e]) => [key, { count: e.count, minM: Number(e.min.toFixed(1)), maxM: Number(e.max.toFixed(1)), meanM: Number((e.sum / e.count).toFixed(1)) }])), quarters: source.meta.quarters,
    notes: [
      `屋齡 ${years} 年以上的建物無法被直接確認：NLSC 三維建物沒有屋齡欄位，實價登錄只有門牌、沒有座標。`,
      `下列是「道路層級候選」：建物 35 公尺內的道路上，至少有一筆建築完成滿 ${years} 年的買賣交易（${oldTrades} 筆交易、${tradeKeys.size} 條路）。候選棟數會多於真正的老屋棟數。`,
      '地面高程取自內政部 2025 全臺 20 公尺 DTM 原始格網（建物中心所在格網），非工程測量。',
    ],
  };
}
// ---- 載入圖資的資料概況（供 AI 回答任意問題用，只含統計，不含逐筆資料）------------------------
const digestCache = new Map();
const quantile = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))] : null;
const stat = values => { const s = [...values].filter(Number.isFinite).sort((a, b) => a - b); return s.length ? { n: s.length, min: Number(s[0].toFixed(1)), p10: Number(quantile(s, 0.1).toFixed(1)), median: Number(quantile(s, 0.5).toFixed(1)), mean: Number((s.reduce((a, b) => a + b, 0) / s.length).toFixed(1)), p90: Number(quantile(s, 0.9).toFixed(1)), max: Number(s.at(-1).toFixed(1)) } : null; };
const topCounts = (rows, key, limit = 8) => { const map = new Map(); for (const row of rows) { const k = row[key] ?? '未提供'; map.set(k, (map.get(k) || 0) + 1); } return [...map].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ name, count })); };
export function townDigests(slugs, now = new Date()) {
  load();
  const out = [], source = lvrDb();
  for (const slug of (slugs || []).filter(item => SLUG.test(item)).slice(0, 12)) {
    const master = (masters || []).find(item => item.slug === slug);
    if (!master) continue;
    const stamp = `${slug}:${master.meta.updated_at}:${source?.meta?.quarters || ''}:${now.toISOString().slice(0, 10)}`, cached = digestCache.get(slug);
    if (cached?.stamp === stamp) { out.push(cached.value); continue; }
    const town = String(master.meta.towns || '').split('、')[0];
    const rows = master.db.prepare('SELECT lon, lat, height, build_no, btype, mdate FROM buildings WHERE in_area = 1').all();
    const step = Math.max(1, Math.floor(rows.length / 6000)), sampled = rows.filter((_, i) => i % step === 0), ground = sampleHeights(sampled.map(r => [r.lon, r.lat])).filter(v => v !== null);
    const floorCounts = topCounts(rows.map(r => ({ f: r.build_no })), 'f', 8);
    const classes = JSON.parse(gunzipSync(buildingClasses(slug))).counts;
    const value = {
      town, slug, buildingsInArea: rows.length, modelHeightM: stat(rows.map(r => r.height)), floorsFieldTop: floorCounts, buildingTypeTop: topCounts(rows, 'btype', 5),
      modelDateTop: topCounts(rows, 'mdate', 3), groundElevationM_sampled: { sampledBuildings: sampled.length, ...stat(ground) },
      marks: { realPriceRoadCandidates: classes.lvr, cadastre: classes.cadastre, permit: classes.permit, note: '實價登錄為同路名候選（無座標）；地籍、建管尚無資料' },
    };
    if (source) {
      const trades = source.db.prepare("SELECT * FROM lvr_trades WHERE town = ? AND target LIKE '%建物%'").all(town), nowIndex = now.getFullYear() * 12 + now.getMonth();
      const ages = [], byDecade = new Map(), perQuarter = new Map();
      for (const trade of trades) {
        perQuarter.set(String(trade.trade_date || '').slice(0, 5), (perQuarter.get(String(trade.trade_date || '').slice(0, 5)) || 0) + 1);
        const m = /^(\d{3})(\d{2})/.exec(String(trade.completed || ''));
        if (!m) continue;
        ages.push((nowIndex - ((Number(m[1]) + 1911) * 12 + Number(m[2]) - 1)) / 12);
        const decade = `民國${Math.floor(Number(m[1]) / 10) * 10}年代`; byDecade.set(decade, (byDecade.get(decade) || 0) + 1);
      }
      value.realPriceTrades = {
        quarters: source.meta.quarters, buildingTrades: trades.length, withCompletionDate: ages.length,
        ageBuckets: { 'over20y': ages.filter(a => a >= 20).length, 'over30y': ages.filter(a => a >= 30).length, 'over40y': ages.filter(a => a >= 40).length, 'over50y': ages.filter(a => a >= 50).length }, ageYears: stat(ages),
        completedByDecade: [...byDecade].sort().map(([name, count]) => ({ name, count })), buildingTypeTop: topCounts(trades.map(t => ({ b: t.building_type })), 'b', 6), mainUseTop: topCounts(trades.map(t => ({ u: t.main_use })), 'u', 5),
        totalPriceWan: stat(trades.map(t => t.total_price ? t.total_price / 10000 : NaN)), unitPriceWanPerPing: stat(trades.map(t => t.unit_price ? t.unit_price * 3.305785 / 10000 : NaN)), areaPing: stat(trades.map(t => t.building_area ? t.building_area * 0.3025 : NaN)),
        topRoadsByTrades: topCounts(trades.map(t => ({ r: `${t.road || ''}${t.lane ? t.lane + '巷' : ''}` })), 'r', 8), tradesPerQuarter: [...perQuarter].sort().map(([name, count]) => ({ name, count })),
      };
    }
    digestCache.set(slug, { stamp, value }); out.push(value);
  }
  return { generatedAt: now.toISOString(), note: '本機資料庫統計概況；逐筆明細需另外查詢。實價登錄只有門牌沒有座標，建物沒有屋齡欄位。', towns: out };
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
  return { imported, whiteMode: registry.whiteMode !== false, lvr: lvrSummary(), cadastre: cadastreStatus(), dataFolder: dataDirectory() };
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

// 地籍：建物中心所在的地號。中心點判定，建物跨多筆地號時只顯示中心所在的那一筆。
function cadastreLookup(lon, lat) {
  const status = cadastreStatus();
  if (!status.available) return { available: false, message: status.message };
  const parcel = parcelAt(lon, lat);
  return { available: true, source: status.source, latestDataDate: status.latestDataDate, parcel, message: parcel ? null : '建物中心不在任何一筆地號內（可能在道路、水域或地籍圖範圍外）。' };
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
      cadastre: cadastreLookup(row.lon, row.lat),
      source: { name: master.meta.source, tileset: master.meta.tileset, updatedAt: master.meta.updated_at, rule: master.meta.rule, pendingTiles: Number(master.meta.pending_tiles) || 0 },
    };
  }
  const towns = [...new Set((masters || []).flatMap(item => String(item.meta.towns || '').split('、').filter(Boolean)))];
  return { found: false, reason: masters?.length ? `此建物不在已建置的鄉鎮市（目前：${towns.join('、') || '未記錄'}）` : '尚未建立本機建物主檔' };
}
