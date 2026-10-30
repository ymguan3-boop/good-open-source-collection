// Verifies an extracted install package against its manifest (path, size, SHA-256).
// Usage: node scripts/verify-package.mjs PACKAGE_MANIFEST.json
//        node scripts/verify-package.mjs data/LOCAL_DATA_MANIFEST.json
// Paths in the manifest are relative to the project root. Files that the user
// changed after installation are reported, never repaired or deleted.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifestPath = resolve(root, process.argv[2] || 'PACKAGE_MANIFEST.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const sha256 = file => new Promise((done, fail) => {
  const hash = createHash('sha256');
  createReadStream(file).on('data', chunk => hash.update(chunk)).on('end', () => done(hash.digest('hex').toUpperCase())).on('error', fail);
});
const missing = [], changed = [];
for (const item of manifest.files) {
  const file = resolve(root, item.path);
  if (!existsSync(file)) { missing.push(item.path); continue; }
  if (statSync(file).size !== item.size || (await sha256(file)) !== item.sha256) changed.push(item.path);
}
console.log(`${manifest.package} ${manifest.version}：${manifest.files.length} 個檔案，缺少 ${missing.length}，不符 ${changed.length}。`);
for (const path of missing.slice(0, 20)) console.log(`缺少：${path}`);
for (const path of changed.slice(0, 20)) console.log(`不符：${path}`);
process.exitCode = missing.length || changed.length ? 1 : 0;
