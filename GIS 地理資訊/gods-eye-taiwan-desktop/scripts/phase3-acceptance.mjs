// 第三階段實測：對「正在執行的本機服務」與本機清冊結果量測各項指標，輸出 JSON（只存 data/local）。
// 用法：node scripts/phase3-acceptance.mjs   （服務需已啟動，且已匯入檔案1並執行過選案）
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), local = join(root, 'data', 'local'), base = 'http://127.0.0.1:4175/api/taiwan';
const JSZip = createRequire(join(root, '.work', 'upstream', 'package.json'))('jszip');
const get = async path => (await fetch(base + path)).json();
const out = { at: new Date().toISOString(), machine: { os: `${os.type()} ${os.release()}`, cpu: os.cpus()[0]?.model, cores: os.cpus().length, memGB: Math.round(os.totalmem() / 1073741824 * 10) / 10, node: process.version } };
const store = JSON.parse(readFileSync(join(local, 'inventory', 'store.json'), 'utf8'));
const results = store.results, high = store.cases.filter(c => c.sheet === 'high'), miss = store.cases.filter(c => c.sheet === 'miss');
const tally = (list, fn) => list.reduce((m, x) => { const k = fn(x); m[k] = (m[k] || 0) + 1; return m; }, {});

// ---- 清冊層 ----
const hr = high.map(c => results[c.id]).filter(Boolean);
out.inventory = {
  parsed: { high: high.length, miss: miss.length, parseErrors: store.parseErrors.length, source: store.source },
  coordinates: { highWithCoordinate: high.filter(c => Number.isFinite(c.lon)).length, highTotal: high.length, missWithCoordinate: miss.filter(c => Number.isFinite(c.lon)).length, missTotal: miss.length },
  geoStatusHigh: tally(hr, r => r.geo.status), geoStatusMiss: tally(miss.map(c => results[c.id]).filter(Boolean), r => r.geo.status),
  cadastreRefsNotFound: tally(hr.flatMap(r => r.geo.refs.filter(x => !x.found)), x => x.why),
  photoUrls: { highCasesWithUrl: high.filter(c => c.photoUrls.length || c.otherPhotoUrls.length).length, highTotal: high.length, missCasesWithUrl: miss.filter(c => c.photoUrls.length || c.otherPhotoUrls.length).length, missTotal: miss.length },
};
const imaged = high.filter(c => results[c.id]?.imagery), ir = imaged.map(c => results[c.id]);
out.imageryHighSample = {
  denominator: imaged.length, aerial: tally(ir, r => r.imagery.metadata.requestStatus), photoRead: ir.filter(r => r.photo?.items?.some(p => p.status === 'ok')).length,
  photoFailed: tally(ir.flatMap(r => r.photo?.items || []).filter(p => p.status !== 'ok'), p => p.reason || p.status),
  casesWithoutPhotoUrl: ir.filter(r => !r.photo?.totalUrls).length, r09a: tally(ir, r => r.photo?.r09a?.status || 'none'), r09b: tally(ir, r => r.imagery.r09b.status),
  captureDateKnown: ir.filter(r => r.imagery.metadata.captureDate).length, photoCaptureDateKnown: ir.flatMap(r => r.photo?.items || []).filter(p => p.captureDate).length, photoItems: ir.flatMap(r => r.photo?.items || []).length,
  temporalCaveatPresent: ir.filter(r => r.imagery.r09b.temporalCaveat).length, fetchedAtPresent: ir.filter(r => r.imagery.metadata.fetchedAt).length,
  r09bConsistentButWithLegalFlag: ir.filter(r => r.imagery.r09b.status === 'consistent' && r.score.legalQueryRisk > 0).length,
};

// ---- 地籍層（現行服務）----
const cad = await get('/nlsc-buildings/info/cadastre/status');
const samples = [];
for (const t of cad.towns) {
  const box = [t.center.lon - 0.003, t.center.lat - 0.003, t.center.lon + 0.003, t.center.lat + 0.003];
  const data = await get(`/nlsc-buildings/info/cadastre/parcels?bbox=${box.join(',')}&limit=3&town=${encodeURIComponent(t.town)}`);
  for (const f of data.features.slice(0, 2)) {
    const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
    const lon = ring.reduce((s, p) => s + p[0], 0) / ring.length, lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const at = (await get(`/nlsc-buildings/info/cadastre/at?lon=${lon}&lat=${lat}`)).parcel;
    samples.push({ town: t.town, section: f.properties.sectionName, parcel: f.properties.landNumber, sameParcelAtCentroid: at?.parcelId === f.properties.parcelId });
  }
}
out.cadastre = { parcels: cad.parcels, latestDataDate: cad.latestDataDate, towns: cad.towns.length, source: cad.source, sample: { n: samples.length, ok: samples.filter(s => s.sameParcelAtCentroid).length, townsCovered: new Set(samples.map(s => s.town)).size, rows: samples.slice(0, 8) }, note: '質心可能落在凹多邊形外，僅作抽查；不是定位精度。' };

// ---- 例外情境（本機模擬）----
const imagery = await import(pathToFileURL(join(root, '.work', 'upstream', 'server', 'providers', 'inventoryImagery.js')).href);
const server = createServer((req, res) => {
  const route = req.url;
  if (route === '/403') { res.statusCode = 403; return res.end('forbidden'); }
  if (route === '/429') { res.statusCode = 429; return res.end('slow down'); }
  if (route === '/html') { res.setHeader('Content-Type', 'text/html'); return res.end('<html>login</html>'); }
  if (route === '/broken') { res.setHeader('Content-Type', 'image/jpeg'); return res.end(Buffer.from('not-a-jpeg-at-all'.repeat(20))); }
  if (route === '/tiny') { res.setHeader('Content-Type', 'image/png'); return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')); }
  res.statusCode = 404; res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port, exceptions = {};
for (const route of ['403', '429', 'html', 'broken', 'tiny', '404x']) { const p = await imagery.readPhoto(`http://127.0.0.1:${port}/${route}`, { dataDir: local }); exceptions['photo ' + route] = { status: p.status, reason: p.reason }; }
server.close();
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed (模擬無網路)'); };
const offline = await imagery.aerialFor({ bbox: [121.7, 24.7, 121.7005, 24.7005], point: { lon: 121.70025, lat: 24.70025 }, rings: null, radiusM: 10, dataDir: join(local, 'phase3-offline-test') }).catch(e => ({ error: e.message }));
globalThis.fetch = realFetch;
exceptions['aerial no-network'] = { requestStatus: offline.metadata?.requestStatus, image: Boolean(offline.image), error: offline.error };
const sea = await imagery.aerialFor({ bbox: [125.0, 20.0, 125.0005, 20.0005], point: { lon: 125.00025, lat: 20.00025 }, rings: null, radiusM: 10, dataDir: local }).catch(e => ({ error: e.message }));
exceptions['aerial outside coverage (far offshore)'] = { requestStatus: sea.metadata?.requestStatus, image: Boolean(sea.image), error: sea.error };
out.exceptions = exceptions;

// ---- 同名地段／子號 ----
const sections = JSON.parse(readFileSync(join(local, 'cadastre-sections.json'), 'utf8')).sections, names = tally(Object.values(sections), s => s.name);
out.sections = { codes: Object.keys(sections).length, duplicateNames: Object.entries(names).filter(([, n]) => n > 1).map(([name, n]) => `${name}x${n}`), subNumberCases: high.filter(c => /\d+-\d+/.test(c.cadastre)).length, subNumberResolved: high.filter(c => /\d+-\d+/.test(c.cadastre) && results[c.id]?.geo.refs.some(r => r.found)).length };

// ---- 巨大 Excel（合成 6 萬列）----
const { readWorkbook } = await import(pathToFileURL(join(root, 'overlay', 'server', 'providers', 'xlsxRead.js')).href);
const zip = new JSZip(), N = 60000;
zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>');
zip.file('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="高風險案件" sheetId="1" r:id="rId1"/></sheets></workbook>');
zip.file('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
let sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>變異點編號</t></is></c><c r="B1" t="inlineStr"><is><t>內容描述（原文）</t></is></c></row>';
for (let i = 2; i < N; i++) sheet += `<row r="${i}"><c r="A${i}" t="inlineStr"><is><t>T${i}</t></is></c><c r="B${i}" t="inlineStr"><is><t>疑似新增鐵皮屋 ${i}</t></is></c></row>`;
zip.file('xl/worksheets/sheet1.xml', sheet + '</sheetData></worksheet>');
const big = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const t0 = Date.now(), parsed = await readWorkbook(JSZip, big);
out.bigExcel = { rows: N, bytes: big.length, parseMs: Date.now() - t0, parsedRows: parsed[0].rows.length, rssMB: Math.round(process.memoryUsage().rss / 1048576) };

// ---- 封存與稽核 ----
const seals = await get('/inventory/seals');
out.seals = seals;
for (const s of seals) out['sealEnv:' + s.runId] = (await get('/inventory/seal?runId=' + s.runId)).snapshot.environment;
out.audit = (await get('/inventory/audit')).map(a => a.action);
writeFileSync(join(local, 'inventory', `acceptance-${out.at.replace(/[:.\-]/g, '').slice(0, 15)}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
