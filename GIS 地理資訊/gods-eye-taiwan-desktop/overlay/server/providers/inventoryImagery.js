import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// 航照取得與像素統計（本機）。航照：國土測繪中心 PHOTO2 WMTS 現況正射影像（服務不提供實際拍攝日，一律標「拍攝日期未知」）。
// 查證照片：清冊內的 landchg.nlma.gov.tw URL，逐張實際下載後才算「已讀取」；403／404／逾時／非影像都記為不可評。
const require = createRequire(import.meta.url);
let sharpModule = null;
const sharp = () => (sharpModule ??= require('sharp'));

export const IMAGERY_VERSION = 'imagery-2026.10.27b';
export const WMTS = { name: '國土測繪中心 PHOTO2 通用版電子地圖（正射影像）WMTS', layer: 'PHOTO2', matrixSet: 'GoogleMapsCompatible', base: 'https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible', licence: '政府資料開放授權（國土測繪中心）；本機僅保存取圖後的統計與雜湊，影像快取留在 data/local，不上傳。' };

const TILE = 256, R = 6378137;
const worldPixel = (lon, lat, z) => { const n = TILE * 2 ** z, s = Math.sin(lat * Math.PI / 180); return { x: (lon + 180) / 360 * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n }; };
export const metresPerPixel = (lat, z) => 2 * Math.PI * R * Math.cos(lat * Math.PI / 180) / (TILE * 2 ** z);
const metresPerDegree = lat => ({ x: 111320 * Math.cos(lat * Math.PI / 180), y: 110540 });

const sleep = ms => new Promise(done => setTimeout(done, ms));
let tileGate = Promise.resolve(), tileSlots = 0;
async function limited(task, max = 4) {
  while (tileSlots >= max) await sleep(25);
  tileSlots++;
  try { return await task(); } finally { tileSlots--; }
}

export function cacheDirectory(dataDir) { const dir = join(dataDir, 'inventory', 'cache'); mkdirSync(dir, { recursive: true }); return dir; }

async function fetchTile(z, x, y, dir, signal) {
  const key = `tile-${z}-${x}-${y}.jpg`, file = join(dir, key);
  if (existsSync(file)) return { buffer: readFileSync(file), cached: true, status: 200 };
  return limited(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(`${WMTS.base}/${z}/${y}/${x}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)].filter(Boolean)) });
        if (response.status === 429 || response.status >= 500) { await sleep(600 * (attempt + 1)); continue; }
        if (!response.ok) return { buffer: null, status: response.status };
        const buffer = Buffer.from(await response.arrayBuffer());
        writeFileSync(file, buffer);
        return { buffer, status: 200, cached: false };
      } catch (error) { if (signal?.aborted) throw error; if (attempt === 2) return { buffer: null, status: 0, error: error.message }; await sleep(400); }
    }
    return { buffer: null, status: 0, error: '重試失敗' };
  });
}

const insideRing = (lon, lat, ring) => { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside; } return inside; };
export const insideRings = (rings, lon, lat) => rings.reduce((score, item) => score + (insideRing(lon, lat, item.ring) ? (item.outer ? 1 : -1) : 0), 0) > 0;

/** Distance in metres from a point to a parcel polygon (0 when inside). Planar approximation, fine below a few km. */
export function distanceToRings(rings, lon, lat) {
  if (insideRings(rings, lon, lat)) return 0;
  const k = metresPerDegree(lat);
  let best = Infinity;
  for (const { ring } of rings) for (let i = 1; i < ring.length; i++) {
    const ax = (ring[i - 1][0] - lon) * k.x, ay = (ring[i - 1][1] - lat) * k.y, bx = (ring[i][0] - lon) * k.x, by = (ring[i][1] - lat) * k.y;
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy, t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

const CLASSES = ['vegetation', 'bare', 'bright', 'shadow', 'other'];
function classify(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max < 40) return 'shadow';
  // 暗綠的樹冠（陰影下的植生）也算植生：v27b 依目視抽查修正，原 v27 會把它歸為陰影或其他。
  if ((g > r + 8 && g > b + 6) || (max < 120 && g >= r + 3 && g >= b + 3)) return 'vegetation';
  if (max - min < 32 && max > 105) return 'bright';
  if (r >= g - 4 && g >= b - 4 && r > b + 12) return 'bare';
  return 'other';
}
const emptyCounts = () => Object.fromEntries([...CLASSES, 'valid', 'total'].map(key => [key, 0]));
const fractions = counts => counts.valid ? { ...Object.fromEntries(CLASSES.map(key => [key, Math.round(counts[key] / counts.valid * 1000) / 1000])), validPixels: counts.valid, totalPixels: counts.total } : null;

/**
 * Aerial composite around a parcel/point.
 * bbox: [minLon,minLat,maxLon,maxLat]; masks: {parcel: rings|null, point:{lon,lat,radiusM}} — class fractions are computed inside each mask.
 */
export async function aerialFor({ bbox, point, rings, radiusM, dataDir, signal }) {
  const dir = cacheDirectory(dataDir), centreLat = (bbox[1] + bbox[3]) / 2;
  let z = 19, grid;
  for (; z >= 16; z--) {
    const a = worldPixel(bbox[0], bbox[3], z), b = worldPixel(bbox[2], bbox[1], z);
    grid = { x0: Math.floor(a.x / TILE), x1: Math.floor(b.x / TILE), y0: Math.floor(a.y / TILE), y1: Math.floor(b.y / TILE), a, b };
    if ((grid.x1 - grid.x0 + 1) * (grid.y1 - grid.y0 + 1) <= 9) break;
  }
  const cols = grid.x1 - grid.x0 + 1, rows = grid.y1 - grid.y0 + 1, fetchedAt = new Date().toISOString(), tileInfo = [];
  const pieces = await Promise.all(Array.from({ length: cols * rows }, (_, i) => {
    const cx = grid.x0 + i % cols, cy = grid.y0 + Math.floor(i / cols);
    return fetchTile(z, cx, cy, dir, signal).then(tile => ({ cx, cy, tile }));
  }));
  const composites = [];
  let usable = 0;
  for (const { cx, cy, tile } of pieces) {
    let ok = false;
    if (tile.buffer) {
      try {
        const stats = await sharp()(tile.buffer).stats();
        ok = stats.channels.some(channel => channel.stdev > 3) && stats.channels[0].mean < 252;
        if (ok) composites.push({ input: tile.buffer, left: (cx - grid.x0) * TILE, top: (cy - grid.y0) * TILE });
      } catch { ok = false; }
    }
    if (ok) usable++;
    tileInfo.push({ z, x: cx, y: cy, status: tile.status, usable: ok, cached: Boolean(tile.cached), sha256: tile.buffer ? createHash('sha256').update(tile.buffer).digest('hex').slice(0, 16) : null });
  }
  const metadata = {
    sourceName: WMTS.name, endpoint: `${WMTS.base}/{z}/{y}/{x}`, serviceLayer: `${WMTS.layer} / ${WMTS.matrixSet}`, datasetVersion: '服務未提供版本', captureDate: null, captureDateNote: '拍攝日期未知（WMTS 不提供實際拍攝日）',
    fetchedAt, crs: 'EPSG:3857（輸出像素以 WGS84 範圍裁切）', bbox, zoom: z, resolutionMPerPx: Math.round(metresPerPixel(centreLat, z) * 1000) / 1000, licence: WMTS.licence,
    requestStatus: usable === tileInfo.length ? 'ok' : usable ? 'partial' : 'failed', tiles: tileInfo, usableTiles: usable, requestedTiles: tileInfo.length, imageryVersion: IMAGERY_VERSION,
  };
  if (!usable) return { metadata, image: null, stats: null };
  const full = await sharp()({ create: { width: cols * TILE, height: rows * TILE, channels: 3, background: { r: 0, g: 0, b: 0 } } }).composite(composites).png().toBuffer();
  const left = Math.max(0, Math.round(grid.a.x - grid.x0 * TILE)), top = Math.max(0, Math.round(grid.a.y - grid.y0 * TILE));
  const width = Math.min(cols * TILE - left, Math.max(8, Math.round(grid.b.x - grid.a.x))), height = Math.min(rows * TILE - top, Math.max(8, Math.round(grid.b.y - grid.a.y)));
  const crop = await sharp()(full).extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true });
  const { data, info } = crop;
  const toPixel = (lon, lat) => { const p = worldPixel(lon, lat, z); return [p.x - (grid.x0 * TILE + left), p.y - (grid.y0 * TILE + top)]; };
  // Masks: parcel polygon (rasterised per pixel) and a disc around the variation centre (radius from its area, a proxy for the extent).
  const parcelCounts = emptyCounts(), discCounts = emptyCounts(), mpp = metresPerPixel(centreLat, z);
  const k = metresPerDegree(point.lat), channels = info.channels;
  const parcelRings = rings || null;
  const lonOf = x => (x + grid.x0 * TILE + left) / (TILE * 2 ** z) * 360 - 180;
  const latOf = y => { const n = Math.PI - 2 * Math.PI * (y + grid.y0 * TILE + top) / (TILE * 2 ** z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };
  const lonRow = Array.from({ length: info.width }, (_, x) => lonOf(x + 0.5));
  for (let y = 0; y < info.height; y++) {
    const lat = latOf(y + 0.5);
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * channels, r = data[i], g = data[i + 1], b = data[i + 2], lon = lonRow[x];
      const inParcel = parcelRings ? insideRings(parcelRings, lon, lat) : false;
      const inDisc = Math.hypot((lon - point.lon) * k.x, (lat - point.lat) * k.y) <= radiusM;
      if (!inParcel && !inDisc) continue;
      const valid = !(r === 0 && g === 0 && b === 0), cls = valid ? classify(r, g, b) : null;
      for (const [counts, inside] of [[parcelCounts, inParcel], [discCounts, inDisc]]) {
        if (!inside) continue;
        counts.total++;
        if (valid) { counts.valid++; counts[cls]++; }
      }
    }
  }
  // Annotated PNG for the 查核卡: parcel outline (yellow), centre cross and equivalent-extent circle (red).
  const paths = (parcelRings || []).map(({ ring }) => `<polygon points="${ring.map(([lon, lat]) => toPixel(lon, lat).map(v => v.toFixed(1)).join(',')).join(' ')}" fill="rgba(250,204,21,0.12)" stroke="#facc15" stroke-width="2.5"/>`).join('');
  const [px, py] = toPixel(point.lon, point.lat), rad = Math.max(4, radiusM / mpp);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">${paths}<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${rad.toFixed(1)}" fill="none" stroke="#ef4444" stroke-width="2" stroke-dasharray="6 4"/><path d="M${px - 8} ${py}H${px + 8}M${px} ${py - 8}V${py + 8}" stroke="#ef4444" stroke-width="2"/></svg>`;
  const image = await sharp()(data, { raw: { width: info.width, height: info.height, channels } }).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  metadata.imageSha256 = createHash('sha256').update(image).digest('hex');
  metadata.widthPx = info.width; metadata.heightPx = info.height;
  return {
    metadata, image,
    stats: { parcel: parcelRings ? fractions(parcelCounts) : null, disc: fractions(discCounts), discRadiusM: Math.round(radiusM * 10) / 10, algorithm: '色彩粗分類（植生/裸露/高亮鋪面或屋頂/陰影）；單期、未校正季節與陰影，非地物判釋結論', version: IMAGERY_VERSION, coverage: usable / tileInfo.length },
  };
}

/** Download and read one 查證照片 URL. Never counts as read unless the bytes decode as an image. */
export async function readPhoto(url, { dataDir, signal } = {}) {
  const dir = cacheDirectory(dataDir), key = createHash('sha256').update(url).digest('hex').slice(0, 24), file = join(dir, `photo-${key}.jpg`);
  const fetchedAt = new Date().toISOString(), info = { url, fetchedAt, status: 'failed', reason: null, httpStatus: null };
  let buffer = null;
  try {
    if (existsSync(file)) buffer = readFileSync(file), info.cached = true;
    else {
      buffer = await limited(async () => {
        const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(25000)].filter(Boolean)), headers: { Accept: 'image/*' } });
        info.httpStatus = response.status;
        if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { code: `http_${response.status}` });
        const length = Number(response.headers.get('content-length') || 0);
        if (length > 25_000_000) throw Object.assign(new Error('影像超過 25 MB'), { code: 'too_large' });
        info.lastModified = response.headers.get('last-modified') || null; info.contentType = response.headers.get('content-type') || null;
        return Buffer.from(await response.arrayBuffer());
      }, 2);
      if (!/^image\//.test(info.contentType || '') && buffer.length < 100) throw Object.assign(new Error('回應不是影像'), { code: 'not_image' });
    }
    const meta = await sharp()(buffer).metadata();
    if (!meta.width || !meta.height) throw Object.assign(new Error('無法解碼影像'), { code: 'not_image' });
    info.widthPx = meta.width; info.heightPx = meta.height; info.format = meta.format; info.sha256 = createHash('sha256').update(buffer).digest('hex');
    const exif = meta.exif ? meta.exif.toString('latin1') : '', date = /(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(exif);
    info.captureDate = date ? `${date[1]}-${date[2]}-${date[3]} ${date[4]}:${date[5]}` : null;
    info.captureDateNote = date ? '取自影像 EXIF（相機時鐘，未經驗證）' : '影像無 EXIF 拍攝日期（上傳時間不等於拍攝日）';
    if (Math.min(meta.width, meta.height) < 240) { info.status = 'unreadable'; info.reason = `解析度不足（${meta.width}×${meta.height}）`; }
    else {
      const small = await sharp()(buffer).rotate().resize({ width: 160, height: 160, fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
      const counts = emptyCounts();
      for (let i = 0; i < small.data.length; i += small.info.channels) { counts.total++; counts.valid++; counts[classify(small.data[i], small.data[i + 1], small.data[i + 2])]++; }
      info.stats = fractions(counts); info.status = 'ok';
      if (!existsSync(file)) writeFileSync(file, await sharp()(buffer).rotate().resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer());
      info.cacheKey = `photo-${key}.jpg`;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    info.status = 'failed'; info.reason = error.code ? `${error.code}：${error.message}` : error.name === 'TimeoutError' ? '逾時' : error.message;
  }
  return info;
}
