import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { analyzeDescription, extractAreas } from '../overlay/server/providers/inventoryText.js';

// 第二階段「AI 清冊與航照智慧勾稽」：文字規則、地籍字串、評分與影像不可評的守門測試。
// 需要 jszip／sharp 的部分使用已安裝工作區 .work/upstream（未安裝時略過）。
const installed = existsSync(new URL('../.work/upstream/server/providers/taiwanInventory.js', import.meta.url));

test('Chinese negation: 「無建物」「未見鐵皮屋」are not a structure claim', () => {
  const r = analyzeDescription('現況為雜草，無建物，未見鐵皮屋。', { result: '非違規' });
  assert.equal(r.claims.structure, false);
  assert.equal(r.claims.structureDenied, true);
  assert.equal(r.claims.vegetation, true);
  assert.equal(r.rules.R06.hit, false, '否定語境的鐵皮屋不應命中 R06');
});
test('suspicion, access limits, approval and areas are extracted with evidence', () => {
  const r = analyzeDescription('疑似新建鐵皮建物，因無法進入未能確認；縣府核准農機具室55.81平方公尺，衛星變異520.68平方公尺。', { result: '非違規', satelliteArea: 520.68 });
  assert.ok(r.rules.R05.hit && r.rules.R04.hit && r.rules.R06.hit);
  assert.ok(r.flags.approval.hit);
  assert.ok(r.rules.R08.hit, '55.81 vs 520.68 為量值明顯差異');
  const approved = r.areas.find(a => a.role === 'approved');
  assert.equal(approved.squareMetres, 55.81);
  assert.ok(r.rules.R05.evidence[0].includes('疑似'));
});
test('R01–R08 only apply when the original result is 非違規', () => {
  const r = analyzeDescription('未經申請擅自興建鐵皮屋', { result: '違規' });
  assert.ok(Object.entries(r.rules).filter(([code]) => /^R0[1-8]$/.test(code)).every(([, rule]) => rule.notApplicable && !rule.hit));
  const applies = analyzeDescription('未經申請擅自興建鐵皮屋', { result: '非違規' });
  assert.ok(applies.rules.R01.hit);
});
test('「非違規」字樣本身不是違法線索', () => {
  assert.equal(analyzeDescription('經查非違規，屬農業使用。', { result: '非違規' }).rules.R01.hit, false);
});
test('unit conversion and 未逾 caps', () => {
  const [a] = extractAreas('整地面積0.1公頃');
  assert.equal(a.squareMetres, 1000);
  const cap = extractAreas('面積未逾300平方公尺')[0];
  assert.equal(cap.role, 'cap');
});
test('empty or vague descriptions hit R07', () => {
  assert.ok(analyzeDescription('', { result: '非違規' }).rules.R07.hit);
  assert.ok(analyzeDescription('整地', { result: '非違規' }).rules.R07.hit);
});

test('cadastre text parsing keeps 段名 like 太和段 and handles lists', { skip: !installed }, async () => {
  const { parseCadastreRefs } = await import('../.work/upstream/server/providers/taiwanInventory.js');
  assert.deepEqual(parseCadastreRefs('太和段544地號').map(r => [r.section, r.pmno, r.pcno]), [['太和段', 544, 0]]);
  assert.deepEqual(parseCadastreRefs('雙連埤段268-1地號').map(r => [r.section, r.pmno, r.pcno]), [['雙連埤段', 268, 1]]);
  assert.deepEqual(parseCadastreRefs('季新段34、35及36地號').map(r => [r.section, r.pmno]), [['季新段', 34], ['季新段', 35], ['季新段', 36]]);
  assert.equal(parseCadastreRefs('廣興一段段888地號')[0].section, '廣興一段');
  assert.deepEqual(parseCadastreRefs(''), []);
});

test('invalid photo URL is 不可評, never counted as read (URL existence ≠ photo read)', { skip: !installed }, async () => {
  const { readPhoto } = await import('../.work/upstream/server/providers/inventoryImagery.js');
  const dir = new URL('../data/local/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const info = await readPhoto('http://127.0.0.1:9/not-there.jpg', { dataDir: decodeURIComponent(dir) });
  assert.notEqual(info.status, 'ok');
  assert.ok(info.reason);
  const r403 = await readPhoto('https://httpstat.us/403', { dataDir: decodeURIComponent(dir) }).catch(() => ({ status: 'failed' }));
  assert.notEqual(r403.status, 'ok');
});

test('score: missing consistency is flagged partial, never treated as zero or silently reweighted', { skip: !installed }, async () => {
  const { scoreResult } = await import('../.work/upstream/server/providers/taiwanInventory.js');
  const item = { id: 'X', sheet: 'high', desc: '疑似鐵皮屋', area: 100, lon: 121.7, lat: 24.7 };
  const text = analyzeDescription(item.desc, { result: '非違規', satelliteArea: 100 });
  const result = { text, geo: { status: 'point_in_cited', refs: [{ found: true }] }, recurrence: { count: 0 }, imagery: null, photo: null };
  const weights = { version: 't', legal: { R05: 8, R06: 7 }, priority: { legal: 0.45, inconsistency: 0.35, recurrence: 0.2 } };
  const score = scoreResult(item, result, weights);
  assert.equal(score.textImageConsistency, null);
  assert.equal(score.priorityPartial, true);
  assert.ok(score.priorityMissing.length > 0);
  assert.equal(score.weightsUsed.inconsistency, undefined);
  assert.ok(score.evidenceCompleteness < 100);
});

test('real 檔案1 parses 3,902 + 3,446 cases with no errors (when the local file exists)', { skip: !installed || !existsSync(new URL('../data/local/inventory/file1.xlsx', import.meta.url)) }, async () => {
  const JSZip = (await import('../.work/upstream/node_modules/jszip/lib/index.js')).default;
  const { readWorkbook } = await import('../overlay/server/providers/xlsxRead.js');
  const sheets = await readWorkbook(JSZip, readFileSync(new URL('../data/local/inventory/file1.xlsx', import.meta.url)));
  const high = sheets.find(s => s.name === '高風險案件'), miss = sheets.find(s => s.name === '未命中清冊');
  assert.equal(high.rows.filter(r => r.row > 4 && r.cells[1]).length, 3902);
  assert.equal(miss.rows.filter(r => r.row > 4 && r.cells[1]).length, 3446);
});

test('negated violation wording (「並無涉及違反…」) does not hit R01', () => {
  const r = analyzeDescription('現況為種植果樹及部分休耕，並無涉及違反開挖之情事。', { result: '非違規' });
  assert.equal(r.rules.R01.hit, false);
  const hit = analyzeDescription('該處違反土地使用規定，已限期改善。', { result: '非違規' });
  assert.equal(hit.rules.R01.hit, true);
});
