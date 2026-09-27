import { readFileSync, writeFileSync, cpSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const dest = resolve(process.argv[2] || '.work/upstream');
const repo = resolve(import.meta.dirname, '..');

function copyTree(src, out) {
  mkdirSync(dirname(out), { recursive: true });
  cpSync(src, out, { recursive: true, force: true });
}
function replaceRequired(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Overlay patch target not found: ${label}`);
  return text.replace(from, to);
}

copyTree(resolve(repo, 'overlay', 'src', 'taiwan'), resolve(dest, 'src', 'taiwan'));
copyTree(resolve(repo, 'overlay', 'src-tauri'), resolve(dest, 'src-tauri'));
copyTree(resolve(repo, 'branding'), resolve(dest, 'branding'));

// index: language, title, Taiwan CSS, desktop favicon.
const indexPath = resolve(dest, 'index.html');
let html = readFileSync(indexPath, 'utf8');
html = html.replace('<html lang="en">', '<html lang="zh-Hant-TW">')
  .replace("<title>God's Eye View</title>", '<title>上帝之眼・台灣版</title>')
  .replace('<link rel="icon" type="image/svg+xml" href="/logo.svg" />', '<link rel="icon" type="image/png" href="/branding/icon-master.png" />')
  .replace('<link rel="stylesheet" href="/style.css" />', '<link rel="stylesheet" href="/style.css" />\n  <link rel="stylesheet" href="/src/taiwan/taiwan.css" />');
html = html.replace(/icon_names=([^\"&]+)/, (match, names) => {
  const all = new Set(names.split(','));
  for (const icon of ['auto_awesome','edit_note','folder_open','inventory_2','layers','query_stats','tune','videocam','refresh']) all.add(icon);
  return `icon_names=${[...all].sort().join(',')}`;
});
writeFileSync(indexPath, html);

// Taiwan edition boot hook.
const mainPath = resolve(dest, 'src', 'main.js');
let main = readFileSync(mainPath, 'utf8');
main = replaceRequired(
  main,
  "import { describeError } from './standalone/errors.js';",
  "import { describeError } from './standalone/errors.js';\nimport { installTaiwanEdition } from './taiwan/index.js';\nimport { readRuntimeConfig } from './taiwan/runtimeConfig.js';\n\nconst runtimeConfig = await readRuntimeConfig();",
  'main import'
);
main = replaceRequired(
  main,
  'googleApiKey: import.meta.env.GOOGLE_MAPS_API_KEY,\n  cesiumToken: import.meta.env.CESIUM_ION_TOKEN,',
  'googleApiKey: runtimeConfig.googleMapsApiKey || import.meta.env.GOOGLE_MAPS_API_KEY,\n  cesiumToken: runtimeConfig.cesiumIonToken || import.meta.env.CESIUM_ION_TOKEN,',
  'runtime provider keys'
);
main = replaceRequired(
  main,
  'application.start().catch((error) => {',
  'application.start().then((components) => installTaiwanEdition({ application, components })).catch((error) => {',
  'Taiwan edition startup'
);
main = main.replace("God's Eye View initialization failed:", '上帝之眼・台灣版初始化失敗：');
writeFileSync(mainPath, main);

// Audit profile: substantially fresher OSM analysis data than the upstream
// visualization-oriented cache policy. Serve-stale still protects outages.
const overpassConstantsPath = resolve(dest, 'server', 'providers', 'overpass', 'constants.js');
let constants = readFileSync(overpassConstantsPath, 'utf8');
constants = replaceRequired(constants, 'const OVERPASS_CACHE_MS = 86_400_000;', 'const OVERPASS_CACHE_MS = 15 * 60 * 1000;', 'OSM memory TTL');
constants = replaceRequired(constants, 'const OVERPASS_DISK_TTL_MS = 7 * 86_400_000;', 'const OVERPASS_DISK_TTL_MS = 60 * 60 * 1000;', 'OSM disk TTL');
constants = replaceRequired(constants, 'const OVERPASS_BOUNDARY_DISK_TTL_MS = 30 * 86_400_000;', 'const OVERPASS_BOUNDARY_DISK_TTL_MS = 24 * 60 * 60 * 1000;', 'OSM boundary TTL');
writeFileSync(overpassConstantsPath, constants);

// Explicit audit freshness checks can bypass normal caches while retaining query
// validation, rate limiting and multi-mirror fallback.
const overpassPath = resolve(dest, 'server', 'providers', 'overpass.js');
let overpass = readFileSync(overpassPath, 'utf8');
overpass = replaceRequired(
  overpass,
  "cacheKey = safeBody.replace(/\\s+/g, ' ').trim();\n        const preflight = await resolveOverpassPreflight({",
  "cacheKey = safeBody.replace(/\\s+/g, ' ').trim();\n        const forceFresh = String(req.headers['x-gev-force-refresh'] || '') === '1';\n        if (forceFresh) _overpassCache.delete(cacheKey);\n        const preflight = await resolveOverpassPreflight({",
  'OSM force refresh flag'
);
overpass = replaceRequired(
  overpass,
  "readDisk: () =>\n            readOverpassDisk(cacheKey, overpassDiskTtlMs(cacheKey)),",
  "readDisk: () =>\n            forceFresh\n              ? Promise.resolve(null)\n              : readOverpassDisk(cacheKey, overpassDiskTtlMs(cacheKey)),",
  'OSM force refresh disk bypass'
);
writeFileSync(overpassPath, overpass);

// CCTV request-time freshness contract: active stills refresh every 10 seconds,
// and upstream /api/cctv/frame responses are no-store. Fail loudly if upstream
// changes this contract before Taiwan UI assumptions are reviewed.
const cctvPolicyPath = resolve(dest, 'src', 'layers', 'cctv', 'sourcePolicy.js');
const cctvPolicy = readFileSync(cctvPolicyPath, 'utf8');
if (!cctvPolicy.includes('export const ACTIVE_FRAME_REFRESH_MS = 10000;')) {
  throw new Error('Upstream CCTV refresh contract changed; review Taiwan freshness UI before building.');
}

const pkgPath = resolve(dest, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const additions = JSON.parse(readFileSync(resolve(repo, 'overlay', 'package.additions.json'), 'utf8'));
pkg.dependencies = { ...(pkg.dependencies || {}), ...(additions.dependencies || {}) };
pkg.devDependencies = { ...(pkg.devDependencies || {}), ...(additions.devDependencies || {}) };
pkg.scripts = { ...(pkg.scripts || {}), ...(additions.scripts || {}) };
pkg.name = 'gods-eye-taiwan-desktop';
pkg.version = '0.2.0';
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

copyTree(resolve(repo, 'THIRD_PARTY_NOTICES.md'), resolve(dest, 'TAIWAN_THIRD_PARTY_NOTICES.md'));
console.log('Taiwan overlay applied: OSM audit freshness + CCTV guard + Gemini Live.');
