// 取得宜蘭縣地段代碼對照表（段名）：國土測繪中心 api.nlsc.gov.tw 公開服務，寫入 data/local/cadastre-sections.json。
// 用法：node scripts/fetch-cadastre-sections.mjs [縣市代碼，預設 G=宜蘭縣]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const city = process.argv[2] || 'G', root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'data', 'local', 'cadastre-sections.json');
const base = 'https://api.nlsc.gov.tw/other';
const tag = (xml, name) => [...xml.matchAll(new RegExp(`<${name}>([^<]*)</${name}>`, 'g'))].map(m => m[1]);
const get = async url => { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`${url} HTTP ${r.status}`); return r.text(); };

const towns = await get(`${base}/ListTown/${city}`), codes = tag(towns, 'towncode'), names = tag(towns, 'townname');
const sections = {};
for (let i = 0; i < codes.length; i++) {
  const xml = await get(`${base}/ListLandSection/${city}/${codes[i]}`);
  const office = tag(xml, 'office'), code = tag(xml, 'sectcode'), name = tag(xml, 'sectstr');
  code.forEach((c, j) => { sections[`${office[j]}${c}`] ??= { name: name[j], town: names[i], office: office[j] }; });
  console.log(names[i], code.length);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ source: '國土測繪中心 地段代碼查詢服務 api.nlsc.gov.tw/other/ListLandSection', fetchedAt: new Date().toISOString(), sections }, null, 1));
console.log('共', Object.keys(sections).length, '個地段 →', out);
