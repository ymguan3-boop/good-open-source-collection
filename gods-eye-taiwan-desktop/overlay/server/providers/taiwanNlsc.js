import { readFileSync } from 'node:fs';
import { analyzeNlscBuildings } from './nlscBuildingAnalysis.js';

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
          const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),120000);
          res.on('close',()=>controller.abort());
          try {
            let text='';for await(const chunk of req){text+=chunk.toString('utf8');if(text.length>60000)throw new Error('分析範圍過大');}
            const result=await analyzeNlscBuildings(JSON.parse(text),controller.signal);
            if(!res.destroyed)res.end(JSON.stringify(result));
          }catch(error){if(!res.destroyed){res.statusCode=400;res.end(JSON.stringify({error:error.message}));}}
          finally{clearTimeout(timer);}
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
