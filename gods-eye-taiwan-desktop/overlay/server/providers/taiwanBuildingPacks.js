import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// A "pack" is one township's local database made by scripts/build-building-master.mjs:
//   <slug>-buildings.sqlite, <slug>-white/ (white-model tiles) and <slug>-tileset-{nlsc,white}.json.
// Nothing is built into the application: a pack only becomes visible after the user imports it,
// and the imports (plus which ones were loaded) are remembered in <data>/imports.json.
export const SLUG = /^[a-z][a-z-]{1,30}$/;

export function dataDirectory() {
  if (process.env.GODS_EYE_LOCAL_DATA) return resolve(process.env.GODS_EYE_LOCAL_DATA);
  for (let dir = import.meta.dirname, i = 0; i < 8; i++, dir = dirname(dir)) {
    const candidate = join(dir, 'data', 'local');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const registryFile = () => { const dir = dataDirectory(); return dir && join(dir, 'imports.json'); };
export function readRegistry() {
  const base = { version: 1, extraRoots: [], imported: {}, whiteMode: true };
  try {
    const file = registryFile();
    if (!file || !existsSync(file)) return base;
    const value = JSON.parse(readFileSync(file, 'utf8'));
    return { ...base, ...value, extraRoots: Array.isArray(value.extraRoots) ? value.extraRoots : [], imported: value.imported && typeof value.imported === 'object' ? value.imported : {} };
  } catch { return base; }
}
function writeRegistry(registry) {
  const file = registryFile();
  if (!file) throw new Error('找不到本機資料資料夾');
  writeFileSync(`${file}.tmp`, JSON.stringify(registry, null, 1), 'utf8');
  renameSync(`${file}.tmp`, file);
}

/** Packs found in one folder; unfinished builds (no township recorded or tiles pending) are skipped. */
export function scanRoot(root) {
  let names;
  try { names = readdirSync(root); } catch { return []; }
  const packs = [];
  for (const name of names) {
    const match = /^([a-z][a-z-]{1,30})-buildings\.sqlite$/.exec(name);
    if (!match) continue;
    const slug = match[1];
    try {
      const db = new DatabaseSync(join(root, name), { readOnly: true });
      const meta = Object.fromEntries(db.prepare('SELECT key, value FROM meta').all().map(row => [row.key, row.value]));
      const count = db.prepare('SELECT COUNT(*) AS n, SUM(in_area) AS a FROM buildings').get(), tiles = db.prepare('SELECT COUNT(*) AS n FROM tiles_done').get();
      db.close();
      if (!meta.towns || Number(meta.pending_tiles) > 0) continue;
      packs.push({ slug, root, towns: meta.towns, buildings: count.n, inArea: count.a || 0, tiles: tiles.n, updatedAt: meta.updated_at || null,
        hasIndex: existsSync(join(root, `${slug}-tileset-nlsc.json`)), hasWhite: existsSync(join(root, `${slug}-white`)) && existsSync(join(root, `${slug}-tileset-white.json`)) });
    } catch { /* locked or incomplete database */ }
  }
  return packs;
}

export function importedPacks() {
  const registry = readRegistry();
  return Object.entries(registry.imported).filter(([slug, entry]) => SLUG.test(slug) && entry?.root && existsSync(join(entry.root, `${slug}-buildings.sqlite`)))
    .map(([slug, entry]) => ({ slug, ...entry }));
}
export function packRoot(slug) {
  const entry = readRegistry().imported[slug];
  return SLUG.test(slug || '') && entry?.root ? entry.root : null;
}

export function availablePacks() {
  const registry = readRegistry(), roots = [dataDirectory(), ...registry.extraRoots].filter(Boolean);
  const seen = new Set(Object.keys(registry.imported)), found = [];
  for (const root of roots) for (const pack of scanRoot(root)) if (!seen.has(pack.slug)) { seen.add(pack.slug); found.push(pack); }
  return found.sort((a, b) => a.towns.localeCompare(b.towns, 'zh-TW'));
}

export function scanFolder(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('請輸入完整的資料夾路徑（例如 D:\\資料\\宜蘭）');
  const root = resolve(path);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error('找不到這個資料夾');
  const packs = scanRoot(root);
  if (!packs.length) throw new Error('此資料夾沒有完成的鄉鎮市資料庫（*-buildings.sqlite）');
  return packs;
}

export function importPacks(slugs, folder) {
  if (!Array.isArray(slugs) || !slugs.length || slugs.length > 40 || !slugs.every(slug => SLUG.test(slug))) throw new Error('請勾選要匯入的鄉鎮市');
  const registry = readRegistry(), candidates = folder ? scanRoot(resolve(folder)) : availablePacks();
  const added = [];
  for (const slug of slugs) {
    const pack = candidates.find(item => item.slug === slug);
    if (!pack) throw new Error(`找不到可匯入的資料庫：${slug}`);
    if (!pack.hasIndex) throw new Error(`${pack.towns} 缺少圖磚索引，請先執行建檔腳本（--tileset-only）`);
    registry.imported[slug] = { root: pack.root, importedAt: new Date().toISOString(), loaded: false, visible: true };
    if (folder && pack.root !== dataDirectory() && !registry.extraRoots.includes(pack.root)) registry.extraRoots.push(pack.root);
    added.push(pack.towns);
  }
  writeRegistry(registry);
  return added;
}

/** Forgets a pack. With deleteFiles the pack's own files are removed as well (caller closes open handles first). */
export function removePack(slug, deleteFiles) {
  if (!SLUG.test(slug || '')) throw new Error('鄉鎮市代號不正確');
  const registry = readRegistry(), entry = registry.imported[slug];
  if (!entry) throw new Error('此鄉鎮市尚未匯入');
  delete registry.imported[slug];
  writeRegistry(registry);
  const deleted = [];
  if (deleteFiles === true) {
    const root = entry.root;
    for (const name of [`${slug}-buildings.sqlite`, `${slug}-buildings.sqlite-wal`, `${slug}-buildings.sqlite-shm`, `${slug}-tileset-nlsc.json`, `${slug}-tileset-white.json`]) {
      const file = join(root, name);
      if (existsSync(file)) { rmSync(file, { force: true }); deleted.push(name); }
    }
    const white = join(root, `${slug}-white`);
    if (existsSync(white)) { rmSync(white, { recursive: true, force: true }); deleted.push(`${slug}-white/`); }
  }
  return { deleted };
}

/** Remembers which imported towns are loaded/visible and the display source. */
export function saveState(patch) {
  const registry = readRegistry();
  for (const [slug, state] of Object.entries(patch?.layers || {})) {
    if (!registry.imported[slug] || !state || typeof state !== 'object') continue;
    registry.imported[slug].loaded = state.loaded === true;
    registry.imported[slug].visible = state.visible !== false;
  }
  if (typeof patch?.whiteMode === 'boolean') registry.whiteMode = patch.whiteMode;
  writeRegistry(registry);
}
