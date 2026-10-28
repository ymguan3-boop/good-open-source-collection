import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dataDirectory } from './taiwanBuildingPacks.js';

// Local cadastral parcels (地籍圖) imported by scripts/build-cadastre.mjs into <project>/data/local/cadastre-yilan.sqlite.
// The data is the user's own and stays on this computer; nothing here calls an external service.
const FILE_NAME = 'cadastre-yilan.sqlite';
let handle = null, openedAt = 0;
const decoded = new Map();

function open() {
  if (handle && Date.now() - openedAt < 60000) return handle;
  try { handle?.db.close(); } catch { /* already closed */ }
  handle = null; openedAt = Date.now(); decoded.clear();
  const dir = dataDirectory(), file = dir && join(dir, FILE_NAME);
  if (!file || !existsSync(file)) return null;
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    handle = {
      db, file, meta: Object.fromEntries(db.prepare('SELECT key, value FROM meta').all().map(row => [row.key, row.value])),
      inBox: db.prepare('SELECT p.id, p.parcel_id, p.unit, p.scno, p.pmno, p.pcno, p.data_date, p.area_m2, p.geom FROM parcels_rt r JOIN parcels p ON p.id = r.id WHERE r.maxlon >= ? AND r.minlon <= ? AND r.maxlat >= ? AND r.minlat <= ? LIMIT ?'),
      inBoxTown: db.prepare('SELECT p.id, p.parcel_id, p.unit, p.scno, p.pmno, p.pcno, p.data_date, p.area_m2, p.geom FROM parcels_rt r JOIN parcels p ON p.id = r.id WHERE r.maxlon >= ? AND r.minlon <= ? AND r.maxlat >= ? AND r.minlat <= ? AND p.town = ? LIMIT ?'),
      towns: db.prepare('SELECT town, COUNT(*) AS parcels, AVG(clon) AS lon, AVG(clat) AS lat FROM parcels WHERE town IS NOT NULL GROUP BY town ORDER BY parcels DESC').all().map(row => ({ town: row.town, parcels: row.parcels, center: { lon: Number(row.lon.toFixed(5)), lat: Number(row.lat.toFixed(5)) } })),
      byId: db.prepare('SELECT id, parcel_id, unit, scno, pmno, pcno, data_date, area_m2, geom FROM parcels WHERE parcel_id = ?'),
    };
  } catch { handle = null; }
  return handle;
}

/** Rings of a stored geometry blob: [{ring:[[lon,lat]…], outer:boolean}] (shapefile outer rings are clockwise). */
function decode(row) {
  const cached = decoded.get(row.id);
  if (cached) return cached;
  const buffer = Buffer.from(row.geom), view = new Int32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  const parts = view[0], rings = [];
  let cursor = 1 + parts;
  for (let i = 0; i < parts; i++) {
    const count = view[1 + i], ring = new Array(count);
    let area = 0;
    for (let j = 0; j < count; j++) ring[j] = [view[cursor + j * 2] / 1e6, view[cursor + j * 2 + 1] / 1e6];
    for (let j = 1; j < count; j++) area += (ring[j - 1][0] * ring[j][1]) - (ring[j][0] * ring[j - 1][1]);
    cursor += count * 2;
    rings.push({ ring, outer: area <= 0 });
  }
  decoded.set(row.id, rings);
  if (decoded.size > 30000) decoded.delete(decoded.keys().next().value);
  return rings;
}
function insideRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const containsPoint = (rings, lon, lat) => rings.reduce((score, item) => score + (insideRing(lon, lat, item.ring) ? (item.outer ? 1 : -1) : 0), 0) > 0;

/** 地號 as people write it: 母地號, with the 子號 after a dash when it is not zero (0156-0002 → 156-2). */
export const landNumber = row => `${Number(row.pmno)}${Number(row.pcno) ? '-' + Number(row.pcno) : ''}`;
const rocDate = value => /^\d{7}$/.test(String(value || '')) ? `民國 ${Number(String(value).slice(0, 3))} 年 ${Number(String(value).slice(3, 5))} 月 ${Number(String(value).slice(5, 7))} 日` : null;
// 段名：scripts/fetch-cadastre-sections.mjs 取得的地段代碼對照表（國土測繪中心公開服務）；沒有時只顯示代碼。
let sectionTable = null, sectionTableAt = 0;
function sections() {
  if (sectionTable && Date.now() - sectionTableAt < 60000) return sectionTable;
  sectionTableAt = Date.now(); sectionTable = {};
  try { const dir = dataDirectory(), file = dir && join(dir, 'cadastre-sections.json'); if (file && existsSync(file)) sectionTable = JSON.parse(readFileSync(file, 'utf8')).sections || {}; } catch { /* no table */ }
  return sectionTable;
}
const describe = row => { const section = sections()[`${row.unit}${row.scno}`]; return { parcelId: row.parcel_id, landNumber: landNumber(row), sectionName: section?.name || null, sectionTown: section?.town || null, sectionCode: row.scno, officeCode: row.unit, areaM2: row.area_m2, dataDate: rocDate(row.data_date) }; };

export function cadastreStatus() {
  const db = open();
  if (!db) return { available: false, message: '尚未匯入地籍圖。請以 scripts/build-cadastre.mjs 建置 data/local/cadastre-yilan.sqlite。' };
  return { available: true, parcels: Number(db.meta.parcels), latestDataDate: rocDate(db.meta.latest_data_date), source: db.meta.source, importedAt: db.meta.imported_at, sourceSha256: db.meta.source_sha256 || null, note: db.meta.unit_note, licence: db.meta.licence_note, towns: db.towns, townRule: db.meta.town_rule || null };
}

/** Parcel outlines in a view box as GeoJSON (outer rings with their holes), capped so a wide view never floods the browser. */
export function parcelsInBox(box, limit = 4000, town = null) {
  const db = open();
  if (!db) throw new Error('尚未匯入地籍圖');
  if (!box.every(Number.isFinite) || box[0] >= box[2] || box[1] >= box[3]) throw new Error('範圍不正確');
  const cap = Math.max(1, Math.min(8000, Number(limit) || 4000)), rows = town ? db.inBoxTown.all(box[0], box[2], box[1], box[3], String(town), cap + 1) : db.inBox.all(box[0], box[2], box[1], box[3], cap + 1), truncated = rows.length > cap, features = [];
  for (const row of rows.slice(0, cap)) {
    const rings = decode(row), polygons = [];
    for (const item of rings) { if (item.outer || !polygons.length) polygons.push([item.ring]); else polygons.at(-1).push(item.ring); }
    features.push({ type: 'Feature', geometry: polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons }, properties: describe(row) });
  }
  return { type: 'FeatureCollection', features, truncated, limit: cap };
}

/** The parcel whose boundary contains a point (null when the point is on a road, water or outside the data). */
export function parcelAt(lon, lat) {
  const db = open();
  if (!db) return null;
  const e = 1e-6;
  for (const row of db.inBox.all(lon - e, lon + e, lat - e, lat + e, 20)) if (containsPoint(decode(row), lon, lat)) return describe(row);
  return null;
}

/** Ids (BUILD_ID → parcel) for many points; used to mark which buildings sit on a known parcel. */
export function parcelsAtPoints(points) {
  const db = open();
  if (!db) return null;
  const e = 1e-6;
  return points.map(([lon, lat]) => {
    for (const row of db.inBox.all(lon - e, lon + e, lat - e, lat + e, 20)) if (containsPoint(decode(row), lon, lat)) return row.parcel_id;
    return null;
  });
}

export function parcelById(parcelId) {
  const db = open();
  const row = db?.byId.get(String(parcelId));
  return row ? describe(row) : null;
}

/** A parcel with its rings (for point-in-parcel, distance and imagery masks): the building blocks of the inventory cross-check. */
export function parcelRecord(parcelId) {
  const db = open();
  const row = db?.byId.get(String(parcelId));
  return row ? { ...describe(row), rings: decode(row), town: db.db.prepare('SELECT town, clon, clat FROM parcels WHERE id = ?').get(row.id) } : null;
}
/** Section name → candidate section codes (some names repeat in different townships, so the township narrows it). */
export function sectionCodesByName(name, town = null) {
  const hits = Object.entries(sections()).filter(([, value]) => value.name === name).map(([key, value]) => ({ unit: key.slice(0, 2), scno: key.slice(2), town: value.town }));
  const narrowed = town ? hits.filter(hit => hit.town === town) : [];
  return narrowed.length ? narrowed : hits;
}
export const parcelIdOf = (unit, scno, pmno, pcno = 0) => `${unit}${scno}${String(pmno).padStart(4, '0')}${String(pcno).padStart(4, '0')}`;
/** Current section names that contain an old (pre-resurvey) name, e.g. 永同段 → 新永同段. Hints only: parcel numbers change at resurvey. */
export function similarSections(name, town = null) {
  const base = String(name || '').replace(/段$/, '').replace(/[一二三四五六七八九十]+$/, '');
  if (base.length < 2) return [];
  return [...new Set(Object.values(sections()).filter(value => value.name !== name && value.name.includes(base) && (!town || value.town === town)).map(value => `${value.name}（${value.town}）`))].slice(0, 5);
}
