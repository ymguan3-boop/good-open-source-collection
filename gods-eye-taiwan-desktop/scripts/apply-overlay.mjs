
import { readFileSync, writeFileSync, cpSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const dest = resolve(process.argv[2] || '.work/upstream');
const repo = resolve(import.meta.dirname, '..');

function copyTree(src, out) {
  mkdirSync(dirname(out), { recursive: true });
  cpSync(src, out, { recursive: true, force: true });
}
copyTree(resolve(repo, 'overlay', 'src', 'taiwan'), resolve(dest, 'src', 'taiwan'));
copyTree(resolve(repo, 'overlay', 'src-tauri'), resolve(dest, 'src-tauri'));
copyTree(resolve(repo, 'branding'), resolve(dest, 'branding'));

// index: language, title, Taiwan CSS, desktop favicon.
const indexPath = resolve(dest, 'index.html');
let html = readFileSync(indexPath, 'utf8');
html = html.replace('<html lang="en">', '<html lang="zh-Hant-TW">')
  .replace('<title>God\'s Eye View</title>', '<title>上帝之眼・台灣版</title>')
  .replace('<link rel="icon" type="image/svg+xml" href="/logo.svg" />', '<link rel="icon" type="image/png" href="/branding/icon-master.png" />')
  .replace('<link rel="stylesheet" href="/style.css" />', '<link rel="stylesheet" href="/style.css" />\n  <link rel="stylesheet" href="/src/taiwan/taiwan.css" />');
html = html.replace(/icon_names=([^\"&]+)/, (match, names) => {
  const all = new Set(names.split(','));
  for (const icon of ['auto_awesome','edit_note','folder_open','inventory_2','layers','query_stats','tune']) all.add(icon);
  return `icon_names=${[...all].sort().join(',')}`;
});
writeFileSync(indexPath, html);

const mainPath = resolve(dest, 'src', 'main.js');
let main = readFileSync(mainPath, 'utf8');
main = main.replace(
  "import { describeError } from './standalone/errors.js';",
  "import { describeError } from './standalone/errors.js';\nimport { installTaiwanEdition } from './taiwan/index.js';\nimport { readRuntimeConfig } from './taiwan/runtimeConfig.js';\n\nconst runtimeConfig = await readRuntimeConfig();"
);
main = main.replace(
  'googleApiKey: import.meta.env.GOOGLE_MAPS_API_KEY,\n  cesiumToken: import.meta.env.CESIUM_ION_TOKEN,',
  'googleApiKey: runtimeConfig.googleMapsApiKey || import.meta.env.GOOGLE_MAPS_API_KEY,\n  cesiumToken: runtimeConfig.cesiumIonToken || import.meta.env.CESIUM_ION_TOKEN,'
);
main = main.replace(
  'application.start().catch((error) => {',
  'application.start().then((components) => installTaiwanEdition({ application, components })).catch((error) => {'
);
main = main.replace("God's Eye View initialization failed:", '上帝之眼・台灣版初始化失敗：');
writeFileSync(mainPath, main);

const pkgPath = resolve(dest, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const additions = JSON.parse(readFileSync(resolve(repo, 'overlay', 'package.additions.json'), 'utf8'));
pkg.dependencies = { ...(pkg.dependencies || {}), ...(additions.dependencies || {}) };
pkg.devDependencies = { ...(pkg.devDependencies || {}), ...(additions.devDependencies || {}) };
pkg.scripts = { ...(pkg.scripts || {}), ...(additions.scripts || {}) };
pkg.name = 'gods-eye-taiwan-desktop';
pkg.version = '0.1.0';
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

copyTree(resolve(repo, 'THIRD_PARTY_NOTICES.md'), resolve(dest, 'TAIWAN_THIRD_PARTY_NOTICES.md'));
console.log('Taiwan overlay applied.');
