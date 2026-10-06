import {PASSENGER_NAMES} from './farePreference.js';
import {normalizeTripRequest,localDateTime,describeTripRequest,locationName} from './transitPlanning.js';
/** Corrections are proposals. Only an explicit user confirmation applies them. */
export function buildTransitRecovery(request,issue,now=Date.now()) {
 const r=normalizeTripRequest(request),reason=String(issue?.message||issue||'目前條件需要確認').slice(0,1600);
 const shift=(value,days)=>value?new Date(Date.parse(value)+days*86400000).toISOString():null;
 const day=new Date(now+8*3600000).toISOString().slice(0,10),start=r.departureTime&&localDateTime(r.departureTime);
 const dated=!!start,past=dated&&Date.parse(r.departureTime)<=now;
 const missing=!locationName(r.origin)||!locationName(r.destination);
 let suggestions;
 if(missing) suggestions=[{label:'補齊完整起終點',description:'請填縣市、站名或地址，保留同行人數、運具與中繼點。',action:'edit'}, {label:'改用表單確認已理解的條件',description:'直接檢查日期、起終點與停留時間，避開外部模型解析。',action:'edit'}, {label:'保留原描述重新理解',description:'重新輪替合適的免費文字模型；不更改票種或猜測班次。',action:'parse'}];
 else if(past||/未指定日期|確認今日|出發時間已過/.test(reason)){
  const tomorrow=new Date(now+8*3600000+86400000).toISOString().slice(0,10),dateOf=v=>v?`${tomorrow}T${localDateTime(v).slice(11)}:00+08:00`:null;
  const departure=new Date(now+15*60000).toISOString(),window=Math.max(60*60000,Date.parse(r.arrivalDeadline)-Date.parse(r.departureTime)||4*3600000);
  suggestions=[{label:'明日同一時段',description:`改為明日 ${start?.slice(11)||'原定時間'} 出發${r.arrivalDeadline?'，抵達期限也移到明日':''}；保留所有中繼點、停留與乘客。`,action:'plan',patch:{timeMode:'departure',departureTime:dateOf(r.departureTime),arrivalDeadline:dateOf(r.arrivalDeadline)}},{label:past?'從現在起重新安排':'確認今日原定時段',description:past?'改為15分鐘後出發，抵達期限依原行程時間窗一起平移；待你確認才查班次。':`確認日期為今日 ${day}，保留原定出發與抵達時間。`,action:'plan',patch:past?{timeMode:'departure',departureTime:departure,arrivalDeadline:r.arrivalDeadline?new Date(Date.parse(departure)+window).toISOString():null}:{}},{label:'自行調整日期與條件',description:'返回已填妥的表單；不會先查班次或自動放寬限制。',action:'edit'}];
 }else suggestions=[{label:'保留條件重查最新班次',description:'保留乘客、票種、運具、中繼點與期限，重新查官方資料。',action:'plan',patch:{}},{label:dated?'比較下一日同時段':'確認具體出發時段',description:dated?'出發與抵達期限移至下一日，其他條件保持原設定。':'改用表單指定日期與時間，可減少查無班次的情形。',action:dated?'plan':'edit',patch:dated?{departureTime:shift(r.departureTime,1),arrivalDeadline:shift(r.arrivalDeadline,1)}:{}},{label:'檢查期限與中繼點',description:'在表單調整可接受條件；官方資料不足、權限或額度問題不能以AI猜測補足。',action:'edit'}];
 const preferred=suggestions.find(x=>x.action==='plan');
 suggestions=[{label:'按你建議執行',description:preferred?'採用「'+preferred.label+'」：'+preferred.description+' 取得方案後自動查核票價、輸出規劃結論並播放 3D 示意。':'先依已填條件嘗試規劃；仍缺少必要地點時會保留條件並說明缺漏。',action:preferred?'execute':'edit',patch:preferred?.patch||{}},...suggestions.slice(1)];
 return {reason,request:r,rateLimit:issue?.rateLimit||null,suggestions,content:`## 旅程條件修正建議\n${reason}\n\n已保留並整理：${describeTripRequest(r)}\n乘客：${r.farePreference.passengerProfiles.map(p=>`${PASSENGER_NAMES[p.type]||p.type} × ${p.quantity}`).join('、')}\n\n${suggestions.map((s,i)=>`${i+1}. **${s.label}**：${s.description}`).join('\n')}\n\n請點選一項，或回覆「採用建議1／2／3」。確認後才會套用條件並重新規劃。`};
}

export function buildTransitPlanConfirmation(result){
 const plan=result.plans[0],request=normalizeTripRequest(result.request);
 const suggestions=[{label:'按你建議執行',description:'採用目前推薦方案；自動查核官方票價，資料不足時標示估算依據，輸出規劃結論並播放 3D 行進示意。',action:'execute',planIndex:0},{label:result.plans.length>1?'採用另一個候選方案':'查看旅程條件',description:result.plans.length>1?'改採已取得的第二個候選方案，確認後查核費用並開始示意。':'返回表單檢查目前時間、運具、中繼點與乘客。',action:result.plans.length>1?'execute':'edit',planIndex:1},{label:'修改條件重新規劃',description:'保留目前輸入，返回表單修改；不會自動刪除中繼點或更改票種。',action:'edit'}];
 return {request,suggestions,reason:'已取得官方候選方案，請確認執行方式。',content:`## 旅程執行建議
目前推薦：${plan.label||plan.id}；${plan.departureTime} → ${plan.arrivalTime}。

${suggestions.map((s,i)=>`${i+1}. **${s.label}**：${s.description}`).join('\n')}

選擇「按你建議執行」即可結束本次討論；仍可在展示視窗停止或切換視角。`};
}
