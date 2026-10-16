// Builds a local building master table (SQLite) from NLSC individual-building 3D Tiles.
// Only the building attributes are kept (the GLB geometry/textures are discarded), so
// nothing but a small database stays on disk. Resumable and rate-limited.
//
//   node scripts/build-building-master.mjs --area area.geojson --db data/local/yilan-buildings.sqlite [--county 宜蘭縣] [--limit 50]
//
// --area  GeoJSON polygon(s) to cover (e.g. a township). Tiles whose bounding sphere touches it are read.
import '../overlay/server/providers/nlscTls.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
// Dependencies live in the installed workspace (.work/upstream), not in the repo root.
const workRequire = createRequire(resolve(import.meta.dirname, '..', '.work', 'upstream', 'package.json'));
const turf = workRequire('@turf/turf'), proj4 = workRequire('proj4');

const args = Object.fromEntries(process.argv.slice(2).reduce((list, value, index, all) => value.startsWith('--') ? [...list, [value.slice(2), all[index + 1]?.startsWith('--') || all[index + 1] === undefined ? true : all[index + 1]]] : list, []));
const root = resolve(import.meta.dirname, '..');
const areaFile = args.area && resolve(args.area), dbFile = resolve(args.db || resolve(root, 'data/local/yilan-buildings.sqlite'));
const limit = Number(args.limit) || Infinity, CONCURRENCY = Math.min(8, Number(args.concurrency) || 6);
// White-model tiles (textures removed) are kept next to the database unless --no-white is given.
const WHITE = args['no-white'] !== true, whiteDir = resolve(args.white && args.white !== true ? args.white : dbFile.replace(/.sqlite$/, '') .replace(/-buildings$/, '') + '-white');
const TILESET = args.tileset || 'https://3dtiles.nlsc.gov.tw/building/tiles3d/36/tileset.json'; // 宜蘭縣分棟版建物模型
if (!areaFile || !existsSync(areaFile)) throw new Error('請用 --area 指定 GeoJSON 範圍檔');
const TWD97 = '+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
const area = JSON.parse(readFileSync(areaFile, 'utf8'));
const polygons = (area.type === 'FeatureCollection' ? area.features : [area]).filter(f => /Polygon/.test(f.geometry?.type));
const boxes = polygons.map(f => turf.bbox(f));

mkdirSync(dirname(dbFile), { recursive: true });
const db = new DatabaseSync(dbFile);
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS buildings(build_id TEXT PRIMARY KEY, lon REAL, lat REAL, e97 REAL, n97 REAL, height REAL, build_no TEXT, name TEXT, btype TEXT, mdate TEXT, m_mdate TEXT, source_des TEXT, c_frameid TEXT, county TEXT, lod TEXT, in_area INTEGER, tile TEXT);
CREATE INDEX IF NOT EXISTS buildings_lonlat ON buildings(lon, lat);
CREATE TABLE IF NOT EXISTS tiles_done(uri TEXT PRIMARY KEY, buildings INTEGER, bytes INTEGER);
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);`);

async function fetchBytes(url, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000), redirect: 'error' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= tries) throw error;
      await new Promise(done => setTimeout(done, 1500 * attempt));
    }
  }
}
function lonLat([x, y, z]) {
  const lon = Math.atan2(y, x), p = Math.hypot(x, y); let lat = Math.atan2(z, p * (1 - 0.00669437999014));
  for (let i = 0; i < 6; i++) { const n = 6378137 / Math.sqrt(1 - 0.00669437999014 * Math.sin(lat) ** 2); lat = Math.atan2(z + 0.00669437999014 * n * Math.sin(lat), p); }
  return [lon * 180 / Math.PI, lat * 180 / Math.PI];
}
// Tile is needed when its bounding sphere reaches an area polygon.
function touches(sphere) {
  if (!sphere || sphere[3] <= 0) return false;
  const [lon, lat] = lonLat(sphere), dlat = sphere[3] / 111320, dlon = dlat / Math.cos(lat * Math.PI / 180);
  for (let i = 0; i < polygons.length; i++) {
    const b = boxes[i];
    if (lon + dlon < b[0] || lon - dlon > b[2] || lat + dlat < b[1] || lat - dlat > b[3]) continue;
    const point = turf.point([lon, lat]);
    if (turf.booleanPointInPolygon(point, polygons[i])) return true;
    const outline = turf.polygonToLine(polygons[i]);
    for (const line of outline.type === 'FeatureCollection' ? outline.features : [outline]) if (turf.pointToLineDistance(point, line, { units: 'meters' }) <= sphere[3]) return true;
  }
  return false;
}
function readTable(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'glTF') throw new Error('不是 GLB');
  const jsonLength = buffer.readUInt32LE(12), json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).trim());
  const binary = buffer.subarray(20 + jsonLength + 8), rows = [];
  for (const table of json.extensions?.EXT_structural_metadata?.propertyTables || []) {
    const column = {};
    for (const [name, property] of Object.entries(table.properties || {})) {
      if (!Number.isInteger(property.values) || !Number.isInteger(property.stringOffsets)) continue;
      const values = json.bufferViews[property.values], offsets = json.bufferViews[property.stringOffsets];
      const data = binary.subarray(values.byteOffset || 0, (values.byteOffset || 0) + values.byteLength);
      const off = binary.subarray(offsets.byteOffset || 0, (offsets.byteOffset || 0) + offsets.byteLength);
      const width = { UINT8: 1, UINT16: 2, UINT32: 4 }[property.stringOffsetType || 'UINT32']; if (!width) continue;
      column[name] = Array.from({ length: table.count }, (_, i) => data.toString('utf8', off.readUIntLE(i * width, width), off.readUIntLE((i + 1) * width, width)));
    }
    for (let i = 0; i < table.count; i++) rows.push(Object.fromEntries(Object.entries(column).map(([name, list]) => [name, list[i]])));
  }
  return rows;
}
/** Removes textures and texture coordinates; keeps geometry, feature ids and the attribute table (valid GLB 2.0). */
function stripTextures(buffer) {
  const jsonLength = buffer.readUInt32LE(12), json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).trim()), bin = buffer.subarray(20 + jsonLength + 8);
  delete json.images; delete json.textures; delete json.samplers;
  json.materials = [{ pbrMetallicRoughness: { baseColorFactor: [0.92, 0.92, 0.92, 1], metallicFactor: 0, roughnessFactor: 0.95 }, doubleSided: true }];
  json.extensionsUsed = (json.extensionsUsed || []).filter(name => name !== 'EXT_texture_bound');
  if (!json.extensionsRequired?.length) delete json.extensionsRequired;
  for (const mesh of json.meshes || []) for (const primitive of mesh.primitives) {
    for (const key of Object.keys(primitive.attributes)) if (/^TEXCOORD_|^_TEXBOUND_/.test(key)) delete primitive.attributes[key];
    primitive.material = 0;
  }
  // Keep only the accessors still referenced, then only the buffer views those and the property tables use.
  const used = new Set();
  for (const mesh of json.meshes || []) for (const primitive of mesh.primitives) { Object.values(primitive.attributes).forEach(i => used.add(i)); if (primitive.indices != null) used.add(primitive.indices); }
  const accessorMap = new Map(), accessors = [];
  [...used].sort((a, b) => a - b).forEach(old => { accessorMap.set(old, accessors.length); accessors.push(json.accessors[old]); });
  for (const mesh of json.meshes || []) for (const primitive of mesh.primitives) {
    for (const key of Object.keys(primitive.attributes)) primitive.attributes[key] = accessorMap.get(primitive.attributes[key]);
    if (primitive.indices != null) primitive.indices = accessorMap.get(primitive.indices);
  }
  json.accessors = accessors;
  const properties = (json.extensions?.EXT_structural_metadata?.propertyTables || []).flatMap(table => Object.values(table.properties || {}));
  const keepViews = new Set(accessors.map(a => a.bufferView)); for (const p of properties) for (const key of ['values', 'stringOffsets', 'arrayOffsets']) if (Number.isInteger(p[key])) keepViews.add(p[key]);
  const viewMap = new Map(), views = [], chunks = []; let offset = 0;
  [...keepViews].sort((a, b) => a - b).forEach(old => {
    const view = json.bufferViews[old], data = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength), pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
    viewMap.set(old, views.length); views.push({ ...view, byteOffset: offset, buffer: 0 }); chunks.push(data); offset += data.length;
  });
  for (const a of accessors) a.bufferView = viewMap.get(a.bufferView);
  for (const p of properties) for (const key of ['values', 'stringOffsets', 'arrayOffsets']) if (Number.isInteger(p[key])) p[key] = viewMap.get(p[key]);
  json.bufferViews = views;
  const tail = (4 - (offset % 4)) % 4; if (tail) { chunks.push(Buffer.alloc(tail)); offset += tail; }
  json.buffers = [{ byteLength: offset }];
  const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8'), jsonPad = Buffer.alloc((4 - (jsonBuffer.length % 4)) % 4, 0x20), body = Buffer.concat(chunks);
  const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8);
  const total = 12 + 8 + jsonBuffer.length + jsonPad.length + 8 + body.length;
  header.write('glTF', 0, 'ascii'); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
  jsonHeader.writeUInt32LE(jsonBuffer.length + jsonPad.length, 0); jsonHeader.write('JSON', 4, 'ascii');
  binHeader.writeUInt32LE(body.length, 0); Buffer.from([0x42, 0x49, 0x4e, 0x00]).copy(binHeader, 4);
  return Buffer.concat([header, jsonHeader, jsonBuffer, jsonPad, binHeader, body]);
}
const clean = value => (value === undefined || value === 'NA' || value === '') ? null : value;

console.log('讀取圖磚索引…');
const tileset = JSON.parse((await fetchBytes(TILESET)).toString('utf8'));
const baseUrl = new URL('.', TILESET).href, needed = [];
// Prune the original hierarchy to this area. Two index files are written next to the database:
//   <slug>-tileset-nlsc.json  textured tiles streamed from NLSC (all levels of detail)
//   <slug>-tileset-white.json  only the leaf tiles saved here as white models (served locally)
const slug = basename(dbFile).replace(/\.sqlite$/, '').replace(/-buildings$/, '');
const firstContent = tile => (tile.contents || [tile.content]).filter(Boolean)[0];
function prune(tile) {
  if (tile.transform) throw new Error('索引含座標轉換，不支援');
  if (!touches(tile.boundingVolume?.sphere)) return null;
  const children = (tile.children || []).map(prune).filter(Boolean), content = firstContent(tile), uri = content && (content.uri || content.url);
  const isLeaf = !(tile.children?.length);
  if (isLeaf) { if (!/\.glb$/i.test(uri || '')) return null; needed.push(uri); }
  else if (!children.length) return null;
  return { boundingVolume: tile.boundingVolume, geometricError: tile.geometricError, ...(isLeaf ? {} : { children }), ...(uri && /\.glb$/i.test(uri) ? { uri } : {}) };
}
const VIEW_RANGE_M = 4000;
const prunedRoot = prune(tileset.root);
function emit(node, mode) {
  const out = { boundingVolume: node.boundingVolume, geometricError: node.geometricError };
  if (node.children) { out.children = node.children.map(child => emit(child, mode)).filter(Boolean); if (mode === 'white' && !out.children.length) return null; }
  const leaf = !node.children;
  if (node.uri && (mode === 'nlsc' || leaf)) out.content = { uri: mode === 'nlsc' ? new URL(node.uri, baseUrl).href : '/api/taiwan/nlsc-buildings/white/' + slug + '/' + node.uri };
  // White tiles are the finest level with no coarse parents, so without a request volume the viewer would load every
  // tile in view at any distance. A tile is requested and drawn only while the camera is within VIEW_RANGE_M of it.
  if (mode === 'white' && leaf && node.boundingVolume?.sphere) { const s = node.boundingVolume.sphere; out.viewerRequestVolume = { sphere: [s[0], s[1], s[2], s[3] + VIEW_RANGE_M] }; }
  return out;
}
if (prunedRoot) {
  for (const mode of ['nlsc', 'white']) {
    const root = emit(prunedRoot, mode);
    writeFileSync(resolve(dirname(dbFile), slug + '-tileset-' + mode + '.json'), JSON.stringify({ asset: { version: '1.1' }, geometricError: tileset.geometricError, root: { ...root, refine: 'REPLACE' } }));
  }
  console.log('已寫入索引：' + slug + '-tileset-nlsc.json、' + slug + '-tileset-white.json');
}
if (args['tileset-only']) { console.log('僅重建索引（未下載圖磚）'); process.exit(0); }
const done = new Set(db.prepare('SELECT uri FROM tiles_done').all().map(row => row.uri));
if (WHITE) mkdirSync(whiteDir, { recursive: true });
const whitePath = uri => resolve(whiteDir, uri);
const todo = [...new Set(needed)].filter(uri => !done.has(uri) || (WHITE && !existsSync(whitePath(uri)))).slice(0, limit);
console.log(`範圍內圖磚 ${new Set(needed).size} 個；已完成 ${done.size}；本次處理 ${todo.length}（約 ${(todo.length * 0.85 / 1024).toFixed(1)} GB 傳輸，下載後即丟棄）`);

const insert = db.prepare('INSERT OR REPLACE INTO buildings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
const markDone = db.prepare('INSERT OR REPLACE INTO tiles_done VALUES (?,?,?)');
let processed = 0, failed = 0, bytes = 0, added = 0, next = 0, whiteBytes = 0; const started = Date.now();
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, async () => {
  while (next < todo.length) {
    const uri = todo[next++];
    try {
      const buffer = await fetchBytes(new URL(uri, baseUrl).href); bytes += buffer.length;
      const rows = readTable(buffer);
      if (WHITE) { const white = stripTextures(buffer); readTable(white); writeFileSync(whitePath(uri), white); whiteBytes += white.length; }
      db.exec('BEGIN');
      for (const row of rows) {
        const e = Number(row.CENT_E_97), n = Number(row.CENT_N_97), id = clean(row.BUILD_ID?.trim()) || clean(row.BUILD_NO?.trim());
        if (!id || !Number.isFinite(e) || !Number.isFinite(n)) continue;
        const [lon, lat] = proj4(TWD97, 'EPSG:4326', [e, n]);
        if (lon < 117 || lon > 123.5 || lat < 20 || lat > 27) continue;
        const inside = polygons.some((p, i) => lon >= boxes[i][0] && lon <= boxes[i][2] && lat >= boxes[i][1] && lat <= boxes[i][3] && turf.booleanPointInPolygon(turf.point([lon, lat]), p));
        insert.run(id, lon, lat, e, n, Number(row.BUILD_H) || null, clean(row.BUILD_NO), clean(row.BUILDNAME), clean(row.BUILDTYPE), clean(row.MDATE), clean(row.M_MDATE), clean(row.SOURCE_DES), clean(row.C_FRAMEID), clean(row.COUNTY), clean(row.MODEL_LOD), inside ? 1 : 0, uri); added++;
      }
      markDone.run(uri, rows.length, buffer.length); db.exec('COMMIT');
    } catch (error) { try { db.exec('ROLLBACK'); } catch { /* no open transaction */ } failed++; console.warn('失敗', uri, error.message); }
    if (++processed % 100 === 0 || processed === todo.length) {
      const seconds = (Date.now() - started) / 1000;
      console.log(`${processed}/${todo.length} 圖磚；${(bytes / 1048576).toFixed(0)} MB；${(bytes / 1048576 / seconds).toFixed(1)} MB/s；失敗 ${failed}${WHITE ? `；白模 ${(whiteBytes / 1048576).toFixed(0)} MB` : ''}`);
    }
  }
}));

const counts = db.prepare('SELECT COUNT(*) AS total, SUM(in_area) AS inside FROM buildings').get();
const pending = needed.length ? new Set(needed.filter(uri => !db.prepare('SELECT 1 FROM tiles_done WHERE uri=?').get(uri))).size : 0;
const setMeta = db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)');
setMeta.run('source', 'NLSC 分棟版 3D Tiles 屬性（內政部國土測繪中心）'); setMeta.run('tileset', TILESET);
setMeta.run('area_file', areaFile); setMeta.run('updated_at', new Date().toISOString()); setMeta.run('pending_tiles', String(pending));
const towns = [...new Set(polygons.map(f => f.properties?.TOWNNAME).filter(Boolean))].join('、') || String(args.towns || '');
if (towns && !pending) setMeta.run('towns', towns);
setMeta.run('rule', 'BUILD_ID 去重；中心點座標為官方 CENT_E_97/CENT_N_97（TWD97）；非建物足跡');
console.log(`完成：資料庫共 ${counts.total} 棟（範圍內 ${counts.inside}）；尚未處理圖磚 ${pending}；失敗 ${failed}`);
db.close();
if (!pending && !failed) {
  const hash = createHash('sha256'); await new Promise((done, fail) => createReadStream(dbFile).on('data', c => hash.update(c)).on('end', done).on('error', fail));
  console.log('SHA-256（資料庫檔，含 WAL 已合併後）:', hash.digest('hex'));
}
