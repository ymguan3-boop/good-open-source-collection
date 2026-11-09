const escape = value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const PAGE_SIZE = 12;
const requestId = () => globalThis.crypto?.randomUUID?.() || `cctv-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Monitoring and job state only. Full results belong to the existing AI chat. */
export function openCctvWall({ root, cameras, onClose, onLocal = async () => {}, onPage = () => {} }) {
  let page = 0, controller = null, retry = null, closed = false, paused = false, generation = 0, pageVersion = 0;
  const jobs = new Map(), resetTimers = new Set(), buttonResets = new WeakMap();
  const wall = document.createElement('section'); wall.className = 'tw-cctv-wall tw-cctv-embedded'; wall.setAttribute('aria-label','CCTV 多畫面總覽');
  wall.innerHTML = `<header><b>CCTV 監看 · ${cameras.length} 支</b><button data-wall-action="refresh">重新連線</button><button data-wall-action="pause">暫停影像</button></header><p data-wall-status role="status"></p><div class="tw-actions"><button data-wall-action="previous">上一頁</button><span data-page-label></span><button data-wall-action="next">下一頁</button></div><div class="tw-cctv-wall-grid"></div><footer>每頁最多 12 路官方影像；來源離線逐路提示。<a href="https://data.gov.tw/dataset/37665" target="_blank" rel="noopener noreferrer">來源與授權</a></footer>`;
  root.append(wall);
  const visible = () => cameras.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
  const tileFor = id => [...wall.querySelectorAll('[data-camera-id]')].find(el=>el.dataset.cameraId===id);
  const status = text => { wall.querySelector('[data-wall-status]').textContent = text; };
  function halt() { generation++; clearTimeout(retry); retry=null; controller?.abort(); controller=null; }
  function cancelJobs() { pageVersion++; for (const job of jobs.values()) job.abort(); jobs.clear(); for (const timer of resetTimers) clearTimeout(timer); resetTimers.clear(); }
  async function connect() {
    halt(); if (closed||paused) return; const current=generation, local=new AbortController(); controller=local;
    const pageCameras=visible(), seen=new Set(); status(`正在連線本頁 ${pageCameras.length} 路官方影像…`);
    try {
      const response=await fetch('/api/taiwan/cctv/wall-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:pageCameras.map(c=>c.id)}),signal:local.signal,cache:'no-store'});
      if (!response.ok) { const result=await response.json(); throw new Error(result.error||`CCTV HTTP ${response.status}`); }
      if (response.headers.get('X-CCTV-Source')!=='upstream-live') throw new Error('來源未確認為官方連續影像');
      const reader=response.body.getReader(), decoder=new TextDecoder(); let pending='';
      try {
        while (!local.signal.aborted) {
          const {value,done}=await reader.read(); if(done)break; pending+=decoder.decode(value,{stream:true});
          if(pending.length>4*1024*1024)throw new Error('影像回傳超過大小限制');
          let end;
          while((end=pending.indexOf('\n'))>=0) {
            const row=pending.slice(0,end); pending=pending.slice(end+1); if(!row)continue;
            const event=JSON.parse(row); if(current!==generation)return; const tile=tileFor(event.id); if(!tile)continue;
            if(event.type==='frame'&&typeof event.image==='string') {
              tile.querySelector('[data-live-frame]').src=`data:image/jpeg;base64,${event.image}`;
              tile.querySelector('[data-live-status]').textContent=`官方影像 · ${new Date(event.observedAt).toLocaleTimeString('zh-TW')}`;
              // Provider observedAt is receipt time, not necessarily the camera clock.
              tile.dataset.receivedAt=new Date(typeof event.observedAt==='number'||/^\d{13}$/.test(String(event.observedAt))?Number(event.observedAt):event.observedAt||Date.now()).toISOString();
              tile.dataset.sourceObservedAt=event.sourceObservedAt || event.imageObservedAt || '';
              tile.dataset.frameSource=event.source; seen.add(event.id);
              status(`本頁 ${pageCameras.length} 路，已取得 ${seen.size} 路畫面。`);
            } else if(event.type==='status') tile.querySelector('[data-live-status]').textContent=event.message;
          }
        }
      } finally { await reader.cancel().catch(()=>{}); }
      if(!local.signal.aborted)throw new Error('連線已中斷');
    } catch(error) { if(current!==generation||local.signal.aborted||closed)return; status(`${error.message}；3 秒後重新連線。`); retry=setTimeout(()=>void connect(),3000); }
  }
  function render() {
    cancelJobs(); halt(); const pages=Math.max(1,Math.ceil(cameras.length/PAGE_SIZE));
    wall.querySelector('[data-page-label]').textContent=`第 ${page+1}／${pages} 頁 · 共 ${cameras.length} 支`;
    wall.querySelector('[data-wall-action="previous"]').disabled=page===0; wall.querySelector('[data-wall-action="next"]').disabled=page+1>=pages;
    wall.querySelector('.tw-cctv-wall-grid').innerHTML=visible().map(c=>`<article data-camera-id="${escape(c.id)}"><b>${escape(c.name)}</b><div class="tw-vision-frame"><img data-live-frame alt="${escape(c.name)}官方影像"></div><small data-live-status>正在連線，尚未取得畫面</small><button data-wall-action="analyze" class="tw-cctv-recognize">🔍 一鍵辨識</button><p class="tw-cctv-job-state" data-job-status role="status">尚未執行辨識</p><small data-last-analysis>最近辨識：尚未執行</small></article>`).join('');
    onPage(); if(paused)status('影像已暫停'); else void connect();
  }
  async function capture(cameraId, id = requestId()) {
    const camera=cameras.find(c=>c.id===cameraId), tile=tileFor(cameraId), image=tile?.querySelector('[data-live-frame]');
    if(!image?.complete||!image.naturalWidth||!image.src.startsWith('data:image/jpeg;base64,'))throw new Error('尚未取得可辨識的官方影像');
    // Freeze Frame A and every associated field before the first async boundary.
    const screenshot=image.src, capturedAt=new Date().toISOString(), receivedAt=tile.dataset.receivedAt || null;
    const sourceObservedAt=tile.dataset.sourceObservedAt || null, source=tile.dataset.frameSource || '來源未提供';
    const frozen=new Image(); frozen.src=screenshot; await frozen.decode();
    const canvas=document.createElement('canvas'); canvas.width=frozen.naturalWidth; canvas.height=frozen.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true}); ctx.drawImage(frozen,0,0);
    return {cameraId,cameraName:camera?.name || cameraId,camera,requestId:id,screenshot,capturedAt,receivedAt,sourceObservedAt,observedAt:sourceObservedAt || capturedAt,source,imageData:ctx.getImageData(0,0,canvas.width,canvas.height)};
  }
  async function recognize(button) {
    const tile=button.closest('[data-camera-id]'), id=tile.dataset.cameraId;
    if(jobs.has(id))return;
    const priorReset=buttonResets.get(button);if(priorReset){clearTimeout(priorReset);resetTimers.delete(priorReset);buttonResets.delete(button);}
    const control=new AbortController(), version=pageVersion; jobs.set(id,control);
    button.disabled=true; button.setAttribute('aria-busy','true'); button.innerHTML='<span class="tw-cctv-spinner" aria-hidden="true"></span> 辨識中…';
    const out=tile.querySelector('[data-job-status]'); out.textContent='正在自動選擇免費辨識方式…';
    try {
      const frame=await capture(id);
      if(control.signal.aborted)throw new DOMException('辨識已取消','AbortError');
      await onLocal(id,{frame,signal:control.signal});
      if(closed||control.signal.aborted||version!==pageVersion)return;
      button.textContent='✓ 辨識完成'; out.textContent='✓ 已完成辨識，結果已送至 AI 空間助理';
      tile.querySelector('[data-last-analysis]').textContent=`最近辨識：${new Date(frame.capturedAt).toLocaleString('zh-TW')}`;
    } catch(error) {
      if(closed||control.signal.aborted||version!==pageVersion||error.name==='AbortError')return;
      button.textContent='⚠ 辨識失敗'; out.textContent=`⚠ 辨識失敗：${error.message}`;
    } finally {
      if(jobs.get(id)===control)jobs.delete(id);
      if(!closed&&!control.signal.aborted&&version===pageVersion&&button.isConnected) {
        button.disabled=false; button.removeAttribute('aria-busy');
        const timer=setTimeout(()=>{resetTimers.delete(timer);buttonResets.delete(button);if(button.isConnected&&!button.hasAttribute('aria-busy'))button.textContent='🔍 一鍵辨識';},2000); resetTimers.add(timer);buttonResets.set(button,timer);
      }
    }
  }
  const click=event=>{const button=event.target.closest('button'),action=button?.dataset.wallAction;if(!action)return;
    if(action==='analyze')return void recognize(button);
    if(action==='close')return onClose?.();
    if(action==='pause'){paused=true;halt();status('影像已暫停，保留最後畫面');return;}
    if(action==='refresh'){paused=false;return void connect();}
    if(action==='previous'&&page>0){page--;render();}
    if(action==='next'&&(page+1)*PAGE_SIZE<cameras.length){page++;render();}
  };
  wall.addEventListener('click',click);
  const visibility=()=>{if(document.hidden){halt();status('分頁在背景，已暫停影像更新');}else if(!paused)void connect();}; document.addEventListener('visibilitychange',visibility);
  function dispose(){closed=true;cancelJobs();halt();document.removeEventListener('visibilitychange',visibility);wall.removeEventListener('click',click);wall.querySelectorAll('img').forEach(img=>img.removeAttribute('src'));wall.remove();}
  const frameSources=()=>visible().map(camera=>({id:camera.id,camera,capture:({requestId:id}={})=>capture(camera.id,id)}));
  render(); return {dispose,frameSources,capture,cancelRecognition(){const ids=[...jobs.keys()];cancelJobs();for(const id of ids){const tile=tileFor(id);if(!tile)continue;const button=tile.querySelector('[data-wall-action="analyze"]');button.disabled=false;button.removeAttribute('aria-busy');button.textContent='🔍 一鍵辨識';tile.querySelector('[data-job-status]').textContent='已取消辨識';}},pause(){paused=true;halt();},resume(){paused=false;void connect();},wall,get pending(){return jobs.size;}};
}
