const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const PAGE_SIZE=12;
export function openCctvWall({root,cameras,onClose}){
  let page=0,controller=null,retry=null,closed=false,paused=false,generation=0;
  const wall=document.createElement('section');wall.className='tw-cctv-wall';wall.setAttribute('aria-label','CCTV 多畫面總覽');
  wall.innerHTML=`<header><b>CCTV 多畫面總覽 · ${cameras.length} 支</b><button data-wall-action="refresh">重新連線全部畫面</button><button data-wall-action="pause">暫停</button><button data-wall-action="close" aria-label="關閉 CCTV 總覽">×</button></header><p data-wall-status role="status"></p><div class="tw-actions"><button data-wall-action="previous">上一頁</button><span data-page-label></span><button data-wall-action="next">下一頁</button></div><div class="tw-cctv-wall-grid"></div><footer>全台灣官方國道目錄；每頁最多 12 路同時連續播放，切換頁面會釋放前頁連線。各路來源時間不同，不是同步錄影。<a href="https://data.gov.tw/dataset/37665" target="_blank" rel="noopener noreferrer">來源與授權</a> · 可拖曳右下角調整視窗。</footer>`;
  root.append(wall);
  const visible=()=>cameras.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
  function halt(){generation++;clearTimeout(retry);retry=null;controller?.abort();controller=null;}
  function status(text){wall.querySelector('[data-wall-status]').textContent=text;}
  async function connect(){
    halt();if(closed||paused)return;const current=generation,local=new AbortController();controller=local;
    const pageCameras=visible(),seen=new Set();status(`正在連線本頁 ${pageCameras.length} 路官方影像…`);
    try{
      const response=await fetch('/api/taiwan/cctv/wall-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:pageCameras.map(c=>c.id)}),signal:local.signal,cache:'no-store'});
      if(!response.ok){const result=await response.json();throw new Error(result.error||`CCTV HTTP ${response.status}`);}
      if(response.headers.get('X-CCTV-Source')!=='upstream-live')throw new Error('來源未確認為官方連續影像');
      const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
      try{while(!local.signal.aborted){const {value,done}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});if(pending.length>4*1024*1024)throw new Error('影像回傳超過大小限制');let end;while((end=pending.indexOf('\n'))>=0){const row=pending.slice(0,end);pending=pending.slice(end+1);if(!row)continue;const event=JSON.parse(row);if(current!==generation)return;const tile=[...wall.querySelectorAll('[data-camera-id]')].find(el=>el.dataset.cameraId===event.id);if(!tile)continue;
        if(event.type==='frame'&&typeof event.image==='string'){tile.querySelector('img').src=`data:image/jpeg;base64,${event.image}`;tile.querySelector('small').textContent=`${event.source==='upstream-live'?'官方連續影像':'官方單張更新'} · ${new Date(event.observedAt).toLocaleTimeString('zh-TW')}`;seen.add(event.id);status(`本頁 ${pageCameras.length} 路並行播放，已取得 ${seen.size} 路畫面；來源離線不影響其他畫面。`);}
        else if(event.type==='status')tile.querySelector('small').textContent=event.message;
      }}}finally{await reader.cancel().catch(()=>{});}
      if(!local.signal.aborted)throw new Error('連線已中斷');
    }catch(error){if(current!==generation||local.signal.aborted||closed)return;status(`${error.message}；3 秒後重新連線。`);retry=setTimeout(()=>void connect(),3000);}
  }
  function render(){
    halt();const pages=Math.ceil(cameras.length/PAGE_SIZE);
    wall.querySelector('[data-page-label]').textContent=`第 ${page+1}／${pages} 頁 · 共 ${cameras.length} 支`;
    wall.querySelector('[data-wall-action="previous"]').disabled=page===0;wall.querySelector('[data-wall-action="next"]').disabled=page+1>=pages;
    wall.querySelector('.tw-cctv-wall-grid').innerHTML=visible().map(c=>`<article data-camera-id="${escape(c.id)}"><b>${escape(c.name)}</b><img alt="${escape(c.name)}官方影像"><small>正在連線，尚未取得畫面</small></article>`).join('');
    if(paused)status('已暫停；按重新連線全部畫面恢復');else void connect();
  }
  wall.addEventListener('click',event=>{const action=event.target.closest('button')?.dataset.wallAction;if(!action)return;
    if(action==='close')return onClose();
    if(action==='pause'){paused=true;halt();status('所有畫面已暫停，保留最後一張影像');return;}
    if(action==='refresh'){paused=false;return void connect();}
    if(action==='previous'&&page>0){page--;render();}
    if(action==='next'&&(page+1)*PAGE_SIZE<cameras.length){page++;render();}
  });
  const visibility=()=>{if(document.hidden){halt();status('分頁在背景，已暫停影像更新');}else if(!paused)void connect();};document.addEventListener('visibilitychange',visibility);
  render();return()=>{closed=true;halt();document.removeEventListener('visibilitychange',visibility);wall.querySelectorAll('img').forEach(img=>img.removeAttribute('src'));wall.remove();};
}
