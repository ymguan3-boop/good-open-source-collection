// Imports a county cadastral-parcel shapefile (地籍圖, TWD97 TM2 polygons) into a local SQLite database.
// The data is NOT bundled with the app or GitHub: it lives in data/local (git-ignored) and is read by the local
// provider service only. Geometry is stored as Int32 micro-degree blobs (WGS84), with an R*Tree for bbox queries.
//
//   node scripts/build-cadastre.mjs --shp <folder-or-.shp> --db data/local/cadastre-yilan.sqlite [--villages data/local/yilan-villages.geojson] [--source-file <archive>]
//
// --villages  township polygons (GeoJSON with TOWNNAME). Each parcel gets the township its centre falls in (	own column),
//             so the app can show the cadastre per township. Without it every parcel has an empty town.
//
// The shapefile must hold Polygon records (type 5) in EPSG:3826 (TWD97 / TM2 zone 121) with the usual 地政司 fields
// (PMNO 母地號, PCNO 子號, SCNO 段代碼, UNIT 地政事務所/鄉鎮代碼, DATE 資料日期, AA10 面積).
import { readFileSync, existsSync, mkdirSync, openSync, readSync, closeSync, statSync, createReadStream, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '..');
const workRequire = createRequire(resolve(root, '.work', 'upstream', 'package.json'));
const proj4 = workRequire('proj4');
const TWD97 = '+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
const toWgs = proj4(TWD97, 'EPSG:4326');

const args = Object.fromEntries(process.argv.slice(2).reduce((list, value, index, all) => value.startsWith('--') ? [...list, [value.slice(2), all[index + 1]?.startsWith('--') || all[index + 1] === undefined ? true : all[index + 1]]] : list, []));
const shpArg = args.shp && resolve(String(args.shp));
if (!shpArg || !existsSync(shpArg)) throw new Error('請用 --shp 指定 .shp 檔或其資料夾');
const shpFile = statSync(shpArg).isDirectory() ? join(shpArg, 'cadastre.shp') : shpArg;
const base = shpFile.replace(/\.shp$/i, ''), dbfFile = base + '.dbf';
if (!existsSync(shpFile) || !existsSync(dbfFile)) throw new Error('找不到成對的 .shp / .dbf');
const dbFile = resolve(args.db && args.db !== true ? args.db : join(root, 'data/local/cadastre-yilan.sqlite'));
mkdirSync(dirname(dbFile), { recursive: true });

// ---- dbf reader (records are fixed width; field values are UTF-8 per the .cpg) ------------------------------
const dbfFd = openSync(dbfFile, 'r'), head = Buffer.alloc(32);
readSync(dbfFd, head, 0, 32, 0);
const recordCount = head.readUInt32LE(4), headerLength = head.readUInt16LE(8), recordLength = head.readUInt16LE(10);
const fieldBuffer = Buffer.alloc(headerLength - 32);
readSync(dbfFd, fieldBuffer, 0, fieldBuffer.length, 32);
const fields = [];
for (let o = 0; fieldBuffer[o] !== 0x0d && o < fieldBuffer.length; o += 32) fields.push({ name: fieldBuffer.toString('latin1', o, o + 11).replace(/\0.*$/, ''), length: fieldBuffer[o + 16] });
const field = Object.fromEntries(fields.map(item => [item.name, item]));
for (const name of ['PMNO', 'PCNO', 'SCNO', 'UNIT']) if (!field[name]) throw new Error(`dbf 缺少必要欄位 ${name}`);
const dbfChunk = Buffer.alloc(recordLength * 4000);
function* dbfRecords() {
  for (let first = 0; first < recordCount; first += 4000) {
    const count = Math.min(4000, recordCount - first);
    readSync(dbfFd, dbfChunk, 0, count * recordLength, headerLength + first * recordLength);
    for (let r = 0; r < count; r++) {
      let p = r * recordLength + 1;
      const row = {};
      for (const item of fields) { row[item.name] = dbfChunk.toString('utf8', p, p + item.length).trim(); p += item.length; }
      yield row;
    }
  }
}

// ---- shp reader --------------------------------------------------------------------------------------------
const shpFd = openSync(shpFile, 'r'), fileSize = statSync(shpFile).size, top = Buffer.alloc(100);
readSync(shpFd, top, 0, 100, 0);
if (top.readInt32BE(0) !== 9994 || top.readInt32LE(32) !== 5) throw new Error('不是 Polygon 型 shapefile');
function* shpRecords() {
  const chunk = Buffer.alloc(8 * 1024 * 1024);
  let position = 100, carry = Buffer.alloc(0);
  while (position < fileSize || carry.length) {
    const read = position < fileSize ? readSync(shpFd, chunk, 0, chunk.length, position) : 0;
    position += read;
    let data = carry.length ? Buffer.concat([carry, chunk.subarray(0, read)]) : chunk.subarray(0, read);
    let offset = 0;
    while (offset + 8 <= data.length) {
      const content = data.readInt32BE(offset + 4) * 2;
      if (offset + 8 + content > data.length) break;
      yield data.subarray(offset + 8, offset + 8 + content);
      offset += 8 + content;
    }
    carry = Buffer.from(data.subarray(offset));
    if (!read && offset >= data.length) break;
    if (!read && carry.length) throw new Error('shp 檔尾有不完整的記錄');
  }
}

const sha256 = file => new Promise((resolveHash, reject) => { const hash = createHash('sha256'); createReadStream(file).on('data', part => hash.update(part)).on('end', () => resolveHash(hash.digest('hex'))).on('error', reject); });
const sourceFile = args['source-file'] && args['source-file'] !== true ? resolve(args['source-file']) : null;
const sourceHash = sourceFile && existsSync(sourceFile) ? await sha256(sourceFile) : null;

// ---- township of each parcel (by centre point; point-in-polygon against the township boundaries) -------------
const villagesFile = args.villages && args.villages !== true ? resolve(args.villages) : join(root, 'data/local/yilan-villages.geojson');
const townAreas = [];
if (existsSync(villagesFile)) {
  const byTown = new Map();
  for (const feature of JSON.parse(readFileSync(villagesFile, 'utf8')).features) {
    const name = feature.properties?.TOWNNAME;
    if (!name) continue;
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    byTown.set(name, [...(byTown.get(name) || []), ...polygons]);
  }
  for (const [name, polygons] of byTown) for (const rings of polygons) {
    const xs = rings[0].map(p => p[0]), ys = rings[0].map(p => p[1]);
    townAreas.push({ name, rings, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
  }
}
const ringContains = (ring, x, y) => { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; } return inside; };
const inTown = (area, x, y) => x >= area.box[0] && x <= area.box[2] && y >= area.box[1] && y <= area.box[3] && ringContains(area.rings[0], x, y) && !area.rings.slice(1).some(hole => ringContains(hole, x, y));
function townAt(x, y, fallback) {
  for (const area of townAreas) if (inTown(area, x, y)) return area.name;
  for (const area of townAreas) if (inTown(area, fallback[0], fallback[1])) return area.name;
  return null;
}

const db = new DatabaseSync(dbFile);
db.exec(`
  PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;
  DROP TABLE IF EXISTS parcels; DROP TABLE IF EXISTS parcels_rt; DROP TABLE IF EXISTS meta;
  CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE parcels(id INTEGER PRIMARY KEY, town TEXT, parcel_id TEXT, unit TEXT, scno TEXT, scno_ext TEXT, pmno TEXT, pcno TEXT, data_date TEXT, source TEXT, area_m2 REAL, clon REAL, clat REAL, extras TEXT, geom BLOB);
  CREATE VIRTUAL TABLE parcels_rt USING rtree(id, minlon, maxlon, minlat, maxlat);
`);
const insert = db.prepare('INSERT INTO parcels(id, town, parcel_id, unit, scno, scno_ext, pmno, pcno, data_date, source, area_m2, clon, clat, extras, geom) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
const insertRt = db.prepare('INSERT INTO parcels_rt(id, minlon, maxlon, minlat, maxlat) VALUES (?,?,?,?,?)');
const extraNames = fields.map(item => item.name).filter(name => !['PMNO', 'PCNO', 'SCNO', 'SCNOEXT', 'ID', 'DATE', 'SOURCE', 'UNIT', 'AA10'].includes(name));

let n = 0, skipped = 0, latest = '';
const started = Date.now();
db.exec('BEGIN');
const rows = dbfRecords();
for (const record of shpRecords()) {
  const row = rows.next().value;
  if (!row) throw new Error('shp 與 dbf 記錄數不一致');
  if (record.readInt32LE(0) !== 5) { skipped++; continue; }
  const parts = record.readInt32LE(36), points = record.readInt32LE(40), partStart = [];
  for (let i = 0; i < parts; i++) partStart.push(record.readInt32LE(44 + i * 4));
  partStart.push(points);
  const xyOffset = 44 + parts * 4, coords = new Int32Array(points * 2);
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity, sx = 0, sy = 0;
  for (let i = 0; i < points; i++) {
    const [lon, lat] = toWgs.forward([record.readDoubleLE(xyOffset + i * 16), record.readDoubleLE(xyOffset + i * 16 + 8)]);
    coords[i * 2] = Math.round(lon * 1e6); coords[i * 2 + 1] = Math.round(lat * 1e6);
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon; if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    sx += lon; sy += lat;
  }
  const lengths = Int32Array.from(partStart.slice(1).map((end, i) => end - partStart[i])), header = Int32Array.of(parts, ...lengths);
  const blob = Buffer.concat([Buffer.from(header.buffer), Buffer.from(coords.buffer)]);
  const extras = {}; for (const name of extraNames) if (row[name] !== '') extras[name] = row[name];
  const area = Number(row.AA10);
  n++;
  insert.run(n, townAt(sx / points, sy / points, [coords[0] / 1e6, coords[1] / 1e6]), `${row.UNIT}${row.SCNO}${row.PMNO}${row.PCNO}`, row.UNIT, row.SCNO, row.SCNOEXT || null, row.PMNO, row.PCNO, row.DATE || null, row.SOURCE || null, Number.isFinite(area) ? area : null, sx / points, sy / points, JSON.stringify(extras), blob);
  insertRt.run(n, Math.fround(minLon), Math.fround(maxLon), Math.fround(minLat), Math.fround(maxLat));
  if (row.DATE > latest) latest = row.DATE;
  if (n % 20000 === 0) { db.exec('COMMIT; BEGIN'); process.stdout.write(`\r${n.toLocaleString()} / ${recordCount.toLocaleString()} 筆（${Math.round((Date.now() - started) / 1000)} 秒）`); }
}
db.exec('COMMIT');
console.log(`\n匯入 ${n.toLocaleString()} 筆，略過 ${skipped} 筆非多邊形。`);
db.exec('CREATE INDEX parcels_key ON parcels(unit, scno, pmno, pcno); CREATE INDEX parcels_id ON parcels(parcel_id); CREATE INDEX parcels_town ON parcels(town);');

const meta = {
  source: '內政部地政司 地籍圖（使用者提供之 shapefile）', source_file: sourceFile ? sourceFile.split(/[\\/]/).pop() : null, source_sha256: sourceHash, shp_bytes: String(fileSize),
  crs_source: 'EPSG:3826 TWD97 / TM2 zone 121', crs_stored: 'EPSG:4326（Int32 微度）', parcels: String(n), latest_data_date: latest, imported_at: new Date().toISOString(),
  town_rule: townAreas.length ? '各地號依其中心點所在的鄉鎮市界（TOWNNAME）歸屬；中心不在任何鄉鎮市界內者 town 為空。' : '未指定 --villages，地號沒有鄉鎮市歸屬。',
  unit_note: 'UNIT 是地政事務所代碼（本檔只有 GA、GB 兩個主要代碼），不是鄉鎮市；鄉鎮市請以空間位置判定。',
  licence_note: '使用者自行取得之地籍圖；僅供本機使用，未隨程式或 GitHub 發布。',
};
const put = db.prepare('INSERT INTO meta(key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(meta)) put.run(key, value === null ? '' : String(value));
db.close(); closeSync(dbfFd); closeSync(shpFd);
console.log(`完成：${dbFile}（${Math.round(statSync(dbFile).size / 1048576)} MB，最新資料日期 ${latest}）`);
