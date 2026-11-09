// 盲測對照（獨立驗收工具）：封存快照（只含檔案1的排序）× 檔案2（人工 12 處／28 筆）。
// 只做命中統計與失敗原因分析，不回寫封存快照、不改權重、不讀取分析引擎的可變狀態。
// 用法：node scripts/blind-compare.mjs <runId> [檔案2.xlsx]
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readWorkbook } from '../overlay/server/providers/xlsxRead.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), local = join(root, 'data', 'local', 'inventory');
const args = process.argv.slice(2).filter(a => !a.startsWith('--')), runId = args[0], file2 = args[1] || join(local, 'file2.xlsx');
if (!runId) throw new Error('用法：node scripts/blind-compare.mjs <runId> [檔案2.xlsx]');
const JSZip = createRequire(join(root, '.work', 'upstream', 'package.json'))('jszip');

const sealed = JSON.parse(readFileSync(join(local, 'seals', runId + '.json'), 'utf8'));
if (createHash('sha256').update(JSON.stringify(sealed.snapshot)).digest('hex') !== sealed.snapshotSha256) throw new Error('封存快照雜湊不符');
const snap = sealed.snapshot;
const blind = snap.file2Read === false;
if (!blind && !process.argv.includes('--supplementary')) throw new Error('此快照封存前已讀過檔案2，不能當盲測；補充統計請加 --supplementary');
// 檔案1的案件資料（座標等）來自本機 store，只用於空間比對，不含任何檔案2內容。
const store = JSON.parse(readFileSync(join(local, 'store.json'), 'utf8')), byId = new Map(store.cases.map(c => [c.id, c]));

const sheets = await readWorkbook(JSZip, readFileSync(file2));
const f2Sha = createHash('sha256').update(readFileSync(file2)).digest('hex');
const rows = sheets[0].rows.filter(r => r.row > 4 && r.cells[4]).map(r => { const c = r.cells; return { site: Number(c[0]), district: c[1], siteParcel: c[2], id: String(c[4]), parcel: c[9], origResult: c[10], autoCodes: c[14], inFile1High: String(c[16]).startsWith('是') }; });
const siteIds = [...new Set(rows.map(r => r.site))].sort((a, b) => a - b);

const rankOfCase = new Map(snap.caseRanking.map(r => [r.id, r]));
const groupOfCase = new Map(); for (const g of snap.groups) for (const id of g.memberIds) groupOfCase.set(id, g);
const missIds = new Set(store.cases.filter(c => c.sheet === 'miss').map(c => c.id));
const parcelKey = text => String(text || '').replace(/地號|號/g, '').replace(/\s/g, '');

// 空間 key：封存群組中心與案件座標 ≤ 100 m（群組中心來自檔案1座標）。
const dist = (a, b) => { const k = 111320 * Math.cos(a.lat * Math.PI / 180); return Math.hypot((a.lon - b.lon) * k, (a.lat - b.lat) * 110540); };
const BUFFER_M = 100;

const perCase = rows.map(r => {
  const c = byId.get(r.id), ranked = rankOfCase.get(r.id), g = groupOfCase.get(r.id);
  const reachable = Boolean(ranked);
  return { ...r, source: reachable ? '高風險案件（可選）' : missIds.has(r.id) ? '未命中清冊（無座標／照片，本次主選案不涵蓋）' : '不在檔案1', caseRank: ranked?.rank ?? null, casePriority: ranked?.priority ?? null, hits: ranked?.hits ?? [], groupId: g?.id ?? null, groupRank: g?.rank ?? null };
});
const caseRecall = n => perCase.filter(c => c.caseRank && c.caseRank <= n).length;

const perSite = siteIds.map(site => {
  const members = perCase.filter(c => c.site === site);
  const groups = [...new Set(members.map(m => m.groupId).filter(Boolean))].map(id => snap.groups.find(g => g.id === id));
  const bestGroup = groups.sort((a, b) => a.rank - b.rank)[0] || null;
  // 空間 key：任何一個高排名群組的中心距該處任一成員座標 ≤ 100 m（成員無座標則略過）。
  const coords = members.map(m => byId.get(m.id)).filter(c => c && Number.isFinite(c.lon)).map(c => ({ lon: c.lon, lat: c.lat }));
  const spatial = snap.groups.filter(g => g.centre && coords.some(p => dist(p, g.centre) <= BUFFER_M)).sort((a, b) => a.rank - b.rank)[0] || null;
  const sitePk = new Set(members.flatMap(m => String(m.parcel || '').split(/[、,，]/).map(parcelKey)).filter(Boolean));
  const parcelGroup = snap.groups.filter(g => g.parcels.some(p => sitePk.has(parcelKey(p)))).sort((a, b) => a.rank - b.rank)[0] || null;
  const reasons = [];
  if (!members.some(m => m.caseRank)) reasons.push('成員全部不在本快照範圍（該工作表的案件），無從選取');
  else if (members.some(m => !m.caseRank)) reasons.push(`${members.filter(m => !m.caseRank).length} 筆成員不在本快照範圍`);
  if (bestGroup && bestGroup.rank > 30) reasons.push(`最佳群組排名 ${bestGroup.rank}，落在 Top 30 之外`);
  if (members.every(m => m.origResult === '違規')) reasons.push('原查報全為「違規」：R01～R08 只針對「原判非違規卻有疑點」，不適用，分數主要來自跨期重複（R10）');
  if (!members.some(m => m.autoCodes)) reasons.push('檔案1原初篩未命中任何風險代碼');
  return { site, district: members[0].district, siteParcel: members[0].siteParcel, memberIds: members.map(m => m.id), membersInFile1High: members.filter(m => m.caseRank).length, bestGroupId: bestGroup?.id ?? null, bestGroupRank: bestGroup?.rank ?? null, spatialGroupId: spatial?.id ?? null, spatialGroupRank: spatial?.rank ?? null, parcelGroupId: parcelGroup?.id ?? null, parcelGroupRank: parcelGroup?.rank ?? null, reasons };
});
const siteHit = (key, n) => perSite.filter(s => s[key] && s[key] <= n).length;

const result = {
  blindRunId: runId, comparedAt: new Date().toISOString(), snapshotSha256: sealed.snapshotSha256, sealedAt: snap.sealedAt, file1Sha256: snap.source.sha256, file2Sha256: f2Sha, file2Name: file2.split(/[\/]/).pop(),
  isBlind: blind, rule: blind ? '封存快照未改動；檔案2只用於統計，未回寫排序或權重。' : '補充統計（封存晚於讀取檔案2，非盲測）；排序未回寫。', buffers: { spatialBufferM: BUFFER_M, keys: ['成員編號所屬群組（精確 ID）', `群組中心 ≤ ${BUFFER_M} m（座標取自檔案1）`, '地號文字重疊'] },
  counts: { sites: siteIds.length, cases: rows.length, caseInSnapshot: perCase.filter(c => c.caseRank).length, caseNotInSnapshot: perCase.filter(c => !c.caseRank).length, notInSnapshotButInMissSheet: perCase.filter(c => !c.caseRank && missIds.has(c.id)).length },
  caseRecall: { top12cases: caseRecall(12), top30cases: caseRecall(30), top100cases: caseRecall(100), anyRank: caseRecall(1e9), of: rows.length },
  siteHits: { byGroupId: { top12: siteHit('bestGroupRank', 12), top30: siteHit('bestGroupRank', 30), all: perSite.filter(s => s.bestGroupRank).length }, bySpatialBuffer: { top12: siteHit('spatialGroupRank', 12), top30: siteHit('spatialGroupRank', 30), all: perSite.filter(s => s.spatialGroupRank).length }, byParcelText: { top12: siteHit('parcelGroupRank', 12), top30: siteHit('parcelGroupRank', 30), all: perSite.filter(s => s.parcelGroupRank).length }, of: siteIds.length },
  top12Precision: null, perSite, perCase,
};
const top12Ids = new Set(snap.groups.slice(0, 12).flatMap(g => g.memberIds));
result.top12Precision = { top12GroupsContainingAnyHumanCase: snap.groups.slice(0, 12).filter(g => g.memberIds.some(id => rows.some(r => r.id === id))).length, of: 12 };
writeFileSync(join(local, 'seals', `blind-${runId}.json`), JSON.stringify(result, null, 1));
console.log(JSON.stringify({ counts: result.counts, caseRecall: result.caseRecall, siteHits: result.siteHits, top12Precision: result.top12Precision }, null, 1));
for (const s of perSite) console.log(s.site, s.district, s.siteParcel.slice(0, 18), '| group', s.bestGroupId, s.bestGroupRank, '| spatial', s.spatialGroupRank, '| parcel', s.parcelGroupRank, '|', s.reasons.join('；'));
