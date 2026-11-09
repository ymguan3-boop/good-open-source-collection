// 由本機服務匯出 AI 現勘候選：逐筆 + 地點彙整 Excel、GeoJSON、evidence_manifest.json（只含候選、狀態與雜湊）。
// 用法：node scripts/export-candidates.mjs [12|30|0] [high|miss|all]    （0 = 全部）。輸出到 data/local/inventory/outputs。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), outDir = join(root, 'data', 'local', 'inventory', 'outputs');
const top = Number(process.argv[2] ?? 12), scope = process.argv[3] || 'high';
const { buildXlsxFromMarkdown } = await import(pathToFileURL(join(root, '.work', 'upstream', 'src', 'taiwan', 'xlsxExport.js')).href);
const data = await (await fetch(`http://127.0.0.1:4175/api/taiwan/inventory/export?top=${top}&scope=${scope}`)).json();
if (data.error) throw new Error(data.error);
mkdirSync(outDir, { recursive: true });
const tag = `${scope}_${top === 0 ? 'all' : 'top' + top}`;
const blob = await buildXlsxFromMarkdown('', { extraTables: data.sheets, program: '上帝之眼・台灣版（AI候選非正式現勘結論）' });
writeFileSync(join(outDir, `AI候選清冊_${tag}.xlsx`), Buffer.from(await blob.arrayBuffer()));
writeFileSync(join(outDir, `AI候選_${tag}.geojson`), JSON.stringify(data.geojson, null, 1));
writeFileSync(join(outDir, `evidence_manifest_${tag}.json`), JSON.stringify(data.manifest, null, 1));
console.log(tag, data.sheets.map(s => `${s.title}:${s.rows.length}`).join(' '), 'geojson', data.geojson.features.length);
