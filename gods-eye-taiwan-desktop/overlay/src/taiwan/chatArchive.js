import {indexRecord,ensureRecordIndex,deleteRecordIndex,recordIndexRequest} from './recordRetrieval.js';
import JSZip from 'jszip';
import { db } from './db.js';
import { renderChatMarkdown } from './chatFormat.js';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function recordTimestamp(date=new Date()) {
  const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date);
  return parts.replace(' ','_').replace(/:/g,'-')+`-${String(date.getMilliseconds()).padStart(3,'0')}`;
}
export function createChatArchive({root,open,download,onStatus,manager,onAnalyze=()=>{}}) {
  let preview=null,lastSavedTime=0,releasePreview=null,page=0;const selectedIds=new Set();
  async function save(messages,{title="AI 空間助理對話紀錄",frames=[],media=null,attachments=[],project=""}={}){
    if(!messages.length)throw new Error('目前沒有對話可儲存');
    if(media?.id){const existing=await db.chatRecords.filter(record=>record.media?.id===media.id).first();if(existing){await db.chatRecords.update(existing.id,{media:{...existing.media,...media}});onStatus(`已更新 ${existing.filename} 的匯出狀態`);return existing.id;}}
    const latest=await db.chatRecords.orderBy('createdAt').last();
    lastSavedTime=Math.max(Date.now(),lastSavedTime+1,(Date.parse(latest?.createdAt)||0)+1);
    const date=new Date(lastSavedTime),filename=`${recordTimestamp(date)}.md`;
    const candidates=[...frames,...messages.filter(m=>m.cctvResult?.screenshot).map(m=>({image:m.cctvResult.screenshot,caption:`${m.cctvResult.cameraName} · ${m.cctvResult.capturedAt}`,requestId:m.cctvResult.requestId}))];
    const unique=new Map();for(const frame of candidates)if(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(frame.image||'') && frame.image.length<8000000)unique.set(frame.requestId||frame.image,frame);
    const groups=new Map();for(const frame of unique.values()){const camera=String(frame.cameraId||frame.caption?.split(' · ')[0]||'camera'),event=frame.eventType||'snapshot',time=Date.parse(frame.capturedAt||frame.caption?.split(' · ')[1])||lastSavedTime,key=camera+':'+event+':'+Math.floor(time/60000);const list=groups.get(key)||[];if(!list.some(f=>f.image===frame.image))list.push(frame);groups.set(key,list);}
    const representatives=[...groups.values()].flatMap(list=>list.length<=3?list:[list[0],list[Math.floor(list.length/2)],list.at(-1)]);
    const savedFrames=representatives.map((frame,index)=>({...frame,path:`images/cctv-${index+1}.jpg`}));
    const cctvResults=messages.filter(m=>m.cctvResult).map(m=>{const {screenshot,...metadata}=m.cctvResult;return metadata;});
    const markdown=`# ${title}\n\n儲存時間：${date.toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}（台灣時間）\n\n`+messages.map(message=>`## ${{user:'使用者',assistant:'AI 空間助理',system:'系統'}[message.role] || '訊息'}\n\n${String(message.content || '')}\n`).join('\n')+savedFrames.map(frame=>`\n## CCTV 截圖\n${frame.caption||''}\n![CCTV 截圖](${frame.path})\n`).join('');
    const savedAttachments=attachments.map((attachment,index)=>{
      const attachmentName=String(attachment.filename||`attachment-${index+1}.json`).replace(/[\\/:*?"<>|]/g,'-');
      if(!attachmentName.endsWith('.json'))throw new Error('記錄附檔只支援 JSON');
      const content=typeof attachment.content==='string'?attachment.content:JSON.stringify(attachment.content,null,2);
      if(typeof content!=='string')throw new Error('記錄 JSON 附檔內容不正確');
      JSON.parse(content);
      return {filename:attachmentName,content,mimeType:'application/json'};
    });
    const id=await db.chatRecords.add({filename,createdAt:date.toISOString(),markdown,messageCount:messages.length,frames:savedFrames,cctvResults,media,project,attachments:savedAttachments});
    const saved=await db.chatRecords.get(id);if(!saved)throw new Error('瀏覽器未能保存紀錄，請檢查儲存空間');await indexRecord(saved);
    onStatus(`已儲存 ${filename}，可至工具列「記錄」查看`);return id;
  }
  async function removeVideo(mediaId){
    if(typeof mediaId!=='string'||!mediaId)return;
    const records=await db.chatRecords.filter(record=>record.media?.id===mediaId).toArray();
    for(const record of records)await db.chatRecords.update(record.id,{media:{...record.media,video:null,metadata:{...record.media.metadata,videoDeletedAt:new Date().toISOString()}}});
    releasePreview?.();releasePreview=null;preview?.remove();preview=null;
    onStatus('已刪除這支影片；記錄中的飛行軌跡與文字資料仍保留');
  }
  async function render(){
    await ensureRecordIndex();
    let records,total;
    try{const result=await recordIndexRequest({action:'list',limit:50,offset:page*50});records=result.records;total=result.total;if(page&&page*50>=total){page=Math.max(0,Math.ceil(total/50)-1);return render();}}
    catch{const all=await db.recordIndex.orderBy('createdAt').reverse().toArray();total=all.length;page=Math.min(page,Math.max(0,Math.ceil(total/50)-1));records=all.slice(page*50,(page+1)*50);}
    open('記錄',`<div class="tw-actions tw-command-row"><button data-archive="export-selected">匯出勾選紀錄</button><button data-archive="export-all">匯出全部紀錄</button><button class="tw-analysis-primary" data-archive="analyze-selected">依勾選紀錄進行AI分析</button><button class="tw-analysis-secondary" data-archive="analyze-all">依全部紀錄進行AI分析</button></div>
      <p class="tw-note">共 ${total} 筆紀錄，依儲存時間由新到舊排列。</p>${total>50?`<div class="tw-actions"><button data-archive="previous" ${page?'':'disabled'}>上一頁</button><span>第 ${page+1}/${Math.ceil(total/50)} 頁</span><button data-archive="next" ${(page+1)*50<total?'':'disabled'}>下一頁</button></div>`:''}
      ${records.map(record=>`<article class="tw-card tw-record-row"><div class="tw-record-heading"><input type="checkbox" aria-label="勾選 ${escape(record.filename)}" data-record-select value="${record.id}" ${selectedIds.has(record.id)?'checked':''}><button class="tw-record-filename" data-archive="view" data-id="${record.id}">${escape(record.filename)}</button></div><div class="tw-record-summary"><p>${escape(new Date(record.createdAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}))} · ${record.messageCount} 則訊息</p><div class="tw-actions"><button data-archive="export-one" data-id="${record.id}">匯出紀錄</button><button data-archive="delete" data-id="${record.id}">刪除紀錄</button></div></div></article>`).join('')||'<p>尚無儲存紀錄。</p>'}`);
  }
  async function view(id){
    const record=await db.chatRecords.get(id);if(!record)throw new Error('找不到對話紀錄');
    releasePreview?.();releasePreview=null;preview?.remove();preview=document.createElement('section');preview.className='tw-record-preview';preview.setAttribute('aria-label','對話紀錄檢視');
    preview.innerHTML=`<header><span>${escape(record.filename)}</span><button data-record-close aria-label="關閉紀錄">×</button></header><div class="tw-chat-content">${renderChatMarkdown(record.frames?.length?record.markdown.split('\n## CCTV 截圖\n')[0]:record.markdown,{compact:true})}</div><footer>可拖曳右下角調整視窗大小。</footer>`;
    for(const frame of record.frames||[]){const figure=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption');image.src=frame.image;image.alt='儲存時的 CCTV 截圖';image.style.cssText='max-width:100%;height:auto';caption.textContent=frame.caption;figure.append(image,caption);preview.querySelector('.tw-chat-content').append(figure);}
    let videoUrl=null;if(record.media?.video){const video=document.createElement('video');video.controls=true;video.style.width='100%';videoUrl=URL.createObjectURL(record.media.video);video.src=videoUrl;preview.querySelector('.tw-chat-content').append(video);}
    for(const attachment of record.attachments||[]){const note=document.createElement('p');note.textContent=`附加 JSON：${attachment.filename}（匯出紀錄時一併打包）`;preview.querySelector('.tw-chat-content').append(note);}
    preview.querySelector('[data-record-close]').onclick=()=>{releasePreview?.();releasePreview=null;preview.remove();preview=null;};root.append(preview);const previewWindow=manager?.enhanceExisting(preview,{id:'record-preview',handle:preview.querySelector('header'),closeButton:preview.querySelector('[data-record-close]')});releasePreview=()=>{previewWindow?.destroy();if(videoUrl)URL.revokeObjectURL(videoUrl);};
  }
  async function exportRecords(ids){
    const records=ids ? (await db.chatRecords.bulkGet(ids)).filter(Boolean) : await db.chatRecords.orderBy('createdAt').toArray();
    if(!records.length)throw new Error('請先選擇要匯出的紀錄');
    if(records.length===1 && !records[0].frames?.length && !records[0].media && !records[0].attachments?.length)download(new Blob([records[0].markdown],{type:'text/markdown;charset=utf-8'}),records[0].filename);
    else {const zip=new JSZip();for(const record of records){const folder=records.length===1?zip:zip.folder(record.filename.replace(/\.md$/,''));folder.file(record.filename,record.markdown);for(const attachment of record.attachments||[])folder.file(attachment.filename,attachment.content);for(const [index,frame] of (record.frames||[]).entries())folder.file(frame.path||`images/cctv-${index+1}.jpg`,frame.image.split(',')[1],{base64:true});if(record.cctvResults?.length)folder.file('cctv-metadata.json',JSON.stringify(record.cctvResults,null,2));if(record.media){folder.file('flight-metadata.json',JSON.stringify(record.media.metadata,null,2));if(record.media.geojson)folder.file('flight-path.geojson',JSON.stringify(record.media.geojson));if(record.media.video)folder.file(record.media.filename||'aerial.webm',record.media.video);}}download(await zip.generateAsync({type:'blob'}),records.length===1?records[0].filename.replace(/\.md$/,'.zip'):`對話紀錄-${recordTimestamp()}.zip`);}
    onStatus(`已匯出 ${records.length} 筆對話紀錄`);
  }
  const click=async event=>{
    const button=event.target.closest('[data-archive]');if(!button)return;
    try{
      const id=Number(button.dataset.id),action=button.dataset.archive;
      if(action==='previous'||action==='next'){page+=action==='next'?1:-1;await render();return;}
      if(action==='view')await view(id);
      if(action==='delete'){await db.chatRecords.delete(id);await deleteRecordIndex(id);selectedIds.delete(id);await render();}
      if(action==='export-one')await exportRecords([id]);
      if(action==='export-all')await exportRecords();
      if(action==='export-selected')await exportRecords([...selectedIds]);
      if(action==='analyze-selected'||action==='analyze-all'){
        const ids=action==='analyze-all'?await db.chatRecords.toCollection().primaryKeys():[...selectedIds],records=ids.map(id=>({id}));
        if(!records.length)throw Error('請先勾選紀錄，或儲存對話後再分析。');
        await onAnalyze(records);
      }
    }catch(error){onStatus(error.message);}
  };
  const change=event=>{if(event.target.matches('[data-record-select]')){const id=Number(event.target.value);event.target.checked?selectedIds.add(id):selectedIds.delete(id);}};root.addEventListener('change',change);
  root.addEventListener('click',click);
  queueMicrotask(()=>ensureRecordIndex().catch(()=>{}));
  return {save,render,removeVideo,destroy(){root.removeEventListener('change',change);root.removeEventListener('click',click);releasePreview?.();preview?.remove();}};
}
