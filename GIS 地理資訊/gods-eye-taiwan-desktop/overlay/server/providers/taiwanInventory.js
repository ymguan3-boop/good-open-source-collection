import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
import { readWorkbook } from './xlsxRead.js';
import { dataDirectory } from './taiwanBuildingPacks.js';
import { parcelAt, parcelRecord, sectionCodesByName, similarSections, parcelIdOf, cadastreStatus } from './taiwanCadastre.js';
import { analyzeDescription, RULE_TITLES, TEXT_RULE_VERSION } from './inventoryText.js';
import { aerialFor, readPhoto, distanceToRings, cacheDirectory, IMAGERY_VERSION, WMTS } from './inventoryImagery.js';

// 第二階段：AI 清冊與航照智慧勾稽。清冊、地籍、航照快取與分析結果只存在 data/local/inventory（本機、不入 Git）。
// 分數都是程式依規則計算；不是違規機率，也不是主管機關的正式認定。
const RULE_SHORT = { R01: '未申請／違法字詞', R02: '超出核准範圍', R03: '棄置／不明土方', R04: '查證受限', R05: '疑似語句', R06: '人為設施', R07: '內容空泛', R08: '面積差異' };
export const SCORING_VERSION = 'scoring-2026.10.27-v1';
const DEFAULT_WEIGHTS = {
  version: SCORING_VERSION,
  legal: { R01: 25, R02: 20, R03: 20, R04: 10, R05: 8, R06: 7, R07: 8, R08: 15, R10: 10, parcelMismatch: 10, overArea: 10, approvalHint: 5 },
  priority: { legal: 0.45, inconsistency: 0.35, recurrence: 0.2 },
};

const FIELD_PATTERNS = [
  ['excelRow', /來源.*列號|Excel.*列號/], ['id', /變異點編號/], ['period', /^期別/], ['county', /所在(?:縣市|地)/], ['origResult', /原查證結果|^查證結果$/],
  ['origHitCodes', /命中代碼/], ['origHitReasons', /命中理由/], ['nearCount', /50公尺內跨期他案數/], ['nearIds', /跨期關聯變異點/], ['authority', /權責單位/], ['landUse', /土地使用類型/],
  ['cadastre', /參考地籍/], ['lon', /^經度/], ['lat', /^緯度/], ['area', /變異點面積/], ['prevImage', /前期.*影像/], ['nextImage', /後期.*影像/], ['browseDate', /瀏覽日期/],
  ['changeType', /變異類型|行為/], ['desc', /內容描述/], ['reportDate', /查報日期/], ['checkResult', /查核結果/], ['photoUrl', /查證照片/], ['otherPhotos', /其他照片/], ['note', /^備註/],
  ['spot12', /現勘12處項次/],
];
const REQUIRED = ['id', 'desc'];
const FLAG_COLUMN = /^R(\d\d)命中/;

const dir = () => { const base = dataDirectory(); if (!base) throw new Error('找不到 data/local；請先建立本機資料夾'); const folder = join(base, 'inventory'); mkdirSync(folder, { recursive: true }); return folder; };
const storePath = () => join(dir(), 'store.json');
let store = null, saveTimer = null;
const blankStore = () => ({ version: 1, importedAt: null, source: null, mapping: {}, headers: {}, parseErrors: [], cases: [], results: {}, reviews: {}, weights: DEFAULT_WEIGHTS, jobHistory: [] });
function load() {
  if (store) return store;
  try { store = existsSync(storePath()) ? { ...blankStore(), ...JSON.parse(readFileSync(storePath(), 'utf8')) } : blankStore(); } catch { store = blankStore(); }
  return store;
}
/** 稽核紀錄：匯入、執行、封存、權重變更、復原、人工覆核都留下時間與前後內容（只存本機）。 */
export function audit(action, detail) { const state = load(); state.audit = [...(state.audit || []).slice(-499), { at: new Date().toISOString(), action, detail }]; }
function save(now = false) {
  const write = () => { try { const tmp = storePath() + '.tmp'; writeFileSync(tmp, JSON.stringify(store)); renameSync(tmp, storePath()); } catch { /* disk full etc.: the next save retries */ } };
  clearTimeout(saveTimer);
  if (now) write(); else saveTimer = setTimeout(write, 1500);
}

// ---------- Excel → cases ----------
const text = value => value === null || value === undefined ? '' : String(value).trim();
const num = value => { const n = Number(String(value ?? '').replace(/,/g, '')); return Number.isFinite(n) && String(value ?? '').trim() !== '' ? n : null; };

function detectMapping(headers) {
  const mapping = {};
  for (const [field, pattern] of FIELD_PATTERNS) { const index = headers.findIndex(header => pattern.test(text(header))); if (index >= 0) mapping[field] = index; }
  mapping.flags = {};
  headers.forEach((header, index) => { const m = FLAG_COLUMN.exec(text(header)); if (m) mapping.flags[`R${m[1]}`] = index; });
  return mapping;
}
const headerRowOf = rows => rows.find(row => (row.cells || []).some(cell => text(cell) === '變異點編號'));

export async function importWorkbook(buffer, name, overrides = {}) {
  const sheets = await readWorkbook(JSZip, buffer);
  const state = load(), cases = [], errors = [], mappings = {}, headersBySheet = {}, seen = new Map();
  const targets = [['high', sheets.find(s => /高風險/.test(s.name))], ['miss', sheets.find(s => /未命中/.test(s.name))]];
  if (!targets.some(([, sheet]) => sheet)) {
    // Not the 檔案1 layout: use any sheet that has a 變異點編號 header.
    const any = sheets.find(s => headerRowOf(s.rows));
    if (!any) throw new Error('找不到含「變異點編號」欄位的工作表；請確認是清冊 Excel');
    targets[0][1] = any;
  }
  for (const [kind, sheet] of targets) {
    if (!sheet) continue;
    const headerRow = headerRowOf(sheet.rows);
    if (!headerRow) { errors.push({ sheet: sheet.name, row: null, message: '找不到標題列（含「變異點編號」）' }); continue; }
    const headers = (headerRow.cells || []).map(text), mapping = { ...detectMapping(headers), ...(overrides[kind] || {}) };
    mappings[kind] = mapping; headersBySheet[kind] = { sheet: sheet.name, headerRow: headerRow.row, headers };
    for (const field of REQUIRED) if (mapping[field] === undefined) errors.push({ sheet: sheet.name, row: headerRow.row, message: `缺少必要欄位：${field === 'id' ? '變異點編號' : '內容描述'}` });
    for (const row of sheet.rows) {
      if (row.row <= headerRow.row) continue;
      const cells = row.cells || [], get = field => mapping[field] === undefined ? null : cells[mapping[field]] ?? null;
      const id = text(get('id'));
      if (!id) { if (cells.some(cell => text(cell))) errors.push({ sheet: sheet.name, row: row.row, message: '變異點編號空白，已略過' }); continue; }
      const lon = num(get('lon')), lat = num(get('lat'));
      if ((get('lon') !== null || get('lat') !== null) && (lon === null || lat === null || lon < 118 || lon > 123.5 || lat < 20 || lat > 27)) errors.push({ sheet: sheet.name, row: row.row, id, message: `座標無效或不在臺灣範圍（${text(get('lon'))}, ${text(get('lat'))}）；不納入空間分析` });
      const area = num(get('area'));
      if (get('area') !== null && area === null) errors.push({ sheet: sheet.name, row: row.row, id, message: `變異點面積不是數字：${text(get('area'))}` });
      const urls = value => text(value).split(/[\s\n]+/).filter(item => /^https?:\/\//i.test(item));
      const origFlags = {}; for (const [code, index] of Object.entries(mapping.flags || {})) origFlags[code] = Number(cells[index]) === 1;
      const item = {
        id, sheet: kind, excelRow: num(get('excelRow')) ?? row.row, sheetRow: row.row, period: text(get('period')), county: text(get('county')), origResult: text(get('origResult')) || text(get('checkResult')),
        origHitCodes: text(get('origHitCodes')), origHitReasons: text(get('origHitReasons')), cadastre: text(get('cadastre')), lon: lon !== null && lat !== null && lon >= 118 && lon <= 123.5 && lat >= 20 && lat <= 27 ? lon : null, lat: lon !== null && lat !== null && lon >= 118 && lon <= 123.5 && lat >= 20 && lat <= 27 ? lat : null,
        area, prevImage: text(get('prevImage')), nextImage: text(get('nextImage')), browseDate: text(get('browseDate')), changeType: text(get('changeType')), desc: text(get('desc')), reportDate: text(get('reportDate')), checkResult: text(get('checkResult')),
        photoUrls: urls(get('photoUrl')), otherPhotoUrls: urls(get('otherPhotos')), origFlags, authority: text(get('authority')), landUse: text(get('landUse')), note: text(get('note')),
        // 欄位原樣保存供追溯；現勘參考項次不參與任何選案或評分。
        spot12Raw: text(get('spot12')) || null,
      };
      if (seen.has(id)) errors.push({ sheet: sheet.name, row: row.row, id, message: `變異點編號重複（先前於 ${seen.get(id)}）；兩筆都保留，以來源列號區分` });
      else seen.set(id, `${sheet.name} 第 ${row.row} 列`);
      cases.push(item);
    }
  }
  state.cases = cases; state.parseErrors = errors; state.mapping = mappings; state.headers = headersBySheet; state.importedAt = new Date().toISOString();
  state.source = { name: name || 'inventory.xlsx', bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), sheets: sheets.map(s => ({ name: s.name, rows: s.rows.length })) };
  state.results = {}; state.reviews = {}; neighbourIndex = null;
  writeFileSync(join(dir(), 'source.xlsx'), buffer);
  audit('import', { name: state.source.name, sha256: state.source.sha256, cases: cases.length, parseErrors: errors.length });
  save(true);
  return stateSummary();
}

// ---------- 參考地籍 → parcels, point checks ----------
const townOf = county => text(county).replace(/^.*?[縣市]/, '');
export function parseCadastreRefs(value) {
  const textValue = text(value).replace(/[()（）]/g, ' ').replace(/地號/g, ' ').replace(/段段/g, '段');
  const refs = []; let section = null;
  // 「及／和／與」只在數字後當分隔，避免切壞「太和段」這類段名。
  for (const part of textValue.split(/[、,，;；\n]|(?<=\d)\s*(?:及|和|與)\s*/)) {
    for (const match of part.matchAll(/([^\d\s]+?段)?\s*(\d+)(?:\s*[-－]\s*(\d+))?/g)) {
      if (match[1]) section = match[1];
      if (!section) continue;
      refs.push({ section, pmno: Number(match[2]), pcno: match[3] ? Number(match[3]) : 0, text: `${section}${match[2]}${match[3] ? '-' + match[3] : ''}地號` });
    }
  }
  return refs;
}
function resolveParcels(item) {
  const refs = parseCadastreRefs(item.cadastre), town = townOf(item.county), out = [];
  for (const ref of refs) {
    let found = null;
    for (const code of sectionCodesByName(ref.section, town)) {
      const record = parcelRecord(parcelIdOf(code.unit, code.scno, ref.pmno, ref.pcno));
      if (record) { found = record; break; }
    }
    out.push({ ref: ref.text, found: Boolean(found), why: found ? null : (sectionCodesByName(ref.section, town).length ? 'parcel_not_found' : 'section_not_found'), hint: found || sectionCodesByName(ref.section, town).length ? null : similarSections(ref.section, town), parcelId: found?.parcelId || null, landNumber: found?.landNumber || null, sectionName: found?.sectionName || ref.section, areaM2: found?.areaM2 ?? null, record: found });
  }
  return out;
}
const pointOf = item => Number.isFinite(item.lon) && Number.isFinite(item.lat) ? { lon: item.lon, lat: item.lat } : null;

function geoAnalysis(item) {
  const available = cadastreStatus().available, point = pointOf(item);
  const geo = { cadastreAvailable: available, refs: [], point: Boolean(point), status: null, statusNote: null, pointParcel: null, distanceToCitedM: null, areaRatio: null };
  if (!available) { geo.status = 'no_cadastre'; geo.statusNote = '尚未匯入地籍圖'; return { geo, parcels: [] }; }
  const parcels = resolveParcels(item);
  geo.refs = parcels.map(({ record, ...rest }) => rest);
  const cited = parcels.filter(p => p.found);
  if (point) geo.pointParcel = (() => { const p = parcelAt(point.lon, point.lat); return p ? { parcelId: p.parcelId, landNumber: p.landNumber, sectionName: p.sectionName, townName: p.sectionTown } : null; })();
  if (!point) { geo.status = 'no_coordinate'; geo.statusNote = '無有效座標，不做落點比對'; }
  else if (!parcels.length) { geo.status = 'no_cadastre_text'; geo.statusNote = geo.pointParcel ? `清冊無參考地籍；座標落在 ${geo.pointParcel.sectionName || ''}${geo.pointParcel.landNumber} 地號` : '清冊無參考地籍，座標也不在任何宗地內'; }
  else if (!cited.length) { geo.status = 'cited_not_found'; const lost = geo.refs.find(r => r.why === 'section_not_found'); geo.statusNote = `參考地籍「${item.cadastre}」在本機地籍庫找不到：` + (lost ? `段名「${lost.sectionName}」不在現行地段代碼表${lost.hint?.length ? `（疑為地籍重測前舊段名，現行名稱可能是 ${lost.hint.join('、')}；重測後地號會改變，不自動對應）` : '（可能是舊段名或誤載）'}` : '該段內沒有此地號（可能已分割、合併或重測）'); }
  else {
    const inside = cited.find(p => geo.pointParcel && p.parcelId === geo.pointParcel.parcelId);
    if (inside) { geo.status = 'point_in_cited'; geo.statusNote = '座標落在所引地號內'; geo.distanceToCitedM = 0; }
    else {
      geo.distanceToCitedM = Math.round(Math.min(...cited.map(p => distanceToRings(p.record.rings, point.lon, point.lat))) * 10) / 10;
      geo.status = geo.distanceToCitedM <= 30 ? 'near_cited' : 'mismatch';
      geo.statusNote = `座標不在所引地號內（距最近一筆約 ${geo.distanceToCitedM} 公尺）${geo.pointParcel ? `；座標落在 ${geo.pointParcel.sectionName || ''}${geo.pointParcel.landNumber} 地號` : '；座標不在任何宗地（道路／水域／圖外）'}。可能是變異跨地號、座標取中心點或地號誤載，僅列待查`;
    }
    const total = cited.reduce((s, p) => s + (p.areaM2 || 0), 0);
    if (Number.isFinite(item.area) && total > 0) geo.areaRatio = Math.round(item.area / total * 100) / 100;
  }
  return { geo, parcels };
}

// ---------- recurrence (R10, recomputed from coordinates) ----------
function buildNeighbourIndex(cases) {
  const cell = 0.0006, grid = new Map(), key = (x, y) => `${x},${y}`;
  for (const item of cases) { const point = pointOf(item); if (!point) continue; const k = key(Math.floor(point.lon / cell), Math.floor(point.lat / cell)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(item); }
  return { cell, grid, key };
}
function neighboursOf(item, index, radius = 50) {
  const point = pointOf(item); if (!point) return [];
  const out = [], kx = 111320 * Math.cos(point.lat * Math.PI / 180), ky = 110540, cx = Math.floor(point.lon / index.cell), cy = Math.floor(point.lat / index.cell);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const other of index.grid.get(index.key(cx + dx, cy + dy)) || []) {
    if (other === item || other.id === item.id) continue;
    const d = Math.hypot((other.lon - point.lon) * kx, (other.lat - point.lat) * ky);
    if (d <= radius) out.push({ id: other.id, period: other.period, distanceM: Math.round(d), sameParcelText: Boolean(item.cadastre && other.cadastre === item.cadastre) });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM);
}

// ---------- imagery consistency (R09-A / R09-B) ----------
function expectations(claims, ctx = {}) {
  const list = [];
  // 結構物的預期占比隨文字所載面積縮放（20 ㎡ 的資材室不該要求占圓內 40%）；沒有面積時用保守的 15%。v27b 依目視抽查修正。
  const claimed = (ctx.areas || []).filter(a => ['approved', 'claimed'].includes(a.role)).reduce((sum, a) => sum + a.squareMetres, 0), disc = ctx.discAreaM2 || 0;
  const share = claimed > 0 && disc > 0 ? Math.max(0.03, Math.min(0.4, 0.8 * claimed / disc)) : 0.15;
  if (claims.structure === true) list.push({ key: 'structure', label: '文字稱有建物／構造物', pass: s => s.bright + s.bare >= share, need: `高亮鋪面或屋頂＋裸露 ≥ ${Math.round(share * 100)}%（依文字面積 ${claimed ? claimed + ' ㎡' : '未載，採預設'} 縮放）` });
  if (claims.structureDenied) list.push({ key: 'structureDenied', label: '文字稱無建物', pass: s => s.bright < 0.5, need: '高亮（屋頂／鋪面）< 50%' });
  if (claims.vegetation && !claims.structure && !claims.bare) list.push({ key: 'vegetation', label: '文字稱現況為植生／雜草／農作', pass: s => s.vegetation >= 0.4, need: '植生 ≥ 40%' });
  if (claims.bare) list.push({ key: 'bare', label: '文字稱整地／填土／裸露', pass: s => s.bare + s.bright >= 0.3, need: '裸露＋高亮 ≥ 30%' });
  return list;
}
const pct = value => `${Math.round(value * 100)}%`;
function consistencyFromStats(claims, stats, { minValid = 150, photo = false, areas = [], discAreaM2 = 0 } = {}) {
  if (!stats || !stats.validPixels || stats.validPixels < minValid) return { status: 'not_assessable', reason: '有效像素不足，不可評' };
  let list = expectations(claims, { areas, discAreaM2 });
  // A photo's colour share says little about structures; only the vegetation claim is checked by colour there.
  if (photo) list = list.filter(item => item.key === 'vegetation');
  if (!list.length) return { status: 'not_assessable', reason: photo ? '色彩比例只能粗檢植生主張；其他文字主張需人工或 AI 視覺判讀' : '文字沒有可與航照色彩比對的地物主張' };
  const checks = list.map(item => ({ label: item.label, expected: item.need, observed: `植生 ${pct(stats.vegetation)}、裸露 ${pct(stats.bare)}、高亮 ${pct(stats.bright)}、陰影 ${pct(stats.shadow)}`, consistent: item.pass(stats) }));
  return { status: checks.every(c => c.consistent) ? 'consistent' : 'inconsistent', checks };
}

// ---------- scoring ----------
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
export function scoreResult(item, result, weights = load().weights) {
  const rules = result.text.rules, legalW = weights.legal, flags = [];
  let legal = 0;
  const add = (key, ok, label) => { if (ok) { legal += legalW[key] || 0; flags.push({ key, label, weight: legalW[key] || 0 }); } };
  for (const code of item.sheet === 'adhoc' ? [] : ['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08']) add(code, rules[code]?.hit, `${code} ${RULE_SHORT[code]}`);
  add('R10', (result.recurrence?.count || 0) > 0, `R10 50 m 內跨期相鄰 ${result.recurrence?.count || 0} 筆`);
  add('parcelMismatch', ['mismatch', 'cited_not_found'].includes(result.geo?.status), '地號與座標不符／找不到');
  add('overArea', Number.isFinite(result.geo?.areaRatio) && result.geo.areaRatio > 1.05, '變異面積大於所引地號面積');
  add('approvalHint', item.sheet !== 'adhoc' && result.text.flags.approval.hit, '文字含許可／核准線索（須分辨有效性與適用範圍）');
  legal = clamp(legal);
  const parts = [result.imagery?.r09b, result.photo?.r09a].filter(Boolean).map(p => p.status).filter(s => s !== 'not_assessable');
  const consistency = parts.length ? Math.round(parts.filter(s => s === 'consistent').length / parts.length * 100) : null;
  const recurrence = clamp(((result.recurrence?.count || 0) / 3) * 100);
  const evidenceItems = [
    ['座標', Boolean(pointOf(item))], ['地籍宗地', Boolean(result.geo?.refs?.some(r => r.found))], ['航照取得', ['ok', 'partial'].includes(result.imagery?.metadata?.requestStatus)],
    ['查證照片已讀', result.photo?.items?.some(p => p.status === 'ok') === true], ['文字描述', item.desc.length > 0], ['面積數值', Number.isFinite(item.area)],
  ];
  const completeness = Math.round(evidenceItems.filter(([, ok]) => ok).length / evidenceItems.length * 100);
  const pw = weights.priority, used = { legal: pw.legal, recurrence: pw.recurrence }, missing = [];
  let numerator = pw.legal * legal + pw.recurrence * recurrence;
  if (consistency !== null) { used.inconsistency = pw.inconsistency; numerator += pw.inconsistency * (100 - consistency); } else missing.push('文字-影像一致性（航照／照片未取得或不可評）');
  const total = Object.values(used).reduce((a, b) => a + b, 0), priority = Math.round(numerator / total * 10) / 10;
  // 篩選理由：把分數拆回每一項的來源，讓使用者看得出「為什麼排在這裡」。
  const r1 = n => Math.round(n * 10) / 10;
  const terms = [`法律／權源待查 ${r1(legal)} × ${pw.legal}`, ...(consistency !== null ? [`文字-影像不一致 ${100 - consistency} × ${pw.inconsistency}`] : []), `跨期重複 ${Math.round(recurrence)} × ${pw.recurrence}`];
  const reason = [
    `綜合 ${priority} ＝ （${terms.join(' ＋ ')}）÷ ${r1(total)}`,
    flags.length ? `法律／權源待查來自：${flags.map(f => `${f.label}（+${f.weight}）`).join('、')}` : '法律／權源待查：沒有規則命中',
    consistency === null ? '文字-影像一致性：無法計算（航照或照片不可評），未計入、標「部分」' : `文字-影像一致性 ${consistency}（${consistency === 100 ? '色彩粗檢一致' : consistency === 0 ? '色彩粗檢疑不一致' : '部分一致'}）`,
    `證據完整度 ${completeness}%`,
  ].join('；');
  return {
    reason,
    version: weights.version, textImageConsistency: consistency, legalQueryRisk: Math.round(legal * 10) / 10, recurrence: Math.round(recurrence), priority, priorityPartial: missing.length > 0, priorityMissing: missing, weightsUsed: used, evidenceCompleteness: completeness,
    evidenceItems: Object.fromEntries(evidenceItems), legalFlags: flags, note: '分數只用於排序候選，不是違規機率，也不是主管機關認定；缺項不當作 0，缺項時以已有項目加權並標「部分」。',
  };
}

// ---------- per-case pipeline ----------
let neighbourIndex = null;
const indexFor = cases => (neighbourIndex?.size === cases.length ? neighbourIndex.value : (neighbourIndex = { size: cases.length, value: buildNeighbourIndex(cases) }).value);

export function analyzeLocal(item) {
  const state = load(), textResult = analyzeDescription(item.desc, { result: item.origResult, satelliteArea: item.area });
  const { geo } = geoAnalysis(item), near = neighboursOf(item, indexFor(state.cases));
  const crossPeriod = near.filter(n => n.period && n.period !== item.period);
  const sameParcel = geo.refs.filter(r => r.found).length ? state.cases.filter(o => o.id !== item.id && o.period !== item.period && o.cadastre && o.cadastre === item.cadastre).map(o => o.id) : [];
  const result = { id: item.id, analyzedAt: new Date().toISOString(), text: textResult, geo, recurrence: { count: new Set([...crossPeriod.map(n => n.id), ...sameParcel]).size, neighbours: crossPeriod.slice(0, 8), sameParcelIds: sameParcel.slice(0, 8), radiusM: 50 }, imagery: null, photo: null };
  result.rule = { R09: { 'R09-A': { status: 'not_run' }, 'R09-B': { status: 'not_run' } } };
  result.score = scoreResult(item, result);
  return result;
}

async function analyzeImagery(item, result, { signal, photos = 1 } = {}) {
  const dataDir = dataDirectory(), point = pointOf(item);
  const { parcels } = geoAnalysis(item), cited = parcels.filter(p => p.found).map(p => p.record), rings = cited.flatMap(r => r.rings);
  if (!point && !cited.length) { result.imagery = { metadata: { requestStatus: 'no_location', sourceName: WMTS.name }, r09b: { status: 'not_assessable', reason: '無座標也無地籍宗地，無法定位取圖' } }; }
  else {
    const centre = point || (() => { const ring = cited[0].rings[0].ring; return { lon: ring.reduce((s, p) => s + p[0], 0) / ring.length, lat: ring.reduce((s, p) => s + p[1], 0) / ring.length }; })();
    const k = { x: 111320 * Math.cos(centre.lat * Math.PI / 180), y: 110540 }, pad = 20;
    let box = [centre.lon - 30 / k.x, centre.lat - 30 / k.y, centre.lon + 30 / k.x, centre.lat + 30 / k.y];
    for (const { ring } of cited.flatMap(r => r.rings)) for (const [lon, lat] of ring) box = [Math.min(box[0], lon), Math.min(box[1], lat), Math.max(box[2], lon), Math.max(box[3], lat)];
    // A very large parcel would need dozens of tiles: keep the picture near the point instead.
    if ((box[2] - box[0]) * k.x > 700 || (box[3] - box[1]) * k.y > 700) box = [centre.lon - 150 / k.x, centre.lat - 150 / k.y, centre.lon + 150 / k.x, centre.lat + 150 / k.y];
    box = [box[0] - pad / k.x, box[1] - pad / k.y, box[2] + pad / k.x, box[3] + pad / k.y];
    const radiusM = Number.isFinite(item.area) && item.area > 0 ? Math.max(5, Math.min(60, Math.sqrt(item.area / Math.PI))) : 15;
    const aerial = await aerialFor({ bbox: box, point: centre, rings: rings.length ? rings : null, radiusM, dataDir, signal });
    if (aerial.image) writeFileSync(join(cacheDirectory(dataDir), `aerial-${createHash('sha1').update(item.id + item.excelRow).digest('hex').slice(0, 16)}.png`), aerial.image);
    const stats = aerial.stats, usable = stats?.disc, r09b = !aerial.image ? { status: 'not_assessable', reason: '航照取圖失敗或無有效覆蓋' } : (stats.coverage < 0.6 ? { status: 'not_assessable', reason: `航照覆蓋不足（${pct(stats.coverage)}）` } : consistencyFromStats(result.text.claims, usable, { minValid: 120, areas: result.text.areas, discAreaM2: Math.PI * (stats?.discRadiusM ?? radiusM) ** 2 }));
    r09b.temporalCaveat = '航照拍攝日期未知，並非確認與變異期同期；單期影像不能推斷新增或拆除。';
    r09b.basis = `以變異點為中心、等面積半徑 ${stats?.discRadiusM ?? radiusM} m 圓內的色彩比例比對文字主張`;
    result.imagery = { metadata: aerial.metadata, stats, r09b, imageKey: aerial.image ? `aerial-${createHash('sha1').update(item.id + item.excelRow).digest('hex').slice(0, 16)}.png` : null };
  }
  // 查證照片：實際下載後才算已讀；批次預設只讀第一張，查核卡可再讀其餘。
  const urls = [...new Set([...item.photoUrls, ...item.otherPhotoUrls])].slice(0, photos), items = [];
  for (const url of urls) { signal?.throwIfAborted(); items.push(await readPhoto(url, { dataDir, signal })); }
  const read = items.find(p => p.status === 'ok');
  const r09a = !item.photoUrls.length && !item.otherPhotoUrls.length ? { status: 'not_assessable', reason: '清冊沒有查證照片 URL' } : !items.length ? { status: 'not_assessable', reason: '未嘗試讀取照片' } : read ? { ...consistencyFromStats(result.text.claims, read.stats, { photo: true, minValid: 1000 }), semantic: '照片內容語意（建物／堆置／鋪面）需人工或使用者明確啟用的 AI 視覺判讀，本引擎不做語意結論' } : { status: 'not_assessable', reason: `照片無法讀取：${items.map(p => p.reason).filter(Boolean).join('；') || '未知原因'}` };
  result.photo = { items, totalUrls: item.photoUrls.length + item.otherPhotoUrls.length, r09a };
  result.rule.R09 = { 'R09-A': { status: r09a.status, reason: r09a.reason || null }, 'R09-B': { status: result.imagery.r09b.status, reason: result.imagery.r09b.reason || null } };
  result.score = scoreResult(item, result);
  result.imageryAt = new Date().toISOString();
  return result;
}

// ---------- locations (groups) ----------
export function buildGroups({ scope = 'high' } = {}, cases = load().cases, results = load().results) {
  const parent = new Map(), find = id => { while (parent.get(id) !== id) { parent.set(id, parent.get(parent.get(id))); id = parent.get(id); } return id; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
  const withResult = cases.filter(c => results[c.id] && c.sheet !== 'adhoc' && (scope === 'all' || c.sheet === scope));
  withResult.forEach(c => parent.set(c.id, c.id));
  const byParcel = new Map(), reasons = new Map();
  for (const c of withResult) {
    const primary = results[c.id].geo?.refs?.find(r => r.found)?.parcelId;
    if (primary) { if (byParcel.has(primary)) { union(c.id, byParcel.get(primary)); reasons.set(c.id, '同一地號'); } else byParcel.set(primary, c.id); }
  }
  const index = indexFor(cases);
  for (const c of withResult) for (const n of neighboursOf(c, index)) if (parent.has(n.id)) { union(c.id, n.id); reasons.set(c.id, reasons.get(c.id) ? reasons.get(c.id) + '、50 m 內相鄰' : '50 m 內相鄰'); }
  const groups = new Map();
  for (const c of withResult) { const root = find(c.id); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(c); }
  const list = [...groups.values()].map(members => {
    const rs = members.map(m => results[m.id]), best = rs.reduce((a, b) => (b.score.priority > a.score.priority ? b : a)), lead = members.find(m => m.id === best.id);
    const periods = [...new Set(members.map(m => m.period).filter(Boolean))].sort();
    const parcels = [...new Set(members.flatMap(m => (results[m.id].geo?.refs || []).map(r => r.ref)))];
    const why = [...new Set(members.flatMap(m => String(reasons.get(m.id) || '').split('、')).filter(Boolean))];
    const rules = Object.entries(RULE_TITLES).filter(([code]) => rs.some(r => r.text.rules[code]?.hit)).map(([code]) => code);
    const centreLon = members.filter(pointOf).reduce((s, m, _, a) => s + m.lon / a.length, 0), centreLat = members.filter(pointOf).reduce((s, m, _, a) => s + m.lat / a.length, 0);
    return {
      memberIds: members.map(m => m.id), size: members.length, periods, county: lead.county, parcels, reason: members.length > 1 ? `同一現勘地點聚合：${why.join('；') || '空間相鄰'}（${members.length} 筆、期別 ${periods.join('／')}）` : '單筆案件（附近無其他同期或跨期案件）',
      leadId: lead.id, selectionReason: `排序依代表案件 ${lead.id}（群組取最高分）：${best.score.reason || ''}${members.length > 1 ? `；同一地點共 ${members.length} 筆、${periods.length} 個期別` : ''}`, factors: [...new Set(rs.flatMap(r => (r.score.legalFlags || []).map(f => f.key)))], priority: best.score.priority, priorityPartial: rs.some(r => r.score.priorityPartial), legalQueryRisk: Math.max(...rs.map(r => r.score.legalQueryRisk)), textImageConsistency: (() => { const v = rs.map(r => r.score.textImageConsistency).filter(x => x !== null); return v.length ? Math.min(...v) : null; })(),
      evidenceCompleteness: Math.round(rs.reduce((s, r) => s + r.score.evidenceCompleteness, 0) / rs.length), rules, centre: Number.isFinite(centreLon) && centreLon ? { lon: centreLon, lat: centreLat } : null,
      gaps: [...new Set(rs.flatMap(r => r.score.priorityMissing || []))],
    };
  });
  list.sort((a, b) => b.priority - a.priority || b.legalQueryRisk - a.legalQueryRisk || a.leadId.localeCompare(b.leadId));
  list.forEach((g, i) => { g.rank = i + 1; g.id = `L-${String(i + 1).padStart(4, '0')}`; });
  return list;
}

// ---------- job runner ----------
const job = { peakRssMB: 0, timing: {}, state: 'idle', stage: null, counts: null, controller: null, startedAt: null, finishedAt: null, scope: null, error: null, ids: [] };
const freshCounts = () => ({ total: 0, processed: 0, imagery: 0, aerialOk: 0, aerialMissing: 0, photoRead: 0, photoFailed: 0, notAssessable: 0, failed: 0, historicalAerialPending: 0 });
const inScope = (cases, scope) => scope === 'all' ? cases : cases.filter(c => c.sheet === scope);
const sleep = ms => new Promise(done => setTimeout(done, ms));

function recount() {
  const state = load(), counts = { ...job.counts };
  Object.assign(counts, { imagery: 0, aerialOk: 0, aerialMissing: 0, photoRead: 0, photoFailed: 0, notAssessable: 0, historicalAerialPending: 0 });
  for (const id of job.ids) {
    const r = state.results[id]; if (!r?.imagery) continue;
    counts.imagery++;
    if (['ok', 'partial'].includes(r.imagery.metadata?.requestStatus)) counts.aerialOk++; else counts.aerialMissing++;
    if (r.photo?.items?.some(p => p.status === 'ok')) counts.photoRead++; else if (r.photo?.items?.length) counts.photoFailed++;
    if (r.imagery.r09b?.status === 'not_assessable' && r.photo?.r09a?.status === 'not_assessable') counts.notAssessable++;
  }
  counts.historicalAerialPending = counts.aerialOk;
  job.counts = counts;
}

export async function startRun({ scope = 'high', top = 30, retry = false, photos = 1 } = {}) {
  const state = load();
  if (!state.cases.length) throw new Error('尚未匯入清冊');
  if (job.state === 'running') throw new Error('已有一個分析工作進行中');
  audit('run', { scope, top, retry, photos });
  job.controller = new AbortController(); job.state = 'running'; job.stage = 'text'; job.scope = scope; job.error = null; job.startedAt = new Date().toISOString(); job.finishedAt = null; job.counts = freshCounts();
  const cases = inScope(state.cases, scope); job.counts.total = cases.length; job.ids = [];
  const signal = job.controller.signal;
  job.peakRssMB = 0; job.timing = { startMs: Date.now() };
  const memTimer = setInterval(() => { job.peakRssMB = Math.max(job.peakRssMB, Math.round(process.memoryUsage().rss / 1048576)); }, 500);
  (async () => {
    try {
      // Stage 1 (local, fast): text rules + cadastre + recurrence for every case in scope.
      for (const item of cases) {
        if (signal.aborted) break;
        if (!state.results[item.id] || !retry) { try { state.results[item.id] = analyzeLocal(item); } catch (error) { job.counts.failed++; state.results[item.id] = { id: item.id, error: error.message, text: analyzeDescription(item.desc), geo: { status: 'error', refs: [] }, recurrence: { count: 0 }, score: null }; } }
        job.counts.processed++;
        if (job.counts.processed % 100 === 0) await sleep(0);
      }
      save(); job.timing.stage1Ms = Date.now() - job.timing.startMs;
      if (signal.aborted) throw signal.reason ?? new Error('已停止');
      // Stage 2 (network): imagery + photo for the top candidates (or the failed ones when retrying).
      job.stage = 'imagery';
      const ranked = cases.filter(c => state.results[c.id]?.score).sort((a, b) => state.results[b.id].score.priority - state.results[a.id].score.priority);
      let queue = top > 0 ? ranked.slice(0, top) : ranked;
      if (retry) queue = ranked.filter(c => { const r = state.results[c.id]; return !r.imagery || r.imagery.metadata?.requestStatus !== 'ok' || (r.photo?.items || []).some(p => p.status === 'failed'); }).slice(0, top > 0 ? top : undefined);
      job.ids = queue.map(c => c.id); job.counts.imageryTarget = queue.length;
      let next = 0;
      const worker = async () => {
        while (next < queue.length && !signal.aborted) {
          const item = queue[next++], previous = state.results[item.id];
          try { state.results[item.id] = await analyzeImagery(item, previous, { signal, photos }); }
          catch (error) { if (signal.aborted) return; job.counts.failed++; previous.imageryError = error.message; }
          recount();
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      recount(); save();
      job.state = signal.aborted ? 'stopped' : 'done';
    } catch (error) { job.state = 'stopped'; job.error = error.name === 'AbortError' ? null : error.message; }
    finally { clearInterval(memTimer); job.timing.totalMs = Date.now() - job.timing.startMs; job.timing.stage2Ms = job.timing.totalMs - (job.timing.stage1Ms || 0); job.finishedAt = new Date().toISOString(); job.stage = null; save(true); state.jobHistory = [...(state.jobHistory || []).slice(-9), { at: job.finishedAt, scope, top, state: job.state, counts: job.counts }]; save(); }
  })();
  return progress();
}
export const stopRun = () => { if (job.state === 'running') { job.controller?.abort(); job.state = 'stopping'; } return progress(); };
export function undoImagery(ids) {
  const state = load(); let n = 0;
  for (const id of ids?.length ? ids : job.ids) { const r = state.results[id], item = state.cases.find(c => c.id === id); if (r?.imagery || r?.photo) { r.imagery = null; r.photo = null; r.rule = { R09: { 'R09-A': { status: 'not_run' }, 'R09-B': { status: 'not_run' } } }; r.score = scoreResult(item, r); n++; } }
  audit('undo', { ids: ids?.length ?? job.ids.length, undone: n });
  save(true); recount();
  return { undone: n };
}
export function progress() { return { peakRssMB: job.peakRssMB, timing: job.timing, state: job.state, stage: job.stage, scope: job.scope, counts: job.counts, startedAt: job.startedAt, finishedAt: job.finishedAt, error: job.error }; }

// ---------- summaries / cards ----------
export function stateSummary() {
  const state = load(), results = Object.values(state.results);
  return {
    imported: state.cases.length > 0, importedAt: state.importedAt, source: state.source, mapping: state.mapping, headers: state.headers, parseErrors: state.parseErrors.slice(0, 200), parseErrorCount: state.parseErrors.length,
    counts: { total: state.cases.length, high: state.cases.filter(c => c.sheet === 'high').length, miss: state.cases.filter(c => c.sheet === 'miss').length, analysed: results.length, withImagery: results.filter(r => r.imagery).length },
    weights: state.weights, progress: progress(), cadastre: { available: cadastreStatus().available }, ruleVersions: { text: TEXT_RULE_VERSION, imagery: IMAGERY_VERSION, scoring: SCORING_VERSION },
  };
}
const sheetLabel = { high: '高風險案件', miss: '未命中清冊' };
export function listCases({ offset = 0, limit = 50, q = '', sheet = '', sort = 'priority' } = {}) {
  const state = load(); let rows = state.cases.filter(c => (!sheet || c.sheet === sheet) && (!q || `${c.id} ${c.cadastre} ${c.county} ${c.desc}`.includes(q)));
  const view = c => { const r = state.results[c.id]; return { id: c.id, sheet: sheetLabel[c.sheet], excelRow: c.excelRow, period: c.period, county: c.county, cadastre: c.cadastre, origResult: c.origResult, priority: r?.score?.priority ?? null, partial: r?.score?.priorityPartial ?? null, legal: r?.score?.legalQueryRisk ?? null, consistency: r?.score?.textImageConsistency ?? null, completeness: r?.score?.evidenceCompleteness ?? null, imagery: r?.imagery?.metadata?.requestStatus ?? null, review: state.reviews[c.id]?.status ?? null, hits: r ? Object.keys(r.text.rules).filter(k => r.text.rules[k].hit).join('、') : '', reason: r?.score?.reason || '' }; };
  let views = rows.map(view);
  if (sort === 'priority') views.sort((a, b) => (b.priority ?? -1) - (a.priority ?? -1));
  return { total: views.length, rows: views.slice(Number(offset), Number(offset) + Math.min(200, Number(limit) || 50)) };
}
export function caseCard(id) {
  const state = load(), item = state.cases.find(c => c.id === id);
  if (!item) throw new Error('找不到案件');
  const result = state.results[id] || null, groups = result ? buildGroups({ scope: 'all' }) : [], group = groups.find(g => g.memberIds.includes(id)) || null;
  return { case: item, result, cadastre: cadastreSourceFor(result), group: group && { id: group.id, rank: group.rank, size: group.size, memberIds: group.memberIds, reason: group.reason }, review: state.reviews[id] || null, ruleTitles: RULE_TITLES, legal: LEGAL_NOTE, needDocuments: needDocuments(item, result) };
}
export async function ensureImagery(id, { photos = 3, signal } = {}) {
  const state = load(), item = state.cases.find(c => c.id === id);
  if (!item) throw new Error('找不到案件');
  let result = state.results[id] || analyzeLocal(item);
  result = await analyzeImagery(item, result, { signal, photos });
  state.results[id] = result; save();
  return caseCard(id);
}
export const WEIGHT_MEANINGS = [
  ['R01', '原判非違規，但文字出現未申請、未取得許可、違法等字詞（否定語境不計）'], ['R02', '文字提到超出核准範圍或未依核定計畫施作'], ['R03', '文字提到疑似非法棄置廢棄物或不明來源土方'],
  ['R04', '文字記載無法進入、查證受限或無法確認現況'], ['R05', '文字使用「疑似」「可能」等未確定語句'], ['R06', '文字提到鐵皮屋、圍籬、工寮、貨櫃等常見人為設施（否定語境不計）'],
  ['R07', '查證內容空泛，判斷依據不足'], ['R08', '文字所載面積與衛星變異面積差異明顯（量值初篩）'], ['R10', '座標 50 公尺內或同一參考地籍有跨期重複變異'],
  ['parcelMismatch', '地號不符：座標不在所引地號內（超過 30 公尺）或所引地號查無'], ['overArea', '超面積：變異面積大於所引地號的登記面積'], ['approvalHint', '許可線索：文字提到核准／許可，須確認文件有效性與適用範圍'],
  ['priority.legal', '綜合分數中「法律／權源待查」（上列各項加總，上限 100）所占比重'], ['priority.inconsistency', '綜合分數中「文字-影像不一致」（100 − 一致性）所占比重；不可評時不計入'], ['priority.recurrence', '綜合分數中「跨期重複」（跨期相鄰筆數 ÷ 3，上限 100）所占比重'],
];
/** 查核卡與匯出用：地籍圖資來源、整體資料日期、匯入時間，以及所引宗地各自的資料日期（本機地籍庫）。 */
export function cadastreSourceFor(result) {
  const status = cadastreStatus();
  if (!status.available) return { available: false, note: '尚未匯入地籍圖' };
  const parcels = (result?.geo?.refs || []).filter(r => r.found && r.parcelId).map(r => { const p = parcelRecord(r.parcelId); return { ref: r.ref, landNumber: p ? `${p.sectionName || ''}${p.landNumber}` : r.ref, dataDate: p?.dataDate || null }; });
  const point = result?.geo?.pointParcel ? parcelRecord(result.geo.pointParcel.parcelId) : null;
  return { available: true, source: status.source, latestDataDate: status.latestDataDate, importedAt: status.importedAt, sourceSha256: status.sourceSha256, licence: status.licence, parcels, pointParcel: point ? { landNumber: `${point.sectionName || ''}${point.landNumber}`, dataDate: point.dataDate } : null, sectionTable: '段名對照：國土測繪中心地段代碼查詢服務（api.nlsc.gov.tw）' };
}
const LEGAL_NOTE = {
  semantics: ['地貌發生變化（衛星監測變異點）', '清冊文字與影像不一致（本引擎的 R09 色彩粗檢）', '疑似違規風險（規則命中，僅供選案）', '主管機關正式認定違規（本系統不做，須依法定程序）'],
  caveat: '影像判釋不等於法律結論；一致時若有超面積、許可或權源疑義，仍列為待調證候選。法規現行版本與施行期別須由使用者／法務確認。',
};
function needDocuments(item, result) {
  const docs = new Set();
  if (!result) return [];
  const r = result.text.rules;
  if (r.R01?.hit || r.R02?.hit || result.text.flags.approval.hit) docs.add('許可／核准文件（文號、核准範圍與有效期）');
  if (r.R08?.hit || result.text.areas.length) docs.add('核定或施作範圍圖說與面積計算口徑');
  if (r.R03?.hit) docs.add('物料種類、來源及去向證明');
  if (r.R04?.hit) docs.add('複查現勘紀錄與照片（原查證受限）');
  if (['mismatch', 'cited_not_found'].includes(result.geo?.status)) docs.add('地籍謄本／地籍圖套疊（地號與座標不符）');
  if ((result.recurrence?.count || 0) > 0) docs.add('同地號跨期變異歷程與歷次查證紀錄');
  if (result.score?.legalQueryRisk > 0) docs.add('土地使用權源與使用分區／編定資料');
  return [...docs];
}
export function setReview(id, status, note) {
  const state = load();
  if (!['待覆核', '已覆核-建議現勘', '已覆核-不需現勘', '已覆核-待調證'].includes(status)) throw new Error('覆核狀態不正確');
  audit('review', { id, status });
  state.reviews[id] = { status, note: text(note).slice(0, 2000), at: new Date().toISOString() }; save(true);
  return state.reviews[id];
}
export function setWeights(weights) {
  const state = load(), base = state.weights || DEFAULT_WEIGHTS, next = { ...base, legal: { ...base.legal }, priority: { ...base.priority } };
  for (const [k, v] of Object.entries(weights?.legal || {})) if (k in next.legal && Number.isFinite(Number(v)) && Number(v) >= 0) next.legal[k] = Number(v);
  for (const [k, v] of Object.entries(weights?.priority || {})) if (k in next.priority && Number.isFinite(Number(v)) && Number(v) >= 0) next.priority[k] = Number(v);
  next.version = `${SCORING_VERSION}+custom@${new Date().toISOString().slice(0, 16)}`;
  audit('weights', { before: base, after: next });
  state.weights = next;
  for (const item of state.cases) { const r = state.results[item.id]; if (r?.text) r.score = scoreResult(item, r, next); }
  save(true);
  return next;
}
export function resetWeights() { const state = load(); audit('weights-reset', { before: state.weights, after: DEFAULT_WEIGHTS }); state.weights = DEFAULT_WEIGHTS; for (const item of state.cases) { const r = state.results[item.id]; if (r?.text) r.score = scoreResult(item, r, DEFAULT_WEIGHTS); } save(true); return DEFAULT_WEIGHTS; }

/** Entry A: one parcel typed by the user → a stand-alone card with imagery. */
export async function analyzeParcel({ county = '宜蘭縣', town, section, number, signal }) {
  const state = load();
  if (!town || !section || !number) throw new Error('請輸入鄉鎮市、地段與地號');
  const m = /^(\d+)(?:\s*[-－]\s*(\d+))?/.exec(text(number).replace(/地號/g, ''));
  if (!m) throw new Error('地號格式不正確（例：34 或 268-1）');
  const id = `PARCEL-${town}${section}${m[1]}${m[2] ? '-' + m[2] : ''}`, cadastre = `${section.replace(/段?$/, '段')}${m[1]}${m[2] ? '-' + m[2] : ''}地號`;
  const wanted = { id, sheet: 'adhoc', excelRow: 0, period: '', county: `${county}${town}`, origResult: '', cadastre, desc: '', photoUrls: [], otherPhotoUrls: [], lon: null, lat: null, area: null, origFlags: {} };
  const resolved = resolveParcels(wanted);
  const hit = resolved.find(p => p.found);
  if (!hit) throw new Error(`本機地籍庫找不到 ${town}${cadastre}（請確認段名／地號，或該鄉鎮是否已匯入）`);
  const c = hit.record.town || {};
  wanted.lon = c.clon ?? null; wanted.lat = c.clat ?? null;
  const index = state.cases.findIndex(x => x.id === id);
  if (index >= 0) state.cases[index] = wanted; else state.cases.push(wanted);
  neighbourIndex = null;
  const result = await analyzeImagery(wanted, analyzeLocal(wanted), { photos: 0, signal });
  state.results[id] = result; save();
  return caseCard(id);
}

// ---------- export ----------
const dateText = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
export function buildExport({ top = 12, scope = 'high' } = {}) {
  const state = load(), groups = buildGroups({ scope }), chosen = top > 0 ? groups.slice(0, top) : groups, ids = new Set(chosen.flatMap(g => g.memberIds));
  const byId = new Map(state.cases.map(c => [c.id, c])), tag = 'AI候選非正式現勘結論';
  const rankOf = new Map(chosen.flatMap(g => g.memberIds.map(id => [id, g])));
  const statusZh = { consistent: '色彩粗檢一致', inconsistent: '色彩粗檢疑不一致', not_assessable: '不可評', not_run: '未執行' };
  const rowsCases = [], evidence = [], manifest = [];
  for (const g of chosen) for (const id of g.memberIds) {
    const c = byId.get(id), r = state.results[id], img = r.imagery?.metadata, review = state.reviews[id];
    const a = r.photo?.r09a, b = r.imagery?.r09b;
    rowsCases.push([tag, g.id, g.rank, c.id, c.period, c.county, c.cadastre, c.desc, c.origResult, c.origHitCodes, c.sheet === 'high' ? '高風險案件' : c.sheet === 'miss' ? '未命中清冊' : '單一宗地查詢', `Excel 第 ${c.excelRow} 列`,
      statusZh[a?.status] ? `${statusZh[a.status]}${a.reason ? '：' + a.reason : ''}` : '未執行', statusZh[b?.status] ? `${statusZh[b.status]}${b.reason ? '：' + b.reason : ''}` : '未執行',
      r.photo ? `${r.photo.items.filter(p => p.status === 'ok').length}/${r.photo.totalUrls} 張已讀取` : '未取', img ? ({ ok: '已取得', partial: '部分取得', failed: '取圖失敗', no_location: '無法定位' }[img.requestStatus] || img.requestStatus) : '未取', img?.sourceName || '', img?.captureDate || '拍攝日期未知', img?.fetchedAt || '',
      r.geo?.statusNote || '', r.imagery?.stats?.disc ? `植生 ${pct(r.imagery.stats.disc.vegetation)}／裸露 ${pct(r.imagery.stats.disc.bare)}／高亮 ${pct(r.imagery.stats.disc.bright)}（半徑 ${r.imagery.stats.discRadiusM} m 圓內；色彩粗分類）` : '',
      `法律／權源待查 ${r.score.legalQueryRisk}；文字-影像一致性 ${r.score.textImageConsistency ?? '無法計算'}；跨期相鄰 ${r.recurrence?.count || 0} 筆；綜合優先 ${r.score.priority}${r.score.priorityPartial ? '（部分）' : ''}`,
      r.score.evidenceCompleteness, [...r.score.priorityMissing, ...(r.geo?.status === 'mismatch' ? ['地號與座標不符'] : [])].join('；'), review?.status || '待覆核', review?.note || '', r.score.priority, r.score.reason || '']);
    { const cs = cadastreSourceFor(r); if (cs.available) evidence.push([c.id, '地籍圖', cs.source, '本機地籍庫 data/local/cadastre-yilan.sqlite', '宗地界線', `匯入 ${cs.importedAt || '未記錄'}`, `圖資日期 ${cs.latestDataDate || '未記錄'}；宗地 ${cs.parcels.map(p => `${p.landNumber}：${p.dataDate || '未記錄'}`).join('、') || '無'}`, '', 'TWD97 → WGS84', '', '', cs.licence || '使用者提供，僅供本機', 'ok', cs.sourceSha256 || '']); }
    if (img) evidence.push([c.id, 'PHOTO2 航照', img.sourceName, img.endpoint, img.serviceLayer, img.datasetVersion, img.captureDate || '拍攝日期未知', img.fetchedAt, img.crs, (img.bbox || []).map(v => v.toFixed(6)).join(','), `${img.resolutionMPerPx} m/px`, img.licence, img.requestStatus, img.imageSha256 || '']);
    for (const p of r.photo?.items || []) evidence.push([c.id, '原查證照片', '清冊 URL（landchg.nlma.gov.tw）', p.url, '', '', p.captureDate || '拍攝日期未知', p.fetchedAt, '', '', p.widthPx ? `${p.widthPx}×${p.heightPx}` : '', '來源機關資料；僅保存雜湊與統計', p.status === 'ok' ? 'ok' : `${p.status}：${p.reason || ''}`, p.sha256 || '']);
    manifest.push({ id: c.id, excelRow: c.excelRow, sheet: c.sheet, aerial: img ? { source: img.sourceName, endpoint: img.endpoint, bbox: img.bbox, zoom: img.zoom, fetchedAt: img.fetchedAt, captureDate: img.captureDate, status: img.requestStatus, sha256: img.imageSha256 || null, tiles: img.tiles?.map(t => ({ z: t.z, x: t.x, y: t.y, status: t.status, usable: t.usable, sha256: t.sha256 })) } : null, photos: (r.photo?.items || []).map(p => ({ url: p.url, status: p.status, reason: p.reason, sha256: p.sha256 || null, fetchedAt: p.fetchedAt, httpStatus: p.httpStatus })), scoreVersion: r.score.version, textRuleVersion: r.text.ruleVersion });
  }
  const sheet1 = { title: '逐筆候選清冊', header: ['性質', '候選群組ID', '排名', '變異點編號', '期別', '縣市', '參考地籍', '內容描述（原文）', '原查證結果', '原風險碼', '來源工作表', '來源Excel列號', 'R09-A 文字 vs 原查證照片', 'R09-B 文字 vs 航照', '照片狀態', '航照狀態', '影像來源', '影像拍攝日', '取圖日', '空間落點', '異常量化', '風險構成', '證據覆蓋率(%)', '資料缺口', '人工覆核狀態', '人工覆核備註', '綜合優先分數', '篩選理由（分數拆解）'], rows: rowsCases };
  const sheet2 = { title: '現勘地點彙整', header: ['性質', '候選ID', '排名', '行政區', '地籍', '關聯筆數', '關聯變異點ID', '群組理由', '主要異常（規則）', '綜合優先分數', '法律／權源待查', '文字-影像一致性', '證據覆蓋率(%)', '證據缺口', '是否建議現勘', '地圖定位（WGS84）', '期別', '篩選理由'], rows: chosen.map(g => [tag, g.id, g.rank, g.county, g.parcels.join('；'), g.size, g.memberIds.join('、'), g.reason, g.rules.map(code => `${code} ${RULE_TITLES[code].slice(0, 18)}`).join('；') || '無規則命中', `${g.priority}${g.priorityPartial ? '（部分）' : ''}`, g.legalQueryRisk, g.textImageConsistency ?? '無法計算', g.evidenceCompleteness, g.gaps.join('；') || '—', g.rank <= 12 && g.legalQueryRisk >= 20 ? '建議（AI 候選，須人工確認）' : '待人工判斷', g.centre ? `${g.centre.lon.toFixed(6)}, ${g.centre.lat.toFixed(6)}` : '無座標', g.periods.join('／'), g.selectionReason]) };
  const sheet3 = { title: '來源與證據索引', header: ['變異點編號', '證據類型', '來源名稱', 'endpoint／URL', '圖層', '資料版本', '拍攝日期', '取得時間', 'CRS', 'bbox', '解析度', '授權', '請求狀態', 'SHA-256'], rows: evidence };
  const w = state.weights;
  const sheet4 = { title: '分析方法與限制', header: ['項目', '說明'], rows: [
    ['成果性質', `${tag}：本表為規則與影像統計產生的選案候選，不是正式現勘結論，也不是違規認定。`], ['產製時間', dateText()], ['來源清冊', `${state.source?.name || ''}（SHA-256 ${state.source?.sha256 || ''}）`],
    ['語意分層', LEGAL_NOTE.semantics.join('；')], ['法律提醒', LEGAL_NOTE.caveat],
    ['文字規則', `${TEXT_RULE_VERSION}：中文規則抽取地物、行為、面積、否定／疑似／核准語句，附原文證據；R01～R08 為重新計算，不沿用清冊原風險碼（原碼僅對照）。`],
    ['R09-A', '文字 vs 原查證照片：照片須實際下載且可解碼才算已讀；403／404／逾時／非影像／解析度不足一律「不可評」。色彩比例只粗檢「植生」主張，其餘語意需人工或使用者啟用的 AI 視覺。'],
    ['R09-B', `文字 vs 航照：以 ${WMTS.name} 的現況影像，在變異點等面積半徑圓內做色彩粗分類（${IMAGERY_VERSION}）。拍攝日期未知，不是確認的同期影像；單期不能推斷新增／拆除；未校正季節、陰影、遮蔽與配準誤差。`],
    ['地籍比對', '以第一階段本機地籍庫：參考地籍（段名經國土測繪中心地段代碼表對照）→ 宗地；座標落點、與所引地號距離。地號與座標不符只列待查。'],
    ['R10', '以座標 50 m 內不同期別他案，及相同參考地籍文字之跨期他案，由程式重新計算。'],
    ['評分權重', JSON.stringify(w)], ...WEIGHT_MEANINGS.map(([k, v]) => [`權重 ${k}`, v]), ['綜合現勘優先分數公式', '（法律／權源待查 × 權重 ＋ （100 − 文字-影像一致性）× 權重 ＋ 跨期重複 × 權重）÷ 實際使用的權重總和；一致性不可評時該項不計入並標「部分」'], ['評分版本', w.version], ['評分限制', '分數不是違規機率；缺資料不當作 0，缺項時以已有項目加權並標「部分」。'],
    ['影像授權', '歷年航照尚未介接，未驗證授權；本表僅使用 PHOTO2 現況影像。影像快取只在本機 data/local，不入 Git。'], ['不使用', '未讀取「檔案2」標準答案；清冊的「現勘12處項次」欄不參與選案或評分。'],
  ] };
  const features = chosen.flatMap(g => g.memberIds.map(id => { const c = byId.get(id), r = state.results[id]; return pointOf(c) ? { type: 'Feature', geometry: { type: 'Point', coordinates: [c.lon, c.lat] }, properties: { 性質: tag, 候選ID: g.id, 排名: g.rank, 變異點編號: id, 期別: c.period, 參考地籍: c.cadastre, 綜合優先分數: r.score.priority, 部分: r.score.priorityPartial } } : null; })).filter(Boolean);
  return { fileBase: `AI候選清冊_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`, sheets: [sheet1, sheet2, sheet3, sheet4], geojson: { type: 'FeatureCollection', name: tag, features }, manifest: { generatedAt: new Date().toISOString(), nature: tag, source: state.source, imageryLicenceNote: WMTS.licence, items: manifest } };
}

// ---------- 封存（盲測前凍結排序，之後不可改寫） ----------
const sealDir = () => { const d = join(dir(), 'seals'); mkdirSync(d, { recursive: true }); return d; };
export function sealRun({ scope = 'high', note = '', file2Read = false } = {}) {
  const state = load();
  if (!state.source) throw new Error('尚未匯入清冊');
  const analysed = state.cases.filter(c => c.sheet === scope && state.results[c.id]?.score);
  if (!analysed.length) throw new Error('此範圍尚未分析，請先執行 AI 智慧選案');
  const groups = buildGroups({ scope }), sealedAt = new Date().toISOString();
  const caseRanking = analysed.map(c => { const r = state.results[c.id]; return { id: c.id, excelRow: c.excelRow, period: c.period, priority: r.score.priority, partial: r.score.priorityPartial, legalQueryRisk: r.score.legalQueryRisk, consistency: r.score.textImageConsistency, evidenceCompleteness: r.score.evidenceCompleteness, imagery: r.imagery?.metadata?.requestStatus || null, geo: r.geo.status, hits: Object.keys(r.text.rules).filter(k => r.text.rules[k].hit) }; }).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  caseRanking.forEach((row, i) => { row.rank = i + 1; });
  const runId = `run-${sealedAt.replace(/[-:TZ.]/g, '').slice(0, 14)}-${state.source.sha256.slice(0, 8)}-${scope}`;
  const snapshot = {
    runId, sealedAt, scope, note, source: { name: state.source.name, bytes: state.source.bytes, sha256: state.source.sha256 }, importedAt: state.importedAt,
    algorithm: { textRules: TEXT_RULE_VERSION, imagery: IMAGERY_VERSION, scoring: state.weights.version, weights: state.weights },
    environment: { node: process.version, platform: process.platform, arch: process.arch, os: `${os.type()} ${os.release()}`, cpu: os.cpus()[0]?.model, cores: os.cpus().length, totalMemoryGB: Math.round(os.totalmem() / 1073741824 * 10) / 10, memoryRssMB: Math.round(process.memoryUsage().rss / 1048576), lastRun: { timing: job.timing, peakRssMB: job.peakRssMB, counts: job.counts, scope: job.scope } },
    counts: { cases: state.cases.filter(c => c.sheet === scope).length, analysed: analysed.length, withImagery: analysed.filter(c => state.results[c.id].imagery).length, groups: groups.length },
    groups: groups.map(g => ({ id: g.id, rank: g.rank, memberIds: g.memberIds, leadId: g.leadId, priority: g.priority, priorityPartial: g.priorityPartial, county: g.county, parcels: g.parcels, periods: g.periods, centre: g.centre, rules: g.rules, legalQueryRisk: g.legalQueryRisk, evidenceCompleteness: g.evidenceCompleteness })),
    caseRanking,
    topSets: { top12: groups.slice(0, 12).map(g => g.id), top30: groups.slice(0, 30).map(g => g.id), all: groups.length },
    blindRule: file2Read ? '封存前已讀取過檔案2：本快照只能作補充統計，不能稱盲測。' : '封存時未讀取檔案2；封存後的盲測對照只讀取本快照，不回寫排序、不改權重。', file2Read: Boolean(file2Read),
  };
  const body = JSON.stringify(snapshot), sha = createHash('sha256').update(body).digest('hex');
  audit('seal', { runId });
  save(true);
  writeFileSync(join(sealDir(), runId + '.json'), JSON.stringify({ snapshotSha256: sha, snapshot }), { flag: 'wx' });
  return { runId, snapshotSha256: sha, sealedAt, counts: snapshot.counts };
}
export function listSeals() {
  return readdirSync(sealDir()).filter(n => n.endsWith('.json') && !n.startsWith('blind-')).map(n => { const d = JSON.parse(readFileSync(join(sealDir(), n), 'utf8')); return { runId: d.snapshot.runId, sealedAt: d.snapshot.sealedAt, scope: d.snapshot.scope, snapshotSha256: d.snapshotSha256, counts: d.snapshot.counts, source: d.snapshot.source.name }; }).sort((a, b) => b.sealedAt.localeCompare(a.sealedAt));
}
export function readSeal(runId) {
  if (!/^run-[\w-]+$/.test(String(runId))) throw new Error('run_id 不正確');
  const file = join(sealDir(), runId + '.json');
  if (!existsSync(file)) throw new Error('找不到封存快照');
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (createHash('sha256').update(JSON.stringify(data.snapshot)).digest('hex') !== data.snapshotSha256) throw new Error('封存快照雜湊不符，已被改動');
  return data;
}

// ---------- HTTP ----------
function localOnly(req) {
  const host = String(req.headers.host || ''), origin = String(req.headers.origin || '');
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && /^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host) && (!origin || origin === `http://${host}`) && !['forwarded', 'x-forwarded-for', 'x-real-ip'].some(n => req.headers[n]);
}
async function body(req, limit) { const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('內容過大'); chunks.push(chunk); } return Buffer.concat(chunks); }

export function taiwanInventoryProxy() {
  return {
    name: 'taiwan-inventory',
    configureServer(server) {
      server.middlewares.use('/api/taiwan/inventory', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        if (!localOnly(req)) { res.statusCode = 403; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify({ error: '僅允許本機同來源瀏覽器' })); return; }
        const url = new URL(req.url, 'http://127.0.0.1'), route = url.pathname, json = value => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); };
        try {
          if (req.method === 'GET') {
            if (route === '/state') return json(stateSummary());
            if (route === '/progress') return json(progress());
            if (route === '/cases') return json(listCases(Object.fromEntries(url.searchParams)));
            if (route === '/case') return json(caseCard(url.searchParams.get('id')));
            if (route === '/groups') { const top = Number(url.searchParams.get('top') ?? 12); const groups = buildGroups({ scope: url.searchParams.get('scope') || 'high' }); return json({ total: groups.length, groups: top > 0 ? groups.slice(0, top) : groups }); }
            if (route === '/export') return json(buildExport({ top: Number(url.searchParams.get('top') ?? 12), scope: url.searchParams.get('scope') || 'high' }));
            if (route === '/weights') return json(load().weights);
            if (route === '/weight-meanings') return json(WEIGHT_MEANINGS);
            if (route === '/seals') return json(listSeals());
            if (route === '/audit') return json((load().audit || []).slice(-200));
            if (route === '/seal') return json(readSeal(url.searchParams.get('runId')));
            if (route === '/image') {
              const id = url.searchParams.get('id'), state = load(), r = state.results[id];
              const key = url.searchParams.get('kind') === 'photo' ? url.searchParams.get('key') : r?.imagery?.imageKey;
              if (!key || !/^[\w.-]+$/.test(key)) { res.statusCode = 404; return json({ error: '沒有影像' }); }
              const file = join(cacheDirectory(dataDirectory()), key);
              if (!existsSync(file)) { res.statusCode = 404; return json({ error: '影像快取不存在' }); }
              res.setHeader('Content-Type', key.endsWith('.png') ? 'image/png' : 'image/jpeg'); res.end(readFileSync(file)); return;
            }
          } else if (req.method === 'POST') {
            if (route === '/import') { const buffer = await body(req, 120_000_000); return json(await importWorkbook(buffer, decodeURIComponent(url.searchParams.get('name') || 'inventory.xlsx'))); }
            const data = JSON.parse((await body(req, 200_000)).toString('utf8') || '{}');
            if (route === '/remap') { const state = load(); if (!state.source) throw new Error('尚未匯入'); return json(await importWorkbook(readFileSync(join(dir(), 'source.xlsx')), state.source.name, data.mapping || {})); }
            if (route === '/run') return json(await startRun(data));
            if (route === '/seal') return json(sealRun(data));
            if (route === '/stop') return json(stopRun());
            if (route === '/undo') return json(undoImagery(data.ids));
            if (route === '/review') return json(setReview(data.id, data.status, data.note));
            if (route === '/weights') return json(data.reset ? resetWeights() : setWeights(data));
            if (route === '/imagery') { const ac = new AbortController(); res.on('close', () => ac.abort()); return json(await ensureImagery(data.id, { photos: data.photos ?? 3, signal: ac.signal })); }
            if (route === '/parcel') { const ac = new AbortController(); res.on('close', () => ac.abort()); return json(await analyzeParcel({ ...data, signal: ac.signal })); }
          }
          res.statusCode = 404; json({ error: '不支援的操作' });
        } catch (error) { res.statusCode = 400; json({ error: error.message }); }
      });
    },
  };
}
