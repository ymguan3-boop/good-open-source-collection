import './nlscTls.js';
import { readFileSync } from 'node:fs';
import { analyzeNlscBuildings } from './nlscBuildingAnalysis.js';
import { cadastreStatus, parcelsInBox, parcelAt } from './taiwanCadastre.js';
import { ageCandidateBuildings, ageTrades, townDigests, buildingElevationDetail, buildingClasses, localBuildingAnalysis, buildingInfoStatus, importBuildingPacks, listAvailablePacks, lookupBuilding, packsOverview, readTownTileset, readWhiteTile, rememberPackState, removeBuildingPack, scanPackFolder } from './taiwanBuildingInfo.js';

const SERVICE_LIST = 'https://3dtiles.nlsc.gov.tw/tiles3d/Service';
const SNAPSHOT_CAPTURED_AT = '2026-09-30';
const SNAPSHOT_PATH = new URL('./nlsc-service-snapshot.json', import.meta.url);

function local(req) {
  const host = String(req.headers.host || '');
  const origin = String(req.headers.origin || '');
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
    && /^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)
    && (!origin || origin === `http://${host}`)
    && !['forwarded', 'x-forwarded-for', 'x-real-ip'].some(name => req.headers[name]);
}

function discover(text) {
  const result = new Map();
  function add(raw, label='NLSC 三維建物') {
    try {
      const parsed = new URL(raw, SERVICE_LIST);
      if (parsed.protocol !== 'https:' || !/(^|\.)nlsc\.gov\.tw$/.test(parsed.hostname) || !/\/tileset\.json$/i.test(parsed.pathname)) return;
      if (!/building|建物/i.test(`${parsed.pathname} ${label}`)) return;
      result.set(parsed.href, { name:String(label).slice(0, 100), url:parsed.href });
    } catch { /* Other service-list strings are not URLs. */ }
  }
  function walk(value, label='', depth=0) {
    if (depth > 12 || !value) return;
    if (typeof value === 'string') { add(value, label); return; }
    if (Array.isArray(value)) { value.forEach(item => walk(item, label, depth+1)); return; }
    if (typeof value === 'object') {
      const name = String(value.Name || value.name || value.title || value.serviceName || value.layerName || label || 'NLSC 三維建物');
      Object.values(value).forEach(item => walk(item, name, depth+1));
    }
  }
  try { walk(JSON.parse(text)); } catch {
    for (const match of text.matchAll(/(?:https:\/\/[^\s"'<>]+|(?:\.\.\/|\/)[^\s"'<>]+)\/tileset\.json(?:\?[^\s"'<>]*)?/gi)) add(match[0]);
  }
  return [...result.values()];
}

export function taiwanNlscProxy() {
  return {
    name:'taiwan-nlsc-discovery',
    configureServer(server) {
      server.middlewares.use('/api/taiwan/nlsc-buildings', async (req,res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        if (req.url === '/analysis' && req.method === 'POST' && local(req)) {
          const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),420000);
          res.on('close',()=>controller.abort());
          try {
            let text='';for await(const chunk of req){text+=chunk.toString('utf8');if(text.length>60000)throw new Error('分析範圍過大');}
            const result=await analyzeNlscBuildings(JSON.parse(text),controller.signal);
            if(!res.destroyed)res.end(JSON.stringify(result));
          }catch(error){if(!res.destroyed){res.statusCode=400;res.end(JSON.stringify({error:error.message}));}}
          finally{clearTimeout(timer);}
          return;
        }
        if (req.method === 'GET' && local(req) && /^\/(?:town-tileset|white\/)/.test(req.url || '')) {
          try {
            const url = new URL(req.url, 'http://127.0.0.1');
            if (url.pathname === '/town-tileset') {
              const body = readTownTileset(url.searchParams.get('slug'), url.searchParams.get('mode'));
              res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Content-Encoding', 'gzip'); res.setHeader('Vary', 'Accept-Encoding');
              res.setHeader('Cache-Control', 'private, max-age=60'); res.setHeader('Content-Length', String(body.length)); res.end(body); return;
            }
            const [, , slug, name] = url.pathname.split('/');
            const tile = await readWhiteTile(slug, decodeURIComponent(name || ''));
            res.setHeader('Content-Type', 'model/gltf-binary'); res.setHeader('Cache-Control', 'private, max-age=86400'); res.setHeader('Content-Length', String(tile.length)); res.end(tile);
          } catch (error) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.removeHeader('Content-Encoding'); res.statusCode = 404; res.end(JSON.stringify({ error:error.message })); }
          return;
        }
        // Imported township databases: list, scan a folder, import, remove, and remember what is loaded.
        if (local(req) && ['GET', 'POST'].includes(req.method) && /^\/info\/(?:analysis|age-trades|age-elevation|building-elevation|digest|cadastre)/.test(req.url || '')) {
          try {
            const url = new URL(req.url, 'http://127.0.0.1');
            // 地籍圖（本機匯入）：狀態、視野內的地號線、某一點所在的地號。
            if (req.method === 'GET' && url.pathname === '/info/cadastre/status') { res.end(JSON.stringify(cadastreStatus())); return; }
            if (req.method === 'GET' && url.pathname === '/info/cadastre/parcels') {
              const box = (url.searchParams.get('bbox') || '').split(',').map(Number);
              res.end(JSON.stringify(parcelsInBox(box, url.searchParams.get('limit'), url.searchParams.get('town') || null))); return;
            }
            if (req.method === 'GET' && url.pathname === '/info/cadastre/at') { res.end(JSON.stringify({ parcel: parcelAt(Number(url.searchParams.get('lon')), Number(url.searchParams.get('lat'))) })); return; }
            if (req.method === 'GET' && url.pathname === '/info/digest') { res.end(JSON.stringify(townDigests((url.searchParams.get('slugs') || '').split(',').filter(Boolean)))); return; }
            if (req.method === 'GET' && url.pathname === '/info/age-elevation') { res.end(JSON.stringify(ageCandidateBuildings({ slug: url.searchParams.get('slug'), minYears: url.searchParams.get('minYears') ?? 30 }))); return; }
            if (req.method === 'GET' && url.pathname === '/info/age-trades') { res.end(JSON.stringify(ageTrades({ town: url.searchParams.get('town'), minYears: url.searchParams.get('minYears') ?? 30, slug: url.searchParams.get('slug'), withElevation: url.searchParams.get('elevation') === '1' }))); return; }
            if (req.method === 'POST' && url.pathname === '/info/analysis') {
              let text = ''; for await (const chunk of req) { text += chunk.toString('utf8'); if (text.length > 8_000_000) throw new Error('分析範圍過大'); }
              res.end(JSON.stringify(localBuildingAnalysis(JSON.parse(text)))); return;
            }
            if (req.method === 'POST' && url.pathname === '/info/building-elevation') {
              let text = ''; for await (const chunk of req) { text += chunk.toString('utf8'); if (text.length > 8_000_000) throw new Error('分析範圍過大'); }
              res.end(JSON.stringify(buildingElevationDetail(JSON.parse(text)))); return;
            }
            throw new Error('不支援的操作');
          } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error:error.message })); }
          return;
        }
        if (local(req) && ['GET', 'POST'].includes(req.method) && /^\/info\/(?:packs|state|classes)/.test(req.url || '')) {
          try {
            const url = new URL(req.url, 'http://127.0.0.1');
            if (req.method === 'GET' && url.pathname === '/info/classes') {
              const body = buildingClasses(url.searchParams.get('slug'));
              res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Content-Encoding', 'gzip'); res.setHeader('Vary', 'Accept-Encoding');
              res.setHeader('Cache-Control', 'private, max-age=60'); res.setHeader('Content-Length', String(body.length)); res.end(body); return;
            }
            if (req.method === 'GET' && url.pathname === '/info/packs') { res.end(JSON.stringify({ ...packsOverview(), ...(url.searchParams.get('available') === '1' ? { available: listAvailablePacks() } : {}) })); return; }
            if (req.method !== 'POST') throw new Error('不支援的操作');
            let text = ''; for await (const chunk of req) { text += chunk.toString('utf8'); if (text.length > 20000) throw new Error('要求內容過大'); }
            const data = text ? JSON.parse(text) : {};
            if (url.pathname === '/info/packs/scan') { res.end(JSON.stringify({ available: scanPackFolder(data.path) })); return; }
            if (url.pathname === '/info/packs/import') { res.end(JSON.stringify({ ok: true, added: importBuildingPacks(data.slugs, data.folder) })); return; }
            if (url.pathname === '/info/packs/remove') { res.end(JSON.stringify({ ok: true, ...removeBuildingPack(data.slug, data.deleteFiles === true && data.confirm === true) })); return; }
            if (url.pathname === '/info/state') { rememberPackState(data); res.end(JSON.stringify({ ok: true })); return; }
            throw new Error('不支援的操作');
          } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error:error.message })); }
          return;
        }
        if (req.method === 'GET' && local(req) && /^\/info(?:\/status)?(?:\?|$)/.test(req.url || '')) {
          try {
            const url = new URL(req.url, 'http://127.0.0.1');
            res.end(JSON.stringify(url.pathname === '/info/status' ? buildingInfoStatus() : lookupBuilding(url.searchParams.get('id'))));
          } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error:error.message })); }
          return;
        }
        if (req.method !== 'GET' || !local(req)) { res.statusCode = 403; res.end(JSON.stringify({ error:'僅允許本機同來源瀏覽器' })); return; }
        try {
          const upstream = await fetch(SERVICE_LIST, { signal:AbortSignal.timeout(15000), headers:{ Accept:'application/json, text/html, */*' } });
          if (!upstream.ok) throw new Error(`官方服務清單 HTTP ${upstream.status}`);
          const text = (await upstream.text()).slice(0, 2_000_000);
          const services = discover(text);
          res.end(JSON.stringify({ source:SERVICE_LIST, checkedAt:new Date().toISOString(), services }));
        } catch (error) {
          try {
            const services = discover(readFileSync(SNAPSHOT_PATH,'utf8'));
            if (!services.length) throw new Error('備援清單沒有建物端點');
            res.end(JSON.stringify({ source:SERVICE_LIST, checkedAt:new Date().toISOString(),
              snapshotCapturedAt:SNAPSHOT_CAPTURED_AT, stale:true,
              warning:`官方服務清單目前無法連線（${error.message}），使用 ${SNAPSHOT_CAPTURED_AT} 下載的官方清單；載入時仍須確認圖磚可用。`, services }));
          } catch (snapshotError) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error:`NLSC 官方服務清單讀取失敗：${error.message}；備援失敗：${snapshotError.message}` }));
          }
        }
      });
    },
  };
}
