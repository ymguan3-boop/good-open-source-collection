import {normalizeVoiceText} from './voiceScope.js';
/** Captions use text nodes only. Transcript chunks are joined by role and turn. */
export function createVoiceSubtitles(root){
  const element=document.createElement('section');element.className='tw-voice-subtitles';element.hidden=true;element.setAttribute('aria-label','AI 語音即時字幕');element.setAttribute('aria-live','polite');
  const style=document.createElement('style');style.textContent='.tw-voice-subtitles{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:7000;max-width:calc(100vw - 36px);width:max-content;pointer-events:none;display:grid;gap:4px;font:600 16px/1.5 system-ui;text-shadow:0 1px 3px #000}.tw-voice-subtitles[hidden]{display:none}.tw-voice-subtitles p{margin:0;padding:4px 10px;border-radius:6px;background:#061727df;overflow-wrap:anywhere;max-width:min(900px,calc(100vw - 56px))}.tw-voice-subtitles [data-role=user]{color:#72e5ff}.tw-voice-subtitles [data-role=assistant]{color:#ffe38a}';root.append(style,element);
  let current=null,timer=null;
  function update({role,text,turnId,append=false}){
    if(!['user','assistant'].includes(role)||!String(text||'').trim())return;
    clearTimeout(timer);element.hidden=false;
    if(!current||current.role!==role||current.turnId!==turnId||!append){const row=document.createElement('p');row.dataset.role=role;element.append(row);current={row,role,turnId,text:''};while(element.children.length>2)element.firstElementChild.remove();}
    current.text=(append?current.text:'')+String(text);current.row.textContent=(role==='user'?'你：':'AI：')+normalizeVoiceText(current.text).slice(-1600);
    timer=setTimeout(()=>{element.hidden=true;},18000);
  }
  return {update,destroy(){clearTimeout(timer);element.remove();style.remove();}};
}
