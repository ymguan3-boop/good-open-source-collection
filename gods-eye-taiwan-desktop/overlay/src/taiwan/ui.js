import * as Cesium from 'cesium';
import { invoke } from '@tauri-apps/api/core';
import { importFile } from './dataImport.js';
import { listLayers, getLayer } from './layerRegistry.js';
import { runBuffer, summarize } from './analysis.js';
import { exportProject, importProject, saveProject } from './projectManager.js';
import { suggestTopics, planAnalysis } from './ai.js';
import { PROFILES } from './resourceGovernor.js';
import { checkCctvFreshness, checkOsmFreshness } from './liveDataHealth.js';
import { createGeminiLiveController } from './geminiLive.js';

export function mountShell({ viewer, governor }) {
  const root = document.createElement('div');
  root.id = 'tw-shell';
  root.innerHTML = `
    <header class="tw-topbar">
      <div class="tw-brand"><img src="/branding/icon-master.png" alt=""><div><strong>上帝之眼・台灣版</strong><span>AI 空間審計工作台 · 修改者：官毅明</span></div></div>
      <div class="tw-top-actions">
        <button data-act="global" title="全球視角 G">全球</button>
        <button data-act="taiwan" title="台灣視角 T">台灣</button>
        <button data-act="save">儲存</button>
        <button data-act="settings">設定</button>
      </div>
    </header>
    <nav class="tw-nav" aria-label="主功能">
      ${nav('project','folder_open','專案')}
      ${nav('layers','layers','圖資')}
      ${nav('analysis','query_stats','分析')}
      ${nav('ai','auto_awesome','AI')}
      ${nav('notes','edit_note','標註')}
      ${nav('results','inventory_2','成果')}
      <span class="tw-spacer"></span>
      ${nav('legacy','tune','原版工具')}
    </nav>
    <aside class="tw-drawer" hidden>
      <div class="tw-drawer-head"><h2></h2><button data-act="close-drawer">×</button></div>
      <div class="tw-drawer-body"></div>
    </aside>
    <section class="tw-resources" data-act="resources" title="系統資源與效能控管">
      <div><span>RAM</span><b data-r="ram">--</b></div>
      <div><span>Swap</span><b data-r="swap">--</b></div>
      <div><span>GPU</span><b data-r="gpu">--</b></div>
      <div><span>VRAM</span><b data-r="vram">--</b></div>
      <i data-r="pressure"></i>
    </section>
    <button class="tw-ai-fab" data-act="ai" title="AI 空間助理">✦</button>
    <input type="file" id="tw-file-input" hidden accept=".geojson,.json,.zip,.kml,.kmz,.czml" />
    <input type="file" id="tw-project-input" hidden accept=".gevproj,.zip" />`;
  document.body.appendChild(root);

  const drawer = root.querySelector('.tw-drawer');
  const body = root.querySelector('.tw-drawer-body');
  const title = root.querySelector('.tw-drawer h2');
  const open = (name, html) => { title.textContent = name; body.innerHTML = html; drawer.hidden = false; };
  const close = () => { drawer.hidden = true; };
  const toast = (msg) => {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
  };

  const geminiLive = createGeminiLiveController({
    viewer,
    onStatus: (message) => {
      const el = root.querySelector('#tw-gemini-status');
      if (el) el.textContent = message;
      const btn = root.querySelector('[data-act="gemini-live-toggle"]');
      if (btn) {
        btn.textContent = geminiLive.active ? '● 停止 Gemini Live' : '◉ 開始 Gemini Live';
        btn.classList.toggle('on', geminiLive.active);
      }
    },
    onTranscript: ({ role, text }) => {
      const el = root.querySelector('#tw-gemini-transcript');
      if (!el) return;
      const row = document.createElement('div');
      row.className = 'tw-card';
      row.innerHTML = `<small>${role === 'user' ? '你' : 'Gemini'}</small><p>${esc(text)}</p>`;
      el.appendChild(row);
      el.scrollTop = el.scrollHeight;
    },
  });

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const a = btn.dataset.act;
    try {
      if (a === 'close-drawer') return close();
      if (a === 'taiwan') return flyTaiwan(viewer);
      if (a === 'global') return flyGlobal(viewer);
      if (a === 'layers') return renderLayers();
      if (a === 'analysis') return renderAnalysis();
      if (a === 'project') return renderProject();
      if (a === 'settings') return renderSettings();
      if (a === 'resources') return renderResources();
      if (a === 'ai') return renderAI();
      if (a === 'notes') return open('標註', '<p class="tw-note">既有標註功能保留於原版工具；後續會整理成台灣版查核註記工作流。</p>');
      if (a === 'results') return open('成果', '<p class="tw-note">AI 與人工分析結果會集中於此；目前可由專案匯出 .gevproj。</p>');
      if (a === 'legacy') { document.body.classList.toggle('gev-tw-legacy-open'); return; }
      if (a === 'save') { await saveProject({ viewer, layers:listLayers() }); toast('已儲存本機專案狀態'); return; }
      if (a === 'import-data') { root.querySelector('#tw-file-input').click(); return; }
      if (a === 'export-project') return doExport();
      if (a === 'import-project') { root.querySelector('#tw-project-input').click(); return; }
      if (a === 'apply-profile') { governor.apply(btn.dataset.profile); renderSettings(); return; }
      if (a === 'apply-custom') return applyCustom();
      if (a === 'buffer') return doBuffer(btn.dataset.layer);
      if (a === 'suggest-ai') return doSuggestAI();
      if (a === 'save-keys') return saveKeys();
      if (a === 'reload') return location.reload();
      if (a === 'gemini-live-toggle') return geminiLive.toggle();
      if (a === 'cctv-check') return doCctvCheck();
      if (a === 'osm-check') return doOsmCheck();
      if (a === 'open-cctv') return openLegacyCctv();
    } catch (err) {
      console.error(err);
      toast(err?.message || String(err));
      const status = root.querySelector('#tw-live-health');
      if (status) status.innerHTML = `<div class="tw-card"><b>檢查失敗</b><p>${esc(err?.message || String(err))}</p></div>`;
    }
  });

  root.querySelector('#tw-file-input').addEventListener('change', async e => {
    for (const f of e.target.files) await importFile(f, viewer);
    e.target.value = '';
    renderLayers();
  });
  root.querySelector('#tw-project-input').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    const p = await importProject(f);
    for (const l of p.layers) {
      const blob = new File([JSON.stringify(l.geojson)], l.path.split('/').pop(), { type:'application/geo+json' });
      await importFile(blob, viewer);
    }
    toast(`已載入 ${p.layers.length} 個成果圖層`);
  });

  window.addEventListener('gev-tw:layers-changed', () => {
    if (!drawer.hidden && title.textContent === '圖資') renderLayers();
  });
  window.addEventListener('keydown', e => {
    if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
    if (e.key.toLowerCase() === 't') flyTaiwan(viewer);
    if (e.key.toLowerCase() === 'g') flyGlobal(viewer);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveProject({ viewer, layers:listLayers() });
    }
  });

  governor.subscribe(updateResources);
  governor.start();
  document.body.classList.add('gev-tw-minimal');

  function renderResources() {
    const r = governor.lastSnapshot || {};
    open('系統資源', `<div class="tw-resource-grid">
      ${metric('系統 RAM',bytes(r.systemMemoryUsed),bytes(r.systemMemoryTotal))}
      ${metric('虛擬記憶體 / Swap',bytes(r.swapUsed),bytes(r.swapTotal))}
      ${metric('本程式 RAM',bytes(r.processMemory),'RSS')}
      ${metric('本程式虛擬記憶體',bytes(r.processVirtualMemory),'Virtual')}
      ${metric('GPU',esc(r.gpuName||'未偵測'),'')}
      ${metric('VRAM',bytes(r.gpuUsed),bytes(r.gpuTotal))}
      ${metric('本程式 GPU',bytes(r.processGpuUsed),r.gpuProcessIsExact?'Per-process':'估算/Device-wide')}
      </div>
      <h3>快速配置</h3>
      <div class="tw-profile-grid">${Object.entries(PROFILES).map(([k,v]) => `<button data-act="apply-profile" data-profile="${k}"><b>${v.label}</b><small>${v.fps} FPS</small></button>`).join('')}</div>
      <p class="tw-note">資源保護：${r.pressured?'目前正在降載':'正常'}。設定頁可調自訂 FPS、解析度與 3D Tiles 快取。</p>`);
  }

  function applyCustom() {
    const custom = {
      fps:num('#tw-c-fps',45),
      scale:num('#tw-c-scale',1),
      cacheMB:num('#tw-c-cache',512),
      sse:num('#tw-c-sse',18),
      overflowMB:128,
    };
    governor.apply('custom', custom);
    renderSettings();
  }

  function renderLayers() {
    const layers = listLayers();
    open('圖資', `
      <div class="tw-actions"><button data-act="import-data">＋ 新增圖資</button></div>
      <h3>即時資料健康</h3>
      <article class="tw-card">
        <b>OpenStreetMap / CCTV</b>
        <p>OSM 審計查詢預設快取已縮短；可強制查詢 OSM 資料時間。CCTV frame 使用 no-store，既有主動畫面每 10 秒重新請求。</p>
        <div class="tw-actions">
          <button data-act="osm-check">檢查 OSM 新鮮度</button>
          <button data-act="cctv-check">抽查 CCTV 最新畫面</button>
        </div>
        <button data-act="open-cctv">開啟 CCTV 面板</button>
        <div id="tw-live-health"></div>
      </article>
      <h3>我的圖資</h3>
      ${layers.length ? layers.map(l => `<article class="tw-card"><b>${esc(l.name)}</b><small>${esc(l.kind)}</small><div><button data-act="buffer" data-layer="${l.id}">建立影響範圍</button></div></article>`).join('') : '<p class="tw-empty">尚未載入自訂圖資。</p>'}`);
  }

  function renderAnalysis() {
    const layers = listLayers();
    open('分析', `<p class="tw-lead">選擇圖層後執行空間分析。GIS 計算由 Turf.js 執行，不交給 LLM 猜測。</p>
      ${layers.map(l => `<article class="tw-card"><b>${esc(l.name)}</b><div class="tw-metrics">${fmtSummary(l)}</div><button data-act="buffer" data-layer="${l.id}">500m 影響範圍</button></article>`).join('') || '<p class="tw-empty">先從「圖資」加入資料。</p>'}`);
  }

  function renderProject() {
    open('專案', `<div class="tw-actions stack"><button data-act="save">儲存目前狀態</button><button data-act="export-project">匯出 .gevproj</button><button data-act="import-project">開啟 .gevproj</button></div>
      <p class="tw-note">專案檔可保存自訂成果圖層；後續版本會完整保存所有原版即時圖層狀態。</p>`);
  }

  function renderSettings() {
    const saved = JSON.parse(localStorage.getItem('gev.tw.resourceProfile') || '{"name":"balanced","custom":{}}');
    const current = saved.name;
    const c = saved.custom || {};
    open('設定', `
      <h3>效能與資源</h3>
      <div class="tw-profile-grid">${Object.entries(PROFILES).map(([k,v]) => `<button class="${current===k?'on':''}" data-act="apply-profile" data-profile="${k}"><b>${v.label}</b><small>${v.fps} FPS · ${v.cacheMB} MB tiles</small></button>`).join('')}</div>
      <details class="tw-details" ${current==='custom'?'open':''}>
        <summary>自訂 GPU／記憶體預算</summary>
        <label>目標 FPS <input id="tw-c-fps" type="number" min="20" max="60" value="${c.fps||45}"></label>
        <label>渲染解析度比例 <input id="tw-c-scale" type="number" min="0.5" max="1.5" step="0.05" value="${c.scale||1}"></label>
        <label>3D Tiles 快取 MB <input id="tw-c-cache" type="number" min="128" max="2048" step="64" value="${c.cacheMB||512}"></label>
        <label>LOD 誤差（越大越省 GPU）<input id="tw-c-sse" type="number" min="6" max="40" value="${c.sse||18}"></label>
        <button data-act="apply-custom">套用自訂配置</button>
      </details>
      <p class="tw-note">當 RAM≥88%、Swap≥75% 或 VRAM≥88% 時會自動降載。這裡只限制本程式，不會擅自修改 Windows Pagefile 或 GPU 時脈。</p>
      <h3>服務與 API</h3>
      <label>Cesium ion Token<input id="tw-key-cesium" type="password" autocomplete="off" placeholder="貼上後安全儲存"></label>
      <label>Google Maps API Key<input id="tw-key-google" type="password" autocomplete="off"></label>
      <label>OpenRouter API Key<input id="tw-key-openrouter" type="password" autocomplete="off"></label>
      <label>OpenRouter 預設模型<input id="tw-model" value="${esc(localStorage.getItem('gev.tw.aiModel')||'openai/gpt-5')}"></label>
      <label>Gemini API Key（Google AI Studio）<input id="tw-key-gemini" type="password" autocomplete="off" placeholder="支援 Gemini 3.8 Live Free Tier"></label>
      <div class="tw-card"><b>Gemini Live</b><p>固定使用穩定版 <code>gemini-3.8-live</code>。長效 Gemini Key 只存在 Windows Credential Manager；前端 Live WebSocket 只拿短效 ephemeral token。</p></div>
      <div class="tw-actions"><button data-act="save-keys">儲存設定</button><button data-act="reload">重新啟動介面</button></div>
      <p class="tw-note">Google/Cesium 金鑰因地圖 SDK 需要會送入 WebView，請使用 provider 限制；OpenRouter 與 Gemini 長效金鑰只由 Rust 後端讀取。</p>`);
  }

  function renderAI() {
    open('AI 空間助理', `
      <article class="tw-card">
        <b>Gemini 3.8 Live 即時語音</b>
        <p>可用 Google AI Studio API Key。按一次開始聆聽，再按一次停止；可語音切換台灣／全球、查詢圖層與建立 Buffer。</p>
        <button class="tw-primary" data-act="gemini-live-toggle">${geminiLive.active ? '● 停止 Gemini Live' : '◉ 開始 Gemini Live'}</button>
        <div id="tw-gemini-status" class="tw-note">${geminiLive.active ? 'Gemini Live 已連線' : '尚未啟動'}</div>
        <div id="tw-gemini-transcript"></div>
      </article>
      <article class="tw-card">
        <b>OpenRouter 分析助理</b>
        <p>適合文字型查核主題建議與 GIS 分析規劃。</p>
        <button data-act="suggest-ai">我沒有想法，請 AI 建議</button>
        <div id="tw-ai-output" class="tw-ai-output"></div>
      </article>`);
  }

  async function doBuffer(id) {
    const l = getLayer(id);
    await runBuffer(l, viewer, 500);
    toast('已產生 500m 影響範圍圖層');
    renderLayers();
  }

  async function doExport() {
    const blob = await exportProject({ viewer, layers:listLayers() });
    download(blob, `上帝之眼-${new Date().toISOString().slice(0,10)}.gevproj`);
  }

  async function doSuggestAI() {
    const out = body.querySelector('#tw-ai-output');
    if (!out) return;
    out.textContent = 'AI 正在檢視目前圖資…';
    const model = localStorage.getItem('gev.tw.aiModel') || 'openai/gpt-5';
    const data = await suggestTopics(model);
    out.innerHTML = (data.topics || []).map((t,i) => `<article class="tw-card"><b>${i+1}. ${esc(t.title)}</b><p>${esc(t.purpose||'')}</p><small>資料準備度：${esc(t.readiness||'--')}</small><button class="tw-plan" data-topic="${encodeURIComponent(JSON.stringify(t))}">建立分析計畫</button><div class="tw-plan-output"></div></article>`).join('');
    out.querySelectorAll('.tw-plan').forEach(b => b.addEventListener('click', async () => {
      const target = b.nextElementSibling;
      target.textContent = '規劃中…';
      target.textContent = JSON.stringify(await planAnalysis(JSON.parse(decodeURIComponent(b.dataset.topic)), model), null, 2);
    }));
  }

  async function saveKeys() {
    if (!globalThis.__TAURI_INTERNALS__) throw new Error('金鑰安全儲存只在桌面版可用');
    for (const [id,name] of [
      ['tw-key-cesium','cesium'],
      ['tw-key-google','google'],
      ['tw-key-openrouter','openrouter'],
      ['tw-key-gemini','gemini'],
    ]) {
      const v = body.querySelector('#'+id)?.value.trim();
      if (v) await invoke('save_api_key', { name, value:v });
    }
    const model = body.querySelector('#tw-model')?.value.trim();
    if (model) localStorage.setItem('gev.tw.aiModel', model);
    toast('設定已儲存；地圖金鑰請重新啟動介面後套用');
  }

  async function doOsmCheck() {
    const status = body.querySelector('#tw-live-health');
    if (status) status.innerHTML = '<p class="tw-note">正在向 Overpass 強制取得最新資料時間…</p>';
    const c = viewer.camera.positionCartographic;
    const lat = Cesium.Math.toDegrees(c.latitude);
    const lon = Cesium.Math.toDegrees(c.longitude);
    const result = await checkOsmFreshness({ lat, lon });
    if (status) status.innerHTML = `<div class="tw-card"><b>OSM 資料時間：${esc(result.dataTime || '無法取得')}</b><p>與目前時間約差 ${result.lagMinutes ?? '--'} 分鐘。來源：${esc(result.upstream || 'Overpass')}</p><small>檢查時間 ${new Date(result.checkedAt).toLocaleString()}</small></div>`;
  }

  async function doCctvCheck() {
    const status = body.querySelector('#tw-live-health');
    if (status) status.innerHTML = '<p class="tw-note">正在直接抽查 CCTV frame；不使用瀏覽器快取…</p>';
    const result = await checkCctvFreshness({ sampleSize:3 });
    if (status) status.innerHTML = `<div class="tw-card"><b>${esc(result.message)}</b><p>總目錄 ${result.total} 支。只有 <code>upstream-image</code> 才標示為直接取得上游當下 snapshot；Street View／synthetic 只算備援，不會誤標成即時 CCTV。</p>${result.samples.map(s => `<div class="tw-metrics">${s.isCurrentUpstream?'✓':'△'} ${esc(s.name)} · ${esc(s.provider)} · ${esc(s.source)} · ${s.latencyMs}ms</div>`).join('')}<small>檢查時間 ${new Date(result.checkedAt).toLocaleString()}</small></div>`;
  }

  function openLegacyCctv() {
    document.body.classList.add('gev-tw-legacy-open');
    const panel = document.getElementById('cctv-panel');
    panel?.classList.remove('collapsed');
    panel?.classList.add('active');
    toast('已開啟 CCTV 即時影像面板');
  }

  function updateResources(s) {
    set('ram',pct(s.systemMemoryUsed,s.systemMemoryTotal));
    set('swap',pct(s.swapUsed,s.swapTotal));
    set('gpu',s.gpuName||'--');
    set('vram',pct(s.gpuUsed,s.gpuTotal));
    const p = root.querySelector('[data-r=pressure]');
    p.textContent = s.pressured ? '資源保護中' : '';
    p.classList.toggle('on',!!s.pressured);
  }

  function set(k,v) {
    const el = root.querySelector(`[data-r=${k}]`);
    if (el) el.textContent = v;
  }

  return () => {
    geminiLive.stop().catch(()=>{});
    governor.stop();
    root.remove();
  };
}

function nav(a,icon,label) { return `<button data-act="${a}" title="${label}"><span class="material-symbols-outlined">${icon}</span><em>${label}</em></button>`; }
function flyTaiwan(v) { v.camera.flyTo({ destination:Cesium.Rectangle.fromDegrees(119.2,21.6,122.4,25.7), duration:1.4 }); }
function flyGlobal(v) { v.camera.flyHome(1.25); }
function pct(a,b) { return b ? `${Math.round(a/b*100)}%` : '--'; }
function bytes(v) { if(!Number.isFinite(Number(v))||Number(v)<=0)return '--'; const n=Number(v); return n>=1073741824?`${(n/1073741824).toFixed(1)} GB`:`${Math.round(n/1048576)} MB`; }
function metric(k,a,b) { return `<div><span>${k}</span><b>${a}</b><small>${b||''}</small></div>`; }
function num(sel,fallback) { const n=Number(document.querySelector(sel)?.value); return Number.isFinite(n)?n:fallback; }
function esc(v) { return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtSummary(l) { try { const s=l.geojson?summarize(l.geojson):null; return s?`${s.count} 筆 · 面積 ${(s.areaM2/1e6).toFixed(2)} km² · 線長 ${s.lengthKm.toFixed(2)} km`:'非 GeoJSON'; } catch { return '統計待計算'; } }
function download(blob,name) { const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
