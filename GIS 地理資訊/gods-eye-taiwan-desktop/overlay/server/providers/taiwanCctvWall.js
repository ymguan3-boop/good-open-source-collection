import { loadTaiwanFreewaySources } from './cctv/taiwan.js';
import { proxyMediaResponse,watchDownstreamClose } from './cctv/media.js';
import { streamCameraWall } from './cctv/wallStream.js';

// National catalog is independent of the global catalog's shared source cap and county mask.
export function taiwanCctvWallProxy() {
  let catalog=[],updatedAt=0,pending;
  async function sources() {
    if(catalog.length && Date.now()-updatedAt<600000)return catalog;
    pending ||= loadTaiwanFreewaySources().then(items=>{if(!items.length)throw new Error('官方全台 CCTV 目錄暫時無法取得');catalog=items;updatedAt=Date.now();return items;}).finally(()=>{pending=null;});return pending;
  }
  const json=(res,status,payload)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(payload));};
  const install=server=>{server.middlewares.use('/api/taiwan/cctv',async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if(req.method!=='GET' && !(req.method==='POST'&&path==='/wall-stream'))return json(res,405,{error:'不支援此請求'});
    if(req.method==='POST' && req.headers.origin && req.headers.origin!==`http://${req.headers.host}`)return json(res,403,{error:'只允許本機程式開啟 CCTV'});
    try {
      const items=await sources();
      if(path==='/wall-stream')return await streamCameraWall(req,res,items);
      if(path==='/sources')return json(res,200,{sources:items.map(({url,...camera})=>camera),updatedAt,coverage:'全台灣官方國道 CCTV；不受縣市選擇影響',source:'https://data.gov.tw/dataset/37665'});
      const match=path.match(/^\/(frame|media)\/([^/]+)$/);if(!match)return json(res,404,{error:'找不到 CCTV 路徑'});
      const camera=items.find(item=>item.id===decodeURIComponent(match[2]));if(!camera)return json(res,404,{error:'找不到官方攝影機'});
      const client=watchDownstreamClose(res),controller=new AbortController();
      const abort=()=>controller.abort();client.signal.addEventListener('abort',abort,{once:true});
      const timeout=setTimeout(abort,match[1]==='frame' ? 15000 : 600000);
      try {
        const upstream=await fetch(camera.url,{signal:controller.signal,redirect:'error',headers:{'User-Agent':'gods-eye-taiwan-cctv/1.0'}});
        if(!upstream.ok)throw new Error(`上游 HTTP ${upstream.status}`);
        const type=upstream.headers.get('content-type') || '';
        if(match[1]==='media') {
          if(!/^image\/|^multipart\/x-mixed-replace/i.test(type))throw new Error('上游未提供影像');
          await proxyMediaResponse(res,upstream,{sourceHeader:'upstream-live'});
          // The shared helper starts piping and returns; keep this request alive until the viewer closes.
          if(!res.writableEnded && !res.destroyed)await new Promise(resolve=>{res.once('close',resolve);res.once('finish',resolve);});
          return;
        }
        // MJPEG: extract one actual upstream JPEG; never substitute a synthetic/street-view frame.
        if(!/^image\/jpeg|^multipart\/x-mixed-replace/i.test(type))throw new Error('來源未提供 JPEG 影像');
        const reader=upstream.body.getReader();let bytes=Buffer.alloc(0),frame;
        try {while(bytes.length<2*1024*1024){const {value,done}=await reader.read();if(done)break;bytes=Buffer.concat([bytes,Buffer.from(value)]);const start=bytes.indexOf(Buffer.from([255,216]));if(start>=0){const end=bytes.indexOf(Buffer.from([255,217]),start+2);if(end>=0){frame=bytes.subarray(start,end+2);break;}}}} finally {controller.abort();await reader.cancel().catch(()=>{});}
        if(!frame)throw new Error('尚未取得完整上游影格');
        if(!res.destroyed){res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-CCTV-Source':'upstream-image'});res.end(frame);}
      } finally {clearTimeout(timeout);client.signal.removeEventListener('abort',abort);controller.abort();}
    } catch(error) {if(!res.headersSent && !res.destroyed)json(res,502,{error:error.name==='AbortError' ? '攝影機連線逾時' : error.message});}
  });};
  return {name:'taiwan-cctv-wall',configureServer:install,configurePreviewServer:install};
}
