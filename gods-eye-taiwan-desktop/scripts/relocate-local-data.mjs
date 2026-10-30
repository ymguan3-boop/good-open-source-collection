// After the local data package is extracted on another computer or folder, the
// township pack registry (data/local/imports.json) still names the old absolute
// folder. Point entries whose old folder is gone to this project's data/local.
// Only the registry is rewritten; a timestamped backup is kept beside it.
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dataDir = resolve(import.meta.dirname, '..', 'data', 'local');
const file = join(dataDir, 'imports.json');
if (!existsSync(file)) { console.log('沒有 data/local/imports.json，無需調整。'); process.exit(0); }
const registry = JSON.parse(readFileSync(file, 'utf8'));
const has = (root, slug) => root && existsSync(join(root, `${slug}-buildings.sqlite`));
let moved = 0, missing = [];
for (const [slug, entry] of Object.entries(registry.imported || {})) {
  if (has(entry?.root, slug)) continue;
  if (has(dataDir, slug)) { entry.root = dataDir; moved++; } else missing.push(slug);
}
const roots = Array.isArray(registry.extraRoots) ? registry.extraRoots : [];
registry.extraRoots = roots.filter(root => existsSync(root));
const dropped = roots.length - registry.extraRoots.length;
if (!moved && !dropped) { console.log(`imports.json 路徑皆有效（${dataDir}）。`); }
else {
  copyFileSync(file, `${file}.bak-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`);
  writeFileSync(`${file}.tmp`, JSON.stringify(registry, null, 1), 'utf8');
  renameSync(`${file}.tmp`, file);
  console.log(`已更新 imports.json：${moved} 個鄉鎮改指向 ${dataDir}；移除 ${dropped} 個不存在的額外資料夾。`);
}
if (missing.length) console.warn(`下列鄉鎮在本機找不到資料庫，未修改：${missing.join(', ')}`);
