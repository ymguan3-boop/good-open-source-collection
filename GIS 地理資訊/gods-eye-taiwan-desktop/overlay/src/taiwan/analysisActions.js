import {markdownTable} from './selectedLayerAnalysis.js';
import {categorizeAnalysisGaps,analysisGapsMarkdown} from './analysisGaps.js';
/** Registered follow-ups operate on the completed snapshot, with no new network/LLM dependency. */
export function buildAnalysisSuggestions(type,result,{prompt='',conversation=''}={}){
  const intent=prompt+' '+conversation;
  let actions;
  if(type==='layers'){
    const names=(result.targetNames||[]).join('、').slice(0,60)||'已載入圖資';
    const countable=result.rows?.some(r=>r.count!=null);
    const groups=new Map();for(const r of result.rows||[])if(r.count!=null&&!r.partial){const key=r.layer+'／'+r.unit;groups.set(key,(groups.get(key)||0)+1);}
    const comparable=[...groups.values()].some(n=>n>1);
    actions=[
      {action:countable?'layer-counts':'layer-sources',label:countable?`${comparable?'比較':'整理'}「${names}」已計算數量`:'整理已載入圖資與可分析範圍'},
      {action:'layer-gaps',label:'查核本次統計涵蓋與資料缺口'},
      {action:'layer-sources',label:'整理本次來源、版本與統計單位'},
    ];
    if(!countable)actions[2]={action:'layer-counts',label:'列出已有統計與無法計數項目'};
  }else{
    const events=result.compact.events?.length;
    const topic=[...new Set(result.compact.sourceRecords.map(r=>r.project||r.location).filter(Boolean))].join('、').slice(0,40);
    actions=[{action:'record-timeline',label:topic?`比較「${topic}」紀錄時序與內容`:'比較本次紀錄時序與內容'},
      {action:events?'record-events':'record-evidence',label:events?'核對本次攝影機事件與來源紀錄':'核對摘要、原文與媒體的證據涵蓋'},
      {action:'record-gaps',label:'整理本次未確認事項與來源缺口'}];
  }
  if(/缺口|缺漏|未完成|限制/.test(intent))actions.sort((a,b)=>Number(b.action.endsWith('gaps'))-Number(a.action.endsWith('gaps')));
  else if(/來源|版本|證據/.test(intent))actions.sort((a,b)=>Number(/sources|evidence/.test(b.action))-Number(/sources|evidence/.test(a.action)));
  return actions.map(a=>({...a,prompt:a.label}));
}
export const analysisSuggestionsMarkdown=items=>'### 三點查核建議\n\n'+items.map((a,i)=>`${i+1}. ${a.label}：依本次已完成成果整理，點擊後直接回報結果。`).join('\n');
export function executeAnalysisSuggestion(type,r,s){
  if(!s||!buildAnalysisSuggestions(type,r).some(a=>a.action===s.action))throw Error('這項工作未列於本次可執行成果，請重新分析目前資料。');
  let body;
  if(s.action==='layer-counts'){
    body=markdownTable(['範圍','已載入圖資／條件','數量','單位','涵蓋'],(r.rows||[]).map(x=>[x.target,x.layer,x.count??'未知',x.unit,x.partial?'部分資料；不可作完整清冊':'已計算來源範圍']));
    const groups=new Map();for(const x of r.rows||[])if(x.count!=null&&!x.partial){const key=x.layer+'／'+x.unit;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x);}
    const comparison=[...groups.values()].filter(g=>g.length>1).flatMap(g=>{const max=Math.max(...g.map(x=>x.count));return [...g].sort((a,b)=>b.count-a.count).map(x=>[x.layer,x.target,x.count,x.unit,max-x.count]);});
    if(comparison.length)body+='\n\n### 同類來源範圍比較\n\n'+markdownTable(['圖資／條件','範圍','數量','單位','與同組最高數量差額'],comparison);
    body+='\n\n- 只比較相同來源條件、統計單位且已計算的項目，部分涵蓋不列入差額；差額由本次彙整數字計算，未重做空間套疊。數量不等於服務品質，未提供人口時不推論服務不足。';
  }
  if(s.action==='layer-sources')body=markdownTable(['圖資','來源','版本／更新註記','載入圖徵','統計角色'],r.metadata.map(m=>[m.name,m.source,m.sourceTimestamp||'來源未提供',m.features??'服務參照',m.kind==='3d-tiles'?'官方模型中心計數，以本次取得範圍為限':'以本次載入向量計算']))+'\n\n'+markdownTable(['官方建物版本','計算時間','來源指紋'],[[r.buildingVersions?.join('、')||'未提供',r.calculatedAt,r.sourceHash||'未提供']]);
  if(s.action==='layer-gaps')body=markdownTable(['範圍','圖資／條件','查核狀態'],r.rows.map(x=>[x.target,x.layer,x.count==null?'未取得可靠數量':x.partial?'部分涵蓋':'已計算來源範圍']))+'\n\n'+(analysisGapsMarkdown(r.gaps||categorizeAnalysisGaps(r.warnings))||'- 本次引擎未回報額外缺口；此狀態不代表官方清冊全面完整。');
  const records=r.compact?.sourceRecords||[];
  if(s.action==='record-timeline')body=markdownTable(['來源紀錄','儲存時間（臺灣 UTC+08）','專案／地點','內容摘錄'],[...records].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))).map(x=>[`${x.id}：${x.filename}`,new Date(x.createdAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}),[x.project,x.location].filter(Boolean).join('／')||'未記載',x.text.slice(0,220)]))+'\n\n- 時序採紀錄儲存時間，內容摘錄不視為動作已實際完成的證明。';
  if(s.action==='record-evidence')body=markdownTable(['來源紀錄','原文字數','本次摘要字數','影像／影片','證據狀態'],records.map(x=>[x.id,x.rawCharacters,x.text.length,`${x.frameCount||0} 張／${x.hasVideo?'有影片':'未記載影片'}`,x.hash?'有來源指紋；媒體尚未辨識':'來源指紋未提供']))+'\n\n- 本次僅核對文字與附件索引，不宣稱已閱讀全部原文或辨識影像。';
  if(s.action==='record-events')body=markdownTable(['事件','攝影機','事件時間','來源紀錄'],r.compact.events.map(e=>[e.eventType,e.cameraId,e.capturedAt,e.sourceRecordIds.join('、')]))+'\n\n- '+r.compact.eventDeduplication+'；事件依紀錄內容，尚非經人工確認的事實。';
  if(s.action==='record-gaps'){
    const grouped=new Map();
    for(const x of records)for(const text of x.text.split(/[\n。]/).map(t=>t.trim()).filter(t=>/未完成|尚未|缺口|缺漏|待查|待確認|停止|無法|錯誤/.test(t)&&!/^#|^\[|索引[／/]處理|圖磚/.test(t)).slice(0,3)){
      const key=text.replace(/\d+(?:\.\d+)?/g,'#');let item=grouped.get(key);if(!item)grouped.set(key,item={text:text.slice(0,200),ids:new Set()});item.ids.add(x.id);
    }
    const pending=[...grouped.values()].slice(0,30).map(x=>[[...x.ids].join('、'),x.text,'相似敘述已合併；尚待原始證據確認']);
    body=(pending.length?markdownTable(['來源紀錄','未確認事項摘錄','查核狀態'],pending)+'\n\n':'')+(analysisGapsMarkdown(r.gaps)||'- 本次未回報額外缺口，僅能確認已檢索文字範圍。');
  }
  return `## ${s.label}｜執行成果\n\n${body}\n\n- 已完成本次成果快照的整理與核對；沿用原分析來源，未另行推估或載入未勾選資料。`;
}
