// Multiplex genuine upstream JPEG frames onto one browser connection. This avoids
// the HTTP/1 per-host connection limit that stalls a wall of separate MJPEG imgs.
export async function streamCameraWall(req,res,cameras){
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)throw new Error('攝影機清單過長');}
  const ids=JSON.parse(raw||'{}').ids;
  if(!Array.isArray(ids)||ids.length<1||ids.length>12||ids.some(id=>typeof id!=='string'))throw new Error('每頁可同時觀看 1 至 12 支 CCTV');
  const selected=[...new Set(ids)].map(id=>cameras.find(c=>c.id===id));
  if(selected.some(c=>!c))throw new Error('攝影機不在官方目錄內');
  const controller=new AbortController();
  const stop=()=>controller.abort();res.once('close',stop);
  res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-CCTV-Source':'upstream-live','X-Accel-Buffering':'no'});
  res.flushHeaders?.();req.socket.setNoDelay(true);
  const emit=event=>{if(!res.destroyed&&!controller.signal.aborted&&res.writableLength<2*1024*1024)res.write(JSON.stringify(event)+'\n');};
  const delay=ms=>new Promise(resolve=>{if(controller.signal.aborted)return resolve();const timer=setTimeout(done,ms);function done(){clearTimeout(timer);controller.signal.removeEventListener('abort',done);resolve();}controller.signal.addEventListener('abort',done,{once:true});});
  const heartbeat=setInterval(()=>emit({type:'heartbeat',at:Date.now()}),15000);
  async function watch(camera){
    while(!controller.signal.aborted){
      const attempt=new AbortController();const abort=()=>attempt.abort();controller.signal.addEventListener('abort',abort,{once:true});
      let reader,idleTimer;
      const idle=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(abort,25000);};
      try{
        idle();const response=await fetch(camera.url,{signal:attempt.signal,redirect:'error',headers:{'User-Agent':'gods-eye-taiwan-cctv/1.0'}});
        if(!response.ok)throw new Error(`官方來源 HTTP ${response.status}`);
        const type=response.headers.get('content-type')||'';
        if(!/^image\/jpeg|^multipart\/x-mixed-replace/i.test(type))throw new Error('官方來源沒有提供 JPEG 連續影像');
        const continuous=/multipart/i.test(type);reader=response.body.getReader();let bytes=Buffer.alloc(0),lastFrame=0;
        while(!attempt.signal.aborted){
          const {value,done}=await reader.read();if(done)break;idle();bytes=Buffer.concat([bytes,Buffer.from(value)]);
          if(bytes.length>2*1024*1024)throw new Error('影格超過大小限制');
          for(;;){const start=bytes.indexOf(Buffer.from([255,216]));if(start<0){if(bytes.length>4096)bytes=bytes.subarray(-2);break;}const end=bytes.indexOf(Buffer.from([255,217]),start+2);if(end<0){if(start>0)bytes=bytes.subarray(start);break;}const frame=bytes.subarray(start,end+2);bytes=bytes.subarray(end+2);const now=Date.now();if(now-lastFrame>=800){lastFrame=now;emit({type:'frame',id:camera.id,source:continuous?'upstream-live':'upstream-image',observedAt:now,image:frame.toString('base64')});}}
        }
        if(controller.signal.aborted)return;
        emit({type:'status',id:camera.id,message:continuous?'官方串流已中斷，正在重新連線':'官方提供單張影格，持續更新中'});
      }catch(error){if(!controller.signal.aborted)emit({type:'status',id:camera.id,message:error.name==='AbortError'?'官方影像連線逾時，稍後重試':error.message});}
      finally{clearTimeout(idleTimer);attempt.abort();await reader?.cancel().catch(()=>{});controller.signal.removeEventListener('abort',abort);}
      await delay(3000);
    }
  }
  try{await Promise.all(selected.map(watch));}finally{clearInterval(heartbeat);controller.abort();res.removeListener('close',stop);if(!res.destroyed)res.end();}
}
