import JSZip from 'jszip';
import { db } from './db.js';
import { renderChatMarkdown } from './chatFormat.js';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function recordTimestamp(date=new Date()) {
  const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date);
  return parts.replace(' ','_').replace(/:/g,'-')+`-${String(date.getMilliseconds()).padStart(3,'0')}`;
}
export function createChatArchive({root,open,download,onStatus}) {
  let preview=null,lastSavedTime=0;
  async function save(messages){
    if(!messages.length)throw new Error('目前沒有對話可儲存');
    const latest=await db.chatRecords.orderBy('createdAt').last();
    lastSavedTime=Math.max(Date.now(),lastSavedTime+1,(Date.parse(latest?.createdAt)||0)+1);
    const date=new Date(lastSavedTime),filename=`${recordTimestamp(date)}.md`;
    const markdown=`# AI 空間助理對話紀錄\n\n儲存時間：${date.toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}（台灣時間）\n\n`+messages.map(message=>`## ${{user:'使用者',assistant:'AI 空間助理',system:'系統'}[message.role] || '訊息'}\n\n${String(message.content || '')}\n`).join('\n');
    const id=await db.chatRecords.add({filename,createdAt:date.toISOString(),markdown,messageCount:messages.length});
    if(!(await db.chatRecords.get(id)))throw new Error('瀏覽器未能保存紀錄，請檢查儲存空間');
    onStatus(`已儲存 ${filename}，可至工具列「記錄」查看`);return id;
  }
  async function render(){
    const records=await db.chatRecords.orderBy('createdAt').reverse().toArray();
    open('記錄',`<div class="tw-actions"><button data-archive="export-selected">匯出勾選紀錄</button><button data-archive="export-all">匯出全部紀錄</button></div><p class="tw-note">AI 空間助理按「儲存對話」後，Markdown 檔會暫存在目前瀏覽器。點檔名可查看；清除網站資料將刪除暫存，請另行匯出。</p>${records.map(record=>`<article class="tw-card"><label><input type="checkbox" data-record-select value="${record.id}"><button class="tw-record-filename" data-archive="view" data-id="${record.id}">${escape(record.filename)}</button></label><p>${escape(new Date(record.createdAt).toLocaleString('zh-TW'))} · ${record.messageCount} 則訊息</p><div class="tw-actions"><button data-archive="export-one" data-id="${record.id}">匯出紀錄</button><button data-archive="delete" data-id="${record.id}">刪除紀錄</button></div></article>`).join('') || '<p>尚無對話紀錄。</p>'}`);
  }
  async function view(id){
    const record=await db.chatRecords.get(id);if(!record)throw new Error('找不到對話紀錄');
    preview?.remove();preview=document.createElement('section');preview.className='tw-record-preview';preview.setAttribute('aria-label','對話紀錄檢視');
    preview.innerHTML=`<header><span>${escape(record.filename)}</span><button data-record-close aria-label="關閉紀錄">×</button></header><div class="tw-chat-content">${renderChatMarkdown(record.markdown)}</div><footer>可拖曳右下角調整視窗大小。</footer>`;
    preview.querySelector('[data-record-close]').onclick=()=>{preview.remove();preview=null;};root.append(preview);
  }
  async function exportRecords(ids){
    const records=ids ? (await db.chatRecords.bulkGet(ids)).filter(Boolean) : await db.chatRecords.orderBy('createdAt').toArray();
    if(!records.length)throw new Error('請先選擇要匯出的紀錄');
    if(records.length===1)download(new Blob([records[0].markdown],{type:'text/markdown;charset=utf-8'}),records[0].filename);
    else {const zip=new JSZip();for(const record of records)zip.file(record.filename,record.markdown);download(await zip.generateAsync({type:'blob'}),`對話紀錄-${recordTimestamp()}.zip`);}
    onStatus(`已匯出 ${records.length} 筆對話紀錄`);
  }
  const click=async event=>{
    const button=event.target.closest('[data-archive]');if(!button)return;
    try{
      const id=Number(button.dataset.id),action=button.dataset.archive;
      if(action==='view')await view(id);
      if(action==='delete'){await db.chatRecords.delete(id);await render();}
      if(action==='export-one')await exportRecords([id]);
      if(action==='export-all')await exportRecords();
      if(action==='export-selected')await exportRecords([...root.querySelectorAll('[data-record-select]:checked')].map(input=>Number(input.value)));
    }catch(error){onStatus(error.message);}
  };
  root.addEventListener('click',click);
  return {save,render,destroy(){root.removeEventListener('click',click);preview?.remove();}};
}
