import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const dest = resolve(process.argv[2] || '.work/upstream');
const repo = resolve(import.meta.dirname, '..');

// Check before any copy or patch: this installer is intentionally one-shot.
const sourcePackage = JSON.parse(readFileSync(resolve(dest, 'package.json'), 'utf8'));
if (sourcePackage.name === 'gods-eye-taiwan-desktop' || sourcePackage.taiwanEdition) {
  throw new Error('工作區已套用台灣版；請勿重複套用 Overlay。首次安裝請使用全新工作區。');
}
const upstreamLock = Object.fromEntries(readFileSync(resolve(repo, 'UPSTREAM.lock'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map(line => line.split(/=(.*)/s).slice(0, 2)));
const sourceCommit = execFileSync('git', ['-C', dest, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (sourceCommit !== upstreamLock.commit) throw new Error('工作區不是 UPSTREAM.lock 指定版本，停止套用。');

function copyTree(src, out) {
  const stat = lstatSync(src);
  if (stat.isSymbolicLink()) {
    throw new Error(`Unexpected symbolic link in Taiwan overlay: ${src}`);
  }
  if (stat.isDirectory()) {
    mkdirSync(out, { recursive: true });
    for (const entry of readdirSync(src)) copyTree(resolve(src, entry), resolve(out, entry));
    return;
  }
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(src, out);
}
function replaceRequired(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Overlay patch target not found: ${label}`);
  return text.replace(from, to);
}

copyTree(resolve(repo, 'overlay', 'public'), resolve(dest, 'public'));
copyTree(resolve(repo, 'overlay', 'src', 'taiwan'), resolve(dest, 'src', 'taiwan'));
copyTree(resolve(repo, 'overlay', 'src', 'maps'), resolve(dest, 'src', 'maps'));
copyTree(resolve(repo, 'overlay', 'server'), resolve(dest, 'server'));
for (const name of ['title-art-user-v4.png', 'icon-user-v4.png', 'icon-master.png', 'toolbar-bezel-v6.png', 'toolbar-toggle-v4.png', 'toolbar-collapse-user.png', 'toolbar-expand-user.png', 'voice-control-panel-transparent-v4.png', 'quick-menu-logo-user.png', 'sidebar-user.png', 'toolbar-sheet-v9.png', 'toolbar-record-sheet-v10.png']) {
  copyTree(resolve(repo, 'branding', name), resolve(dest, 'public', 'branding', name));
}
copyTree(resolve(repo, 'branding', 'ui-icons'), resolve(dest, 'public', 'branding', 'ui-icons'));
copyTree(resolve(repo, 'branding', 'fonts'), resolve(dest, 'public', 'branding', 'fonts'));

// Vite preview serves the built browser UI. Provider routes must be available
// there as well as in the development server.
const previewConfigPath = resolve(dest, 'server', 'standalone', 'vite.config.js');
let previewConfig = readFileSync(previewConfigPath, 'utf8');
previewConfig = replaceRequired(previewConfig,
  'plugins: [...localProviderPlugins(), apiNotFoundPlugin()],',
  'plugins: [...localProviderPlugins(), apiNotFoundPlugin()].map(plugin => ({ ...plugin, configurePreviewServer: plugin.configureServer })),',
  'browser preview provider middleware');
writeFileSync(previewConfigPath, previewConfig);

const cctvCatalogPath = resolve(dest, 'server', 'providers', 'cctv', 'catalog.js');
const localProvidersPath = resolve(dest, 'server', 'providers', 'local.js');
let localProviders = readFileSync(localProvidersPath, 'utf8');
localProviders = replaceRequired(localProviders,
  "import { openSkyProxy } from './aircraft/opensky.js';",
  "import { openSkyProxy } from './aircraft/opensky.js';\nimport { taiwanResourcesProxy } from './taiwanResources.js';\nimport { taiwanAiProxy } from './taiwanAi.js';\nimport { taiwanNlscProxy } from './taiwanNlsc.js';\nimport { taiwanDtmProxy } from './taiwanDtm.js';\nimport { taiwanCctvWallProxy } from './taiwanCctvWall.js';",
  'Taiwan local resource import');
localProviders = replaceRequired(localProviders,
  '    openSkyProxy(),',
  '    taiwanResourcesProxy(),\n    taiwanAiProxy(),\n    taiwanNlscProxy(),\n    taiwanDtmProxy(),\n    taiwanCctvWallProxy(),\n    openSkyProxy(),',
  'Taiwan local resource endpoint');
writeFileSync(localProvidersPath, localProviders);
let cctvCatalog = readFileSync(cctvCatalogPath, 'utf8');
cctvCatalog = replaceRequired(cctvCatalog,
  "import fs from 'node:fs';",
  "import fs from 'node:fs';\nimport { loadTaiwanFreewaySources } from './taiwan.js';",
  'Taiwan CCTV catalog import');
cctvCatalog = replaceRequired(cctvCatalog,
  "const LIVE_PACKS = [",
  "const LIVE_PACKS = [\n  { name: 'taiwan-freeway', enabled: () => true, load: loadTaiwanFreewaySources },",
  'Taiwan CCTV live pack');
writeFileSync(cctvCatalogPath, cctvCatalog);
const cctvConstantsPath = resolve(dest, 'server', 'providers', 'cctv', 'constants.js');
let cctvConstants = readFileSync(cctvConstantsPath, 'utf8');
cctvConstants = replaceRequired(cctvConstants,
  'export const DEFAULT_CCTV_MAX_SOURCES = 4000;',
  'export const DEFAULT_CCTV_MAX_SOURCES = 5000;',
  'Taiwan CCTV catalog capacity');
writeFileSync(cctvConstantsPath, cctvConstants);
const cctvPolicyPathTaiwan = resolve(dest, 'src', 'layers', 'cctv', 'policy.js');
let cctvPolicyTaiwan = readFileSync(cctvPolicyPathTaiwan, 'utf8');
cctvPolicyTaiwan = replaceRequired(cctvPolicyTaiwan,
  'export const IDLE_FRAME_REFRESH_MS = 60000;',
  'export const IDLE_FRAME_REFRESH_MS = 15000;',
  'visible CCTV card refresh');
writeFileSync(cctvPolicyPathTaiwan, cctvPolicyTaiwan);

// The original CCTV detail panel uses an <img>. Keep snapshots for ambient
// cards, but let the selected Taiwan MJPEG camera stream continuously there.
const cctvPresentationPath = resolve(dest, 'src', 'ui', 'cctvPresentation.js');
let cctvPresentation = readFileSync(cctvPresentationPath, 'utf8');
cctvPresentation = replaceRequired(cctvPresentation,
  'const nextSrc = enabled ? activeCamera?.frameUrl : null;',
  "const liveMjpeg = enabled && activeCamera?.feedType === 'mjpeg' && !document.hidden && !this._cctvPanel?.classList.contains('collapsed');\n    const nextSrc = liveMjpeg ? activeCamera.mediaUrl?.split('?')[0] : enabled ? activeCamera?.frameUrl : null;",
  'active Taiwan CCTV MJPEG in original panel');
writeFileSync(cctvPresentationPath, cctvPresentation);
const cctvFramesPath = resolve(dest, 'src', 'ui', 'cctvFrames.js');
let cctvFrames = readFileSync(cctvFramesPath, 'utf8');
cctvFrames = replaceRequired(cctvFrames,
  "    this._cctvFrame.classList.remove('active');\n    this._cctvFrame.removeAttribute('src');",
  "    this._cctvFrame.onload = null;\n    this._cctvFrame.onerror = null;\n    this._cctvFrame.classList.remove('active');\n    this._cctvFrame.removeAttribute('src');",
  'CCTV stream handler cleanup');
cctvFrames = replaceRequired(cctvFrames,
  '  const preloader = new Image();',
  `  if (src.startsWith('/api/cctv/media/')) {
    this._cctvFrame.onload = () => this._settleMjpegFrame(token, true);
    this._cctvFrame.onerror = () => this._settleMjpegFrame(token, false);
    this._cctvFrame.src = src;
    return;
  }

  const preloader = new Image();`,
  'direct MJPEG image playback');
cctvFrames = replaceRequired(cctvFrames,
  'export function _settleCctvFrame(token, src, ok) {',
  `export function _settleMjpegFrame(token, ok) {
  if (this.destroyed || !this._cctvFrame || token !== this._cctvFrameRequestToken) return;
  this._cctvFrame.dataset.loading = '';
  this._cctvFrame.dataset.error = ok ? '' : 'true';
  this._cctvFrameWrap?.classList.toggle('loading', false);
  this._cctvFrameWrap?.classList.toggle('has-frame', ok);
  this._cctvFrame.classList.toggle('active', ok);
  this._syncCctvSourceBadge(this._cctvState?.activeCamera, !!this._cctvState?.enabled && !!this.actions.isEnabled());
}

export function _settleCctvFrame(token, src, ok) {`,
  'MJPEG connection status');
writeFileSync(cctvFramesPath, cctvFrames);
const cctvControlsPath = resolve(dest, 'src', 'ui', 'cctvControls.js');
let cctvControls = readFileSync(cctvControlsPath, 'utf8');
cctvControls = replaceRequired(cctvControls,
  '  _settleCctvFrame,',
  '  _settleCctvFrame,\n  _settleMjpegFrame,',
  'MJPEG frame state import');
cctvControls = replaceRequired(cctvControls,
  '  _settleCctvFrame(...args) {\n    return _settleCctvFrame.call(this, ...args);\n  }',
  '  _settleCctvFrame(...args) {\n    return _settleCctvFrame.call(this, ...args);\n  }\n  _settleMjpegFrame(...args) {\n    return _settleMjpegFrame.call(this, ...args);\n  }',
  'MJPEG frame state method');
writeFileSync(cctvControlsPath, cctvControls);

// index: language, title, Taiwan CSS, browser favicon.
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

// First-run onboarding follows the Taiwan edition's Traditional Chinese UI.
const welcomePath = resolve(dest, 'src', 'ui', 'templates', 'welcome.html');
let welcome = readFileSync(welcomePath, 'utf8');
for (const [from, to] of [
  ['MISSION CONTROL · FIRST LAUNCH', '任務中心 · 首次啟動'],
  ['Choose your first view', '選擇你的第一個視角'],
  ['It feels like a forbidden cockpit—then you realize the sources are public and the data is real.', '這裡像是機密駕駛艙；但你會發現，資料來源公開，資訊也都是真實資料。'],
  ['LIVE CONTACTS', '即時動態'],
  ['Aircraft, vessels and nearby intelligence', '查看飛機、船舶與周邊資訊'],
  ['SPACE MISSIONS', '太空任務'],
  ['Launches, spacecraft and orbital context', '火箭發射、太空船與軌道資訊'],
  ['ENVIRONMENTAL', '環境資訊'],
  ['Live earthquakes and active fires, from USGS and NASA', '美國地質調查局與 NASA 的地震、野火資訊'],
  ['EXPLORE MANUALLY', '自行探索'],
  ['Begin with a clean globe', '從乾淨的地球視圖開始'],
  ["Don't show this again", '下次不再顯示'],
  ['ESC to dismiss', '按 Esc 關閉'],
  ['Tip: the GEV MIC button in the dock lets you talk to the map.', '提示：按下底部的語音按鈕，即可用口語操作地圖。'],
]) welcome = welcome.replaceAll(from, to);
writeFileSync(welcomePath, welcome);

// Taiwan edition boot hook.
const mainPath = resolve(dest, 'src', 'main.js');
let main = readFileSync(mainPath, 'utf8');
main = replaceRequired(
  main,
  "import { describeError } from './standalone/errors.js';",
  "import { describeError } from './standalone/errors.js';\nimport { installTaiwanEdition } from './taiwan/index.js';\nimport { readRuntimeConfig } from './taiwan/runtimeConfig.js';\n\nlet application;\nasync function initializeTaiwanApplication() {\n  const runtimeConfig = await readRuntimeConfig();",
  'main import'
);
main = replaceRequired(
  main,
  'const application = createStandaloneApplication({',
  'application = createStandaloneApplication({',
  'deferred app creation'
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
  'return application.start().then((components) => installTaiwanEdition({ application, components })).catch((error) => {',
  'Taiwan edition startup'
);
main = replaceRequired(
  main,
  'export { application };',
  '}\nexport const applicationReady = initializeTaiwanApplication();\nexport { application };',
  'deferred app startup'
);
main = main.replace("God's Eye View initialization failed:", '上帝之眼・台灣版初始化失敗：');
writeFileSync(mainPath, main);

// A fresh Taiwan session starts with every live feed off. Skip upstream's
// persisted/share layer restoration before it can trigger CCTV network work.
const restorationPath = resolve(dest, 'src', 'ui', 'shareRestoration.js');
let restoration = readFileSync(restorationPath, 'utf8');
restoration = replaceRequired(restoration,
  'shareLayerState: this._initialShareState?.layerState || null,',
  'shareLayerState: null,',
  'disable automatic Taiwan share-layer loading');
restoration = replaceRequired(restoration,
  'allowLocalState: !this._initialShareState,',
  'allowLocalState: false,',
  'disable automatic Taiwan local layer loading');
writeFileSync(restorationPath, restoration);

// Audit profile: substantially fresher OSM analysis data than the upstream
// visualization-oriented cache policy. Serve-stale still protects outages.
const overpassConstantsPath = resolve(dest, 'server', 'providers', 'overpass', 'constants.js');
let constants = readFileSync(overpassConstantsPath, 'utf8');
constants = replaceRequired(constants,
  "const OVERPASS_UPSTREAMS = [\n  'https://overpass-api.de/api/interpreter',",
  "const OVERPASS_UPSTREAMS = [\n  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',\n  'https://overpass-api.de/api/interpreter',",
  'Taiwan OSM reachable Overpass mirror');
constants = replaceRequired(constants, 'const OVERPASS_CACHE_MS = 86_400_000;', 'const OVERPASS_CACHE_MS = 15 * 60 * 1000;', 'OSM memory TTL');
constants = replaceRequired(constants, 'const OVERPASS_DISK_TTL_MS = 7 * 86_400_000;', 'const OVERPASS_DISK_TTL_MS = 60 * 60 * 1000;', 'OSM disk TTL');
constants = replaceRequired(constants, 'const OVERPASS_BOUNDARY_DISK_TTL_MS = 30 * 86_400_000;', 'const OVERPASS_BOUNDARY_DISK_TTL_MS = 24 * 60 * 60 * 1000;', 'OSM boundary TTL');
constants = replaceRequired(constants, 'const OVERPASS_TIMEOUT_MS = 22000;', 'const OVERPASS_TIMEOUT_MS = 45000;', 'OSM public-mirror timeout');
writeFileSync(overpassConstantsPath, constants);

// This provider is now maintained in overlay/server, including fresh queries
// and cancellation. Verify its contract instead of patching it a second time.
const overpass = readFileSync(resolve(dest, 'server', 'providers', 'overpass.js'), 'utf8');
if (!overpass.includes("req.headers['x-gev-force-refresh']") || !/forceFresh\s*\?\s*Promise\.resolve\(null\)/.test(overpass)) {
  throw new Error('Taiwan Overpass provider is missing the explicit freshness contract.');
}

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
for (const group of [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies]) {
  for (const name of Object.keys(group || {})) if (name.startsWith('@tauri-apps/')) delete group[name];
}
for (const [name, command] of Object.entries(pkg.scripts)) {
  if (name.startsWith('tauri:') || /\b(?:tauri|cargo|rustc)\b/.test(command)) delete pkg.scripts[name];
}
pkg.taiwanEdition = { runtime: 'browser', upstreamCommit: sourceCommit };
pkg.name = 'gods-eye-taiwan-desktop';
pkg.version = '0.2.0';
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

copyTree(resolve(repo, 'THIRD_PARTY_NOTICES.md'), resolve(dest, 'TAIWAN_THIRD_PARTY_NOTICES.md'));
console.log('Taiwan overlay applied: OSM audit freshness + CCTV guard + Gemini Live.');

// Browser edition data-scope adapters and copy-safe keyboard bindings.
const shortcutsPath=resolve(dest,'src/ui/applicationShortcuts.js');
let shortcuts=readFileSync(shortcutsPath,'utf8');
shortcuts=replaceRequired(shortcuts,"    if (STYLE_KEYS[event.key])","    if(event.ctrlKey || event.metaKey || event.altKey)return;\n    if (STYLE_KEYS[event.key])",'modifier shortcuts');
shortcuts=replaceRequired(shortcuts,"    if (key === 'c') actions.toggleCctv();\n",'', 'remove CCTV shortcut');
writeFileSync(shortcutsPath,shortcuts);
const flightScopePath=resolve(dest,'src/layers/flights/ingestion.js');
let flightScope=readFileSync(flightScopePath,'utf8');
flightScope="import { filterAircraftSnapshot } from '../../taiwan/dataScope.js';\n"+flightScope;
flightScope=replaceRequired(flightScope,'const snapshot = await feed._source.getSnapshot(getQuery(viewer), {','const rawSnapshot = await feed._source.getSnapshot(getQuery(viewer), {','flight source');
flightScope=replaceRequired(flightScope,'        feed._lastStatus = snapshot.status','        const snapshot=filterAircraftSnapshot(rawSnapshot);\n        feed._lastStatus = snapshot.status','flight scope');
writeFileSync(flightScopePath,flightScope);
const cameraScopePath=resolve(dest,'src/layers/cctv/catalog.js');
let cameraScope=readFileSync(cameraScopePath,'utf8');
cameraScope="import { withinScope } from '../../taiwan/dataScope.js';\n"+cameraScope;
cameraScope=replaceRequired(cameraScope,'      return data.sources;','      return data.sources.filter(camera=>withinScope(Number(camera.lon),Number(camera.lat)));','CCTV scope');
cameraScope=replaceRequired(cameraScope,'    return catalog;','    return catalog.filter(camera=>withinScope(camera.lon,camera.lat));','CCTV seed scope');
writeFileSync(cameraScopePath,cameraScope);

// Additional configured geographic feeds share the same explicit scope.
{const target=resolve(dest,"src/layers/vessels/ingestion.js");let code=readFileSync(target,'utf8');code="import { withinMarineScope } from '../../taiwan/dataScope.js';\n"+code;code=replaceRequired(code,"rows: snapshot.records.map(vesselDisplayRow),","rows: snapshot.records.map(vesselDisplayRow).filter(row=>withinMarineScope(row.lon,row.lat)),",'geographic feed scope');writeFileSync(target,code);}
{const target=resolve(dest,"src/layers/firms/ingestion.js");let code=readFileSync(target,'utf8');code="import { withinScope } from '../../taiwan/dataScope.js';\n"+code;code=replaceRequired(code,"layerState._fires = adaptFirmsRecords(payload?.fires);","layerState._fires = adaptFirmsRecords(payload?.fires).filter(fire=>withinScope(fire.lon,fire.lat)).map((fire,index)=>({...fire,index}));",'geographic feed scope');writeFileSync(target,code);}
{const target=resolve(dest,"src/layers/earthquakes/source.js");let code=readFileSync(target,'utf8');code="import { withinMarineScope } from '../../taiwan/dataScope.js';\n"+code;code=replaceRequired(code,"      return rows;","      return rows.filter(row=>withinMarineScope(row.lon,row.lat));",'geographic feed scope');writeFileSync(target,code);}

// Declare the Overlay additions owned by existing export groups. Keep the
// upstream ownership checker strict; only explicit Overlay dependencies are added.
const boundariesPath = resolve(dest, 'scripts', 'package-boundaries.json');
const boundaries = JSON.parse(readFileSync(boundariesPath, 'utf8'));
for (const group of Object.values(boundaries)) {
  if (group.modules.includes('src/maps/defaultSources.js') && !group.modules.includes('src/maps/nlscImagery.js')) group.modules.push('src/maps/nlscImagery.js');
  const usesScope = group.modules.some(name => readFileSync(resolve(dest, name), 'utf8').includes("from '../../taiwan/dataScope.js'"));
  if (usesScope) {
    if (!group.modules.includes('src/taiwan/dataScope.js')) group.modules.push('src/taiwan/dataScope.js');
    if (!group.external.includes('@turf/turf')) group.external.push('@turf/turf');
  }
}
if (!boundaries['cctv-provider'].modules.includes('server/providers/cctv/taiwan.js')) {
  boundaries['cctv-provider'].modules.push('server/providers/cctv/taiwan.js');
}
writeFileSync(boundariesPath, JSON.stringify(boundaries, null, 2) + '\n');
