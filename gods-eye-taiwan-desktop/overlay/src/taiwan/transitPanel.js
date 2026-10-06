import {transitMessageIntent,transitConfirmationIndex,transitServiceText} from './transitAssistant.js';
import {distinctTransitColor} from './routeColors.js';
import {browserAi,streamTransitParse} from './browserAi.js';
import {PASSENGER_NAMES,SEAT_NAMES,vehicleAllowed,groupOfficialVehicleTypes} from './farePreference.js';
import {TRA_TRAIN_TYPES} from './transitPlanning.js';
import {TRANSIT_MODES,TRANSIT_PREFERENCES,TRANSIT_EXAMPLES,normalizeTripRequest,patchTripRequest,validateTripRequest,tripLocationEntries,setTripLocation,moveWaypoint,locationName,hasCoordinates,taiwanDateTime,localDateTime,describeTripRequest,normalizeTransitStyle,fareText,timeText} from './transitPlanning.js';

import {buildTransitRecovery,buildTransitPlanConfirmation} from './transitRecovery.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STATUS={scheduled:'表定資料',dynamic:'動態／近即時資料',unknown:'資料狀態未提供',historical:'歷史資料'};
const storageKey='gev.tw.transitStyle';
const clone=value=>structuredClone(value);
const minutes=value=>Number.isFinite(value)?`${Math.ceil(value/60)} 分鐘`:'未提供';
const distance=value=>Number.isFinite(value)?value>=1000?`${(value/1000).toFixed(1)} 公里`:`${Math.round(value)} 公尺`:'未提供';
function readStyle(){try{return normalizeTransitStyle(JSON.parse(localStorage.getItem(storageKey)||'{}'));}catch{return normalizeTransitStyle();}}

/** One TripPlanningRequest powers both inputs; no map-based trip input exists. */
export function createTransitPanel({manager,viewer,onPlan=()=>{},onExplain=()=>{},onError=()=>{},onRecovery=()=>{},onProgress=()=>{},getDrivingColor=()=> '#369cff'}) {
  if(!manager?.create)throw new Error('大眾運輸視窗需要共用浮動視窗管理器');
  let request=normalizeTripRequest(),tab='form',style=readStyle(),results=null,selectedPlan=null,journey=null,journeyState={},pending=null,busy=false,destroyed=false,operation=0,abort=null,revision=0,dragIndex=null,parsed=false,parsedRefresh=false,naturalDirty=false,questions=[],waypointSequence=0,recovery=null,recoverySequence=0,executionRequested=false,lastIssue=null;
  let fareOptions={vehicleTypes:[],hsrSeatClasses:[],passengerTypes:[{id:'adult',name:PASSENGER_NAMES.adult}],notices:[]},fareLoaded=false;
  const panel=manager.create({id:'transit-planning',title:'AI 智慧大眾運輸',width:450,height:650,onClose:()=>{cancel();return journey?.stop?.();},onHelp:()=>{panel.restore();panel.body.querySelector('[data-transit-help]').open=true;}});
  panel.body.classList.add('tw-transit');
  function status(message){if(destroyed)return;panel.body.querySelector('[data-transit-status]').textContent=message;panel.setSummary(busy?'規劃中':selectedPlan?.label||'旅程規劃');onProgress({message,busy});}
  function fail(error){if(destroyed||error?.name==='AbortError')return;lastIssue={message:error.message,code:error.code,status:error.status,rateLimit:error.rateLimit};executionRequested=false;proposeRecovery(error);}
  function proposeRecovery(issue){
    if(destroyed)return;busy=false;recovery={...buildTransitRecovery(request,issue),id:String(++recoverySequence),revision};status('已整理三點修正建議，請在 AI 空間助理確認後繼續。');renderBusy();onRecovery(clone(recovery));
  }
  async function confirmRecovery(id,index){
    if(busy)throw new Error('目前規劃仍在執行，完成後會自動回報。');
    if(!recovery||recovery.id!==String(id)||recovery.revision!==revision)throw new Error('此建議已失效，請依目前旅程條件重新規劃。');
    const suggestion=recovery.suggestions[index];if(!suggestion)throw new Error('請選擇建議1、2或3');recovery=null;
    if(suggestion.action==='execute'&&results?.offerId&&Number.isInteger(suggestion.planIndex))return executeConfirmed(suggestion.planIndex);
    if(suggestion.action==='execute')executionRequested=true;
    if(suggestion.action==='edit'){tab='form';renderForm();renderTabs();panel.restore();status('請修改已保留的旅程條件，再按規劃。');return {handled:true,editing:true};}
    request=patchTripRequest(request,suggestion.patch||{});revision++;questions=[];renderForm();renderTabs();
    try{if(suggestion.action==='parse')return await parse(request.userNaturalLanguage,{followup:true,refresh:true});naturalDirty=false;return await plan(true);}catch(error){fail(error);return {handled:true,error:error.message};}
  }
  function cancel(){executionRequested=false;recovery=null;operation++;abort?.abort();abort=null;busy=false;pending=null;if(!destroyed)panel.body.querySelector('[data-transit-candidates]').hidden=true;renderBusy();}
  function start(message){abort?.abort();abort=new AbortController();const token=++operation;busy=true;status(message);renderBusy();return {token,signal:abort.signal,revision};}
  function live(work){return !destroyed&&!work.signal.aborted&&operation===work.token&&revision===work.revision;}
  function finish(work){if(operation===work.token){busy=false;renderBusy();onProgress({busy:false,message:panel.body.querySelector('[data-transit-status]').textContent});}}
  function renderBusy(){if(destroyed)return;panel.body.querySelectorAll('[data-transit-busy]').forEach(button=>{button.disabled=busy;});panel.body.querySelector('[data-transit-action="cancel"]').hidden=!busy;}
  function edit(patch){cancel();revision++;parsed=false;parsedRefresh=false;questions=[];if(Object.hasOwn(patch,'userNaturalLanguage'))naturalDirty=true;request=patchTripRequest(request,patch);renderUnderstanding();}
  panel.body.innerHTML=`<div class="tw-transit-tabs" role="tablist" aria-label="旅程輸入方式"><button type="button" role="tab" data-transit-tab="form">表單輸入</button><button type="button" role="tab" data-transit-tab="natural">AI 自然語言</button></div>
  <div data-transit-form></div><div data-transit-natural hidden><label>用白話描述旅程<textarea rows="5" data-transit-nlp placeholder="例如：明天下午3點從宜蘭縣政府到台北101，晚上6點以前到，不搭高鐵。"></textarea></label><small>AI 只理解條件；班次、路線與票價由運輸資料服務提供。</small><details><summary>不知道怎麼輸入？可以參考以下範例</summary><div class="tw-transit-examples">${TRANSIT_EXAMPLES.map(([name,text],index)=>`<button type="button" data-transit-example="${index}" title="${escape(text)}">範例 ${index+1}｜${escape(name)}</button>`).join('')}</div></details></div>
   <details data-fare-preferences><summary>乘車與票價偏好（成人／全票 × 1；臺鐵全部可搭）</summary><div data-fare-fields></div></details>
   <div data-transit-understanding class="tw-transit-understanding"></div>
  <div class="tw-transit-actions"><button type="button" data-transit-action="plan" data-transit-busy>依最新交通資訊進行AI規劃</button><button type="button" data-transit-action="cancel" hidden>取消規劃</button></div>
  <p role="status" aria-live="polite" data-transit-status>先輸入旅程條件；表單規劃不需要 AI Key，公共運輸資料需在既有 API 設定啟用 TDX。</p>
  <div data-transit-candidates hidden></div><div data-transit-results></div>
  <details data-transit-help><summary>功能與操作說明</summary><ol><li>在表單填入起終點、時間與中繼點，或切至 AI 自然語言輸入白話需求。</li><li>按「依最新交通資訊進行AI規劃」。自然語言接續理解與查詢；只在缺少條件或同名地點時要求補充／選擇。</li><li>閱讀方案的班表／動態來源、步行、轉乘與票價，結果直接送至 AI 空間助理，推薦方案自動顯示於原 3D 地圖。</li><li>路線示意為規劃路徑，不代表實際車輛定位；顏色與粗細可在本視窗調整。</li><li>在原 AI 空間助理提出晚出發、不搭高鐵、少走路等修改，沿用目前旅程條件重新規劃。</li></ol><p>地圖只顯示結果，不提供地圖點選輸入。未提供的票價、班次、即時位置與路徑不由 AI 猜測。縮小或隱藏保留工作；關閉取消規劃並停止模擬。TDX 失敗不影響行車導航、CCTV 或其他 GIS 功能。</p></details>`;
  const root=panel.body;
  function renderForm(){
    const r=request;
    root.querySelector('[data-transit-form]').innerHTML=`<label>起點<input type="text" data-trip-field="origin" value="${escape(locationName(r.origin))}" placeholder="地址、地標、車站或機關" autocomplete="off"></label>
    <fieldset><legend>時間條件</legend><div class="tw-transit-time-modes">${[['now','現在出發'],['departure','指定出發時間'],['arrival','指定抵達時間']].map(([mode,label])=>`<label><input type="radio" name="tw-transit-time" data-trip-field="timeMode" value="${mode}" ${r.timeMode===mode?'checked':''}>${label}</label>`).join('')}</div>
    <label data-transit-departure ${r.timeMode==='now'||r.timeMode==='arrival'?'hidden':''}>出發日期與時間<input type="datetime-local" data-trip-field="departureTime" value="${escape(localDateTime(r.departureTime))}"></label>
    <label>最晚抵達日期與時間${r.timeMode==='arrival'?'':'（選填）'}<input type="datetime-local" data-trip-field="arrivalDeadline" value="${escape(localDateTime(r.arrivalDeadline))}"></label></fieldset>
    <div class="tw-transit-waypoints" data-transit-waypoints>${r.waypoints.map((item,index)=>`<fieldset data-waypoint="${index}" draggable="true"><legend>中繼點 ${index+1}（可拖曳排序）</legend><label>地點<input type="text" data-waypoint-field="location" data-index="${index}" value="${escape(locationName(item.location))}" placeholder="輸入地名搜尋"></label><div class="tw-transit-grid"><label>預計抵達（選填）<input type="datetime-local" data-waypoint-field="arrivalTime" data-index="${index}" value="${escape(localDateTime(item.arrivalTime))}"></label><label>預計出發（選填）<input type="datetime-local" data-waypoint-field="departureTime" data-index="${index}" value="${escape(localDateTime(item.departureTime))}"></label></div><label>停留時間（分鐘）<input type="number" min="0" max="10080" data-waypoint-field="stayDurationMinutes" data-index="${index}" value="${item.stayDurationMinutes}"></label><div class="tw-transit-actions"><button type="button" data-transit-action="waypointUp" data-index="${index}" ${index===0?'disabled':''} aria-label="中繼點 ${index+1} 上移">↑</button><button type="button" data-transit-action="waypointDown" data-index="${index}" ${index===r.waypoints.length-1?'disabled':''} aria-label="中繼點 ${index+1} 下移">↓</button><button type="button" data-transit-action="removeWaypoint" data-index="${index}">刪除中繼點</button></div></fieldset>`).join('')}</div><button type="button" data-transit-action="addWaypoint">＋加入中繼點</button>
    <label>終點<input type="text" data-trip-field="destination" value="${escape(locationName(r.destination))}" placeholder="地址、地標、車站或機關" autocomplete="off"></label><label>規劃偏好<select data-trip-field="preference">${Object.entries(TRANSIT_PREFERENCES).map(([id,label])=>`<option value="${id}" ${id===r.preference?'selected':''}>${label}</option>`).join('')}</select></label>
    <fieldset><legend>允許交通工具</legend><div class="tw-transit-modes">${Object.entries(TRANSIT_MODES).map(([mode,label])=>`<label><input type="checkbox" data-trip-mode="${mode}" ${r.allowedModes.includes(mode)?'checked':''}>${label}</label>`).join('')}</div></fieldset>
     `;
    renderFarePreferences();
  }
  function renderFarePreferences(){
    const pref=request.farePreference,tra=pref.modePreferences.TRA,hsr=pref.modePreferences.HSR,selected=tra.vehicleTypes;
    const passengers=fareOptions.passengerTypes.filter(p=>Object.hasOwn(PASSENGER_NAMES,p.id));
    const matches=v=>selected.length>0&&vehicleAllowed(v.name,v.id,tra);
    const hasPremium=fareOptions.vehicleTypes.some(v=>matches(v)&&v.seatClasses?.includes('premium'));
    const groups=groupOfficialVehicleTypes(fareOptions.vehicleTypes);
    const vehicles=groups.map(g=>{const all=g.types.every(matches),ids=g.types.map(v=>v.id).join(',');return `<div class="tw-fare-vehicle-group"><label class="tw-fare-check"><input type="checkbox" data-fare-vehicle="${escape(ids)}" ${all?'checked':''}>${escape(g.name)}</label>${g.types.length>1?`<details><summary>細分官方車種（${g.types.length}）</summary>${g.types.map(v=>`<label class="tw-fare-check"><input type="checkbox" data-fare-vehicle="${escape(v.id)}" ${matches(v)?'checked':''}>${escape(v.name)} <small>${escape(v.id)}</small></label>`).join('')}</details>`:''}</div>`;}).join('');
    root.querySelector('[data-fare-preferences]>summary').textContent=`乘車與票價偏好（${pref.passengerProfiles.map(p=>`${PASSENGER_NAMES[p.type]} × ${p.quantity}`).join('、')}${request.allowedModes.includes('TRA')?selected.length?'；臺鐵已限制車種':'；臺鐵全部可搭':''}）`;
    root.querySelector('[data-fare-fields]').innerHTML=`<fieldset><legend>乘客票種與人數</legend>${pref.passengerProfiles.map((p,i)=>`<div class="tw-fare-passenger"><select data-fare-passenger="type" data-index="${i}" aria-label="乘客票種 ${i+1}">${[...passengers,...(!passengers.some(x=>x.id===p.type)?[{id:p.type,name:PASSENGER_NAMES[p.type]}]:[])].map(t=>`<option value="${t.id}" ${p.type===t.id?'selected':''}>${escape(t.name)}</option>`).join('')}</select><input type="number" min="1" max="99" value="${p.quantity}" data-fare-passenger="quantity" data-index="${i}" aria-label="乘客人數 ${i+1}">${i?`<button type="button" data-transit-action="removePassenger" data-index="${i}" aria-label="刪除乘客票種 ${i+1}">×</button>`:''}</div>`).join('')}<button type="button" data-transit-action="addPassenger" ${pref.passengerProfiles.length>=passengers.length?'disabled':''}>＋不同票種乘客</button><small>票種依官方來源提供；實際優惠資格仍以運輸業者規定及現場驗證為準。</small></fieldset>
    ${request.allowedModes.includes('TRA')?`<fieldset><legend>臺鐵允許列車</legend><label class="tw-fare-check"><input type="checkbox" data-fare-all ${!selected.length?'checked':''}>全部可搭</label><details data-fare-vehicle-list ${selected.length?'open':''}><summary>限制可搭列車（官方清單）</summary><div class="tw-fare-vehicles">${vehicles}</div></details>${!fareOptions.vehicleTypes.length?'<small>正在取得官方車種清單；未取得時全部可搭，指定需求會依實際班次核對。</small>':''}${hasPremium?`<label>臺鐵座位／車廂<select data-fare-seat="TRA"><option value="normal">一般座位</option><option value="premium" ${tra.seatClasses.includes('premium')?'selected':''}>特殊／騰雲座艙</option></select></label>`:''}</fieldset>`:''}
    ${request.allowedModes.includes('HSR')?`<fieldset><legend>高鐵允許車廂（多選即可比較）</legend><div class="tw-transit-modes">${fareOptions.hsrSeatClasses.map(id=>`<label><input type="checkbox" data-fare-hsr="${id}" ${(hsr.seatClasses.length?hsr.seatClasses.includes(id):id==='standard')?'checked':''}>${SEAT_NAMES[id]}</label>`).join('')}</div>${!fareOptions.hsrSeatClasses.length?'<small>尚未取得官方可用車廂資料，不顯示未核實選項。</small>':''}<small>一般票價；優惠票價需視實際班次與購票條件確認。自由座為班次示意，未保證座位。</small></fieldset>`:''}
    ${request.allowedModes.some(m=>['BUS','METRO','LRT'].includes(m))?'<small>公車依實際路線、業者與計費區間；捷運／輕軌依起訖站官方票價，不建立不存在的車種選擇。</small>':''}
    ${request.allowedModes.includes('BIKE')?'<small>公共自行車依已核實系統、租借時間與官方費率；不假設會員或地方補助適用。</small>':''}
    ${request.allowedModes.some(m=>['BUS','METRO','LRT'].includes(m))?`<label>公車／捷運／輕軌票證<select data-fare-media>${(fareOptions.fareMedia||[{id:'single',name:'一般單程票'}]).map(m=>`<option value="${escape(m.id)}" ${pref.fareMedia[0]===m.id?'selected':''}>${escape(m.name)}</option>`).join('')}</select></label>`:''}<small>${fareOptions.notices.map(escape).join('；')}</small>`;
  }
  async function loadFareOptions(){if(fareLoaded)return;fareLoaded=true;try{fareOptions=await browserAi('/tdx',{method:'POST',data:{action:'fare-options'}});if(!destroyed)renderFarePreferences();}catch{fareLoaded=false;}}
  function renderUnderstanding(){
    const box=root.querySelector('[data-transit-understanding]');
    box.innerHTML=`<strong>${parsed?'AI 已理解您的需求':'目前旅程條件'}</strong><p>${escape(describeTripRequest(request))}</p>${questions.length?`<p class="tw-transit-warning">${questions.map(escape).join('；')}</p>`:''}`;
    renderBusy();
  }
  function renderTabs(){
    root.dataset.inputMode=tab;
    root.querySelector('[data-transit-form]').hidden=tab!=='form';root.querySelector('[data-transit-natural]').hidden=tab!=='natural';
    root.querySelectorAll('[data-transit-tab]').forEach(button=>{button.setAttribute('aria-selected',String(button.dataset.transitTab===tab));});
    root.querySelector('[data-transit-nlp]').value=request.userNaturalLanguage;
    renderUnderstanding();
  }
  async function parse(text,{followup=false,refresh=false}={}){
    if(!text.trim())throw new Error('請輸入旅程描述');
    const work=start('正在理解旅程條件…');
    try{
      const response=await streamTransitParse({text,request:clone(request)},{signal:work.signal,onStatus:message=>{if(live(work))status(message);}});
      if(!live(work))return {cancelled:true};
      if(response.intent==='explain'){if(results?.plans?.length){await onExplain({...clone(results),request:clone(request)},{signal:work.signal});recovery={...buildTransitPlanConfirmation(results),id:String(++recoverySequence),revision};onRecovery(clone(recovery));}else proposeRecovery(lastIssue||new Error('目前尚無可執行官方方案；請確認已保留條件後查詢。'));return {handled:true,intent:'explain'};}
      if(!response.request&&!response.patch&&!response.needsClarification)throw new Error('AI 未回傳可確認的旅程條件，請改用表單或重新描述');
      request=response.request?normalizeTripRequest(response.request):patchTripRequest(request,response.patch||{});
      request.userNaturalLanguage=text;parsedRefresh=refresh;naturalDirty=false;questions=(Array.isArray(response.questions)?response.questions:[]).map(String);parsed=true;pending=null;
      if(response.needsClarification&&!questions.length)questions=['請補充起終點或時間條件，再重新規劃。'];
      renderForm();renderTabs();
       status(questions.length?'AI 需要補充條件；請修改表單或描述後再規劃。':'AI 已理解您的需求，接續查詢最新運輸資訊。');
      if(questions.length){proposeRecovery(new Error(questions.join('；')));return clone(response);}
      if(followup&&!questions.length){finish(work);return plan(refresh||response.intent==='replan');}
      return clone(response);
    }finally{finish(work);}
  }
  async function plan(refresh=false){
    const errors=validateTripRequest(request);if(request.departureTime&&Date.parse(request.departureTime)<Date.now())errors.push('指定出發時間已過，請確認新的出發日期。');if(errors.length)throw new Error(errors.join('；'));
    lastIssue=null;const work=start('正在解析地點與查詢運輸方案…');
    try{
      for(const item of tripLocationEntries(request)){
        if(hasCoordinates(item.value))continue;
        const response=await browserAi('/tdx',{method:'POST',data:{action:'resolve',query:locationName(item.value)},signal:work.signal});
        if(!live(work))return {cancelled:true};
        const candidates=Array.isArray(response.results)?response.results.filter(hasCoordinates):[];
        if(!candidates.length)throw new Error(`${item.label}「${locationName(item.value)}」找不到可靠位置。請補上縣市、地址或完整站名。`);
        if(response.needsSelection||candidates.length>1){pending={key:item.key,label:item.label,query:locationName(item.value),candidates,refresh,revision};renderCandidates();status(`${item.label}有多個候選，請選擇正確地點再繼續。`);return {needsSelection:true,candidates:clone(candidates)};}
        request=setTripLocation(request,item.key,candidates[0]);
      }
      const resolvedErrors=validateTripRequest(request,{resolved:true});if(resolvedErrors.length)throw new Error(resolvedErrors.join('；'));
      const response=await browserAi('/tdx',{method:'POST',data:{action:'plan',request:clone(request),refresh},signal:work.signal});
      if(!live(work))return {cancelled:true};
      if(response.needsClarification){
        results={...response,plans:[]};questions=(response.questions||[]).map(String);parsed=true;renderUnderstanding();
        proposeRecovery(new Error(questions.join('；')||'請先補充旅程需求。'));return clone(results);
      }
      if(response.needsSelection){
        const unresolved=response.unresolvedLocations?.find(item=>Array.isArray(item.results)&&item.results.some(hasCoordinates));
        const entries=tripLocationEntries(request),entry=entries[unresolved?.index]||entries.find(item=>locationName(item.value)===unresolved?.query);
        if(!entry||!unresolved)throw new Error('運輸服務需要確認地點，請補上完整縣市、地址或站名後再規劃。');
        pending={key:entry.key,label:entry.label,query:unresolved.query,candidates:unresolved.results.filter(hasCoordinates),refresh,revision};renderCandidates();status('運輸服務找到多個候選地點，請選擇後繼續。');return {needsSelection:true,candidates:clone(pending.candidates)};
      }
      results={...response,request:clone(request),plans:Array.isArray(response.plans)?response.plans:[]};
      if(response.request)request=normalizeTripRequest(response.request);
      pending=null;root.querySelector('[data-transit-candidates]').hidden=true;renderForm();renderUnderstanding();renderResults();
      if(!results.plans.length){if(executionRequested){executionRequested=false;results.conclusion=true;results.notices=['規劃結論：目前官方服務未提供符合已確認條件的旅程。沒有可核實路徑，因此無法啟動行進示意。',...(response.notices||[])];await onExplain(clone(results),{signal:work.signal,conclusion:true});}proposeRecovery(new Error((response.notices||[]).join('；')||'目前查不到符合條件的官方運輸方案。'));return clone(results);}
      await choosePlan(0);if(!live(work))return {cancelled:true};
      if(executionRequested){finish(work);return await executePlan(0);}
      await onExplain(clone(results),{signal:work.signal});if(live(work))status(`已取得 ${results.plans.length} 個可靠資料方案，結果已送至 AI 空間助理。`);
      recovery={...buildTransitPlanConfirmation(results),id:String(++recoverySequence),revision};onRecovery(clone(recovery));
      return clone(results);
    }finally{finish(work);}
  }
  async function executePlan(index=0){
    if(!results?.offerId)throw new Error('目前沒有可確認的官方方案，請先規劃。');
    recovery=null;executionRequested=false;const work=start('正在確認方案、查核官方票價與估算依據…');
    try{const response=await browserAi('/tdx',{method:'POST',data:{action:'execute-plan',offerId:results.offerId,index},signal:work.signal});
      if(!live(work))return {cancelled:true};results={...response,request:clone(request)};await onExplain({...clone(results),displayPending:true},{signal:work.signal,conclusion:true});status('班次與票價查核已完成，規劃結論已回報；正在準備地圖示意…');let display;try{display=await choosePlan(0,{execute:true});}catch(error){display={animationStarted:false,animationNotice:error.message};}results.animationStarted=display?.animationStarted===true;if(display?.animationNotice)results.notices=[...(results.notices||[]),'3D 旅程尚未開始：'+display.animationNotice];if(!live(work))return {cancelled:true};
      await onExplain(clone(results),{signal:work.signal,conclusion:true});status(results.animationStarted?'規劃結論已送至 AI 空間助理，3D 旅程示意已開始。':'規劃結論已送至 AI 空間助理；請查看旅程展示視窗的狀態。');return {handled:true,conclusion:true,...clone(results)};
    }catch(error){if(live(work)){status('執行未完成：'+error.message);await onExplain({conclusion:true,plans:[],serviceError:{code:error.code,status:error.status,rateLimit:error.rateLimit},notices:['規劃結論：未能執行目前方案。'+error.message],request:clone(request)},{conclusion:true});}throw error;}finally{finish(work);}
  }
  async function executeConfirmed(index){try{return await executePlan(index);}catch(error){fail(error);return {handled:true,error:error.message};}}
  function synchronizeColor(){const adjusted=distinctTransitColor(style.color,getDrivingColor());if(adjusted!==style.color){style={...style,color:adjusted};try{localStorage.setItem(storageKey,JSON.stringify(style));}catch{}const field=root.querySelector('[data-transit-style="color"]');if(field)field.value=adjusted;journey?.setStyle?.(clone(style));}return clone(style);}
  function renderCandidates(){
    const box=root.querySelector('[data-transit-candidates]');box.hidden=!pending;if(!pending)return;
    box.innerHTML=`<h3>請確認${escape(pending.label)}「${escape(pending.query)}」</h3><div class="tw-transit-candidates">${pending.candidates.map((item,index)=>`<button type="button" data-transit-candidate="${index}"><strong>${escape(item.name)}</strong><span>${escape(item.address||'未提供地址')} · ${escape(item.type||'地點')}</span><small>來源：${escape(item.source||'未提供')}｜${item.lat.toFixed(5)}, ${item.lon.toFixed(5)}</small></button>`).join('')}</div>`;
  }
  function renderResults(){
    // One shared assistant presents the plans; this window keeps only trip input and style.
    root.querySelector('[data-transit-results]').innerHTML=results?.plans?.length?`<p class="tw-transit-result-note">規劃結果已送至 AI 空間助理，推薦方案已顯示於地圖。</p><div class="tw-transit-grid"><label>旅程路線顏色<input type="color" data-transit-style="color" value="${style.color}"></label><label>旅程路線粗細<input type="range" min="1" max="12" step="1" data-transit-style="width" value="${style.width}"><output data-transit-width>${style.width} px</output></label></div>`:'';
  }
  async function choosePlan(index,{execute=false}={}){
    const plan=results?.plans?.[index];if(!plan)throw new Error('此方案不存在，請重新規劃');
    selectedPlan=plan;
    let outcome;try{const controller=await onPlan(clone(plan),{request:clone(request),style:synchronizeColor(),execute});if(controller?.play)setJourneyController(controller);outcome=controller;}
    catch(error){if(execute)throw error;fail(new Error(`運輸方案已保留，但 3D 旅程無法顯示：${error.message}`));}
    root.querySelectorAll('[data-transit-plan]').forEach(element=>element.classList.toggle('is-selected',Number(element.dataset.transitPlan)===index));
    renderJourney();return outcome;
  }
  function renderJourney(){
    const section=root.querySelector('[data-transit-journey]');if(!section)return;
    section.querySelectorAll('button,select').forEach(element=>{element.disabled=!journey||!selectedPlan;});
    section.querySelector('[data-transit-speed]').value=String(journeyState.speed||1);
    section.querySelector('[data-transit-view]').value=journeyState.view||'free';
    section.querySelector('[data-transit-journey-status]').textContent=selectedPlan?`${selectedPlan.label||'目前方案'}｜${journeyState.status||'行程模擬'}${Number.isInteger(journeyState.segmentIndex)?`｜第 ${journeyState.segmentIndex+1} 段`:''}${journeyState.simulatedTime?`｜規劃時刻 ${timeText(journeyState.simulatedTime)}`:''}`:'選取方案後可模擬旅程。';
    section.querySelector('[data-transit-timeline]').innerHTML=(selectedPlan?.segments||[]).map((segment,index)=>`<li ${index===journeyState.segmentIndex?'aria-current="step"':''}>${escape(TRANSIT_MODES[segment.mode]||segment.mode)} ${escape(locationName(segment.from))} → ${escape(locationName(segment.to))}<small>${escape(timeText(segment.departureTime))} → ${escape(timeText(segment.arrivalTime))}</small></li>`).join('');
  }
  function setJourneyController(controller){journey=controller;journeyState={};renderJourney();}
  async function execute(action,index){
    if(action==='cancel'){cancel();status('已取消此次規劃，原旅程條件與已取得方案保留。');return;}
    if(action==='plan'||action==='refresh'){if(tab==='natural'&&naturalDirty)await parse(request.userNaturalLanguage,{followup:true,refresh:true});else{if(questions.length)throw new Error('請先補充待確認條件');await plan(true);}return;}
    if(action==='confirm'){if(questions.length)throw new Error('請先補充待確認條件');await plan(parsedRefresh);return;}
    if(action==='modify'){tab='form';renderTabs();return;}
    if(action==='addPassenger'){const pref=clone(request.farePreference),next=[...fareOptions.passengerTypes].sort((a,b)=>Number(b.id==='child')-Number(a.id==='child')).find(t=>!pref.passengerProfiles.some(p=>p.type===t.id));if(next){pref.passengerProfiles.push({type:next.id,quantity:1});edit({farePreference:pref});renderFarePreferences();}return;}
    if(action==='removePassenger'){const pref=clone(request.farePreference);pref.passengerProfiles.splice(index,1);edit({farePreference:pref});renderFarePreferences();return;}
    if(action==='addWaypoint'){edit({waypoints:[...request.waypoints,{id:`waypoint-ui-${Date.now()}-${++waypointSequence}`,location:'',stayDurationMinutes:0}]});renderForm();return;}
    if(action==='removeWaypoint'){edit({waypoints:request.waypoints.filter((_,i)=>i!==index)});renderForm();return;}
    if(action==='waypointUp'||action==='waypointDown'){request=moveWaypoint(request,index,index+(action==='waypointUp'?-1:1));edit({waypoints:request.waypoints});renderForm();return;}
    if(action==='selectPlan'){await choosePlan(index);return;}
    if(['play','pause','previous','next','stop'].includes(action)){if(!journey?.[action])throw new Error('旅程模擬尚未就緒');await journey[action]();}
  }
  const click=event=>{
    const target=event.target.closest('button');if(!target)return;
    if(target.dataset.transitTab){tab=target.dataset.transitTab;renderForm();renderTabs();return;}
    if(target.hasAttribute('data-transit-example')){edit({userNaturalLanguage:TRANSIT_EXAMPLES[Number(target.dataset.transitExample)][1]});root.querySelector('[data-transit-nlp]').value=request.userNaturalLanguage;status('範例已填入，可修改後按「依最新交通資訊進行AI規劃」。');return;}
    if(target.hasAttribute('data-transit-candidate')){const selection=pending;if(!selection||selection.revision!==revision)return;request=setTripLocation(request,selection.key,selection.candidates[Number(target.dataset.transitCandidate)]);pending=null;root.querySelector('[data-transit-candidates]').hidden=true;renderForm();renderUnderstanding();void plan(selection.refresh).catch(fail);return;}
    if(target.dataset.transitAction)void execute(target.dataset.transitAction,Number(target.dataset.index)).catch(fail);
  };
  const input=event=>{
    const target=event.target;
    if(target.hasAttribute('data-transit-nlp')){edit({userNaturalLanguage:target.value});return;}
    if(target.hasAttribute('data-fare-all')||target.hasAttribute('data-fare-vehicle')||target.hasAttribute('data-fare-hsr')||target.dataset.fareSeat||target.hasAttribute('data-fare-media')||target.dataset.farePassenger){
      try{const pref=clone(request.farePreference);
        if(target.hasAttribute('data-fare-all')){pref.modePreferences.TRA.vehicleTypes=target.checked?[]:fareOptions.vehicleTypes.map(v=>v.id);pref.modePreferences.TRA.excludedVehicleTypes=[];}
        if(target.hasAttribute('data-fare-vehicle')){const p=pref.modePreferences.TRA,ids=target.dataset.fareVehicle.split(','),chosen=new Set(p.vehicleTypes.length?fareOptions.vehicleTypes.filter(v=>vehicleAllowed(v.name,v.id,p)).map(v=>v.id):[]);for(const id of ids)target.checked?chosen.add(id):chosen.delete(id);if(!chosen.size){target.checked=true;status('請至少選一種列車，或選「全部可搭」。');return;}p.vehicleTypes=[...chosen];p.excludedVehicleTypes=[];}
        if(target.hasAttribute('data-fare-hsr')){const selected=[...root.querySelectorAll('[data-fare-hsr]:checked')].map(x=>x.dataset.fareHsr);if(!selected.length){target.checked=true;status('請至少允許一種高鐵車廂。');return;}pref.modePreferences.HSR.seatClasses=selected;}
        if(target.dataset.fareSeat)pref.modePreferences[target.dataset.fareSeat].seatClasses=[target.value];
        if(target.hasAttribute('data-fare-media'))pref.fareMedia=[target.value];
        if(target.dataset.farePassenger){const p=pref.passengerProfiles[Number(target.dataset.index)];p[target.dataset.farePassenger]=target.dataset.farePassenger==='quantity'?Number(target.value):target.value;}
        delete pref.railVehicleTypes;delete pref.seatClasses;
        edit({farePreference:pref,traTrainType:'any'});if(!target.dataset.farePassenger||target.dataset.farePassenger==='type')renderFarePreferences();
      }catch(e){status(e.message);}return;
    }
    if(target.dataset.tripField){const field=target.dataset.tripField;if(field==='timeMode'&&!target.checked)return;const value=['departureTime','arrivalDeadline'].includes(field)?taiwanDateTime(target.value):target.value;const patch={[field]:value};if(field==='timeMode'&&value==='now')patch.departureTime=null;if(field==='timeMode'&&value==='arrival')patch.departureTime=null;edit(patch);if(field==='timeMode')renderForm();return;}
    if(target.dataset.waypointField){const points=clone(request.waypoints),item=points[Number(target.dataset.index)];if(!item)return;const field=target.dataset.waypointField;item[field]=field==='location'?target.value:field==='stayDurationMinutes'?Number(target.value):taiwanDateTime(target.value);edit({waypoints:points});return;}
    if(target.dataset.tripMode){const allowed=Object.keys(TRANSIT_MODES).filter(mode=>root.querySelector(`[data-trip-mode="${mode}"]`).checked);edit({allowedModes:allowed});renderForm();return;}
    if(target.dataset.transitStyle){style=normalizeTransitStyle({...style,[target.dataset.transitStyle]:target.value});synchronizeColor();try{localStorage.setItem(storageKey,JSON.stringify(style));}catch{}root.querySelector('[data-transit-width]').textContent=`${style.width} px`;if(journey?.setStyle)journey.setStyle(clone(style));else if(selectedPlan)void onPlan(clone(selectedPlan),{request:clone(request),style:clone(style)}).catch(fail);return;}
    if(target.hasAttribute('data-transit-speed')){void Promise.resolve(journey?.setSpeed?.(Number(target.value))).catch(fail);return;}
    if(target.hasAttribute('data-transit-view'))void Promise.resolve(journey?.setView?.(target.value)).catch(fail);
  };
  const dragStart=event=>{if(event.target.closest('input,button,select,textarea')){event.preventDefault();return;}const item=event.target.closest('[data-waypoint]');if(!item)return;dragIndex=Number(item.dataset.waypoint);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(dragIndex));};
  const dragOver=event=>{if(dragIndex===null||!event.target.closest('[data-waypoint]'))return;event.preventDefault();event.dataTransfer.dropEffect='move';};
  const drop=event=>{const item=event.target.closest('[data-waypoint]');if(dragIndex===null||!item)return;event.preventDefault();const to=Number(item.dataset.waypoint),from=dragIndex;dragIndex=null;edit({waypoints:moveWaypoint(request,from,to).waypoints});renderForm();};
  const dragEnd=()=>{dragIndex=null;};
  root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('change',input);root.addEventListener('dragstart',dragStart);root.addEventListener('dragover',dragOver);root.addEventListener('drop',drop);root.addEventListener('dragend',dragEnd);
  renderForm();renderTabs();
  return {
    show(){void loadFareOptions();panel.show();panel.bringToFront();return this;},hide(){panel.hide();},minimize(){panel.minimize();},restore(){panel.restore();},bringToFront(){panel.bringToFront();},
    get element(){return panel.element;},get state(){return clone(request);},get results(){return clone(results);},get style(){return clone(style);},synchronizeColor,get busy(){return busy;},get active(){return !!results?.plans?.length||!!recovery||!!locationName(request.origin)||!!request.userNaturalLanguage;},get recovery(){return clone(recovery);},confirmRecovery,
    setRequest(value){edit(value);renderForm();renderTabs();},
    cancel,
    setJourneyController,updateJourney(value){
      const segment=value.segment,from=Date.parse(segment?.departureTime),to=Date.parse(segment?.arrivalTime);
      const simulatedTime=value.simulatedTime||(Number.isFinite(from)&&Number.isFinite(to)&&Number.isFinite(value.fraction)?new Date(from+(to-from)*Math.min(1,Math.max(0,value.fraction))).toISOString():undefined);
      journeyState={...journeyState,...value,simulatedTime,segmentIndex:value.segmentIndex??value.index??journeyState.segmentIndex,status:value.status??(value.running?'播放中':value.label||'行程模擬')};renderJourney();
    },
    async handleMessage(text){
      if(busy){status('目前查詢仍在執行，完成或失敗會自動回報；請勿重複執行。');return {handled:true,busy:true};}
      const intent=transitMessageIntent(text,{hasRequest:!!locationName(request.origin)||!!request.userNaturalLanguage,active:!!recovery||!!results});
      if(intent==='service'||intent==='sources'){
        const work=start(intent==='sources'?'正在擷取目前旅程相關的官方公開票價來源…':'正在讀取實際 TDX 服務狀態…');
        try{const service=await browserAi('/tdx',{method:'POST',data:{action:'status'},signal:work.signal});
          if(intent==='sources'){const sourceResult=await browserAi('/tdx',{method:'POST',data:{action:'official-fare-info',request:clone(request)},signal:work.signal});if(live(work))await onExplain({assistantContent:transitServiceText(service)+'\n\n## 官方網頁擷取結果\n'+sourceResult.sources.map(s=>`- [${s.name}](${s.sourceUrl})：${s.status}；擷取時間 ${s.fetchedAt||'未取得'}${s.notice?'；'+s.notice:''}`).join('\n')+'\n\n這是實際公開頁面查核；起訖、車種、票種與計價條件仍由 Fare Engine 驗證，不讓文字模型猜金額。',serviceStatus:service},{signal:work.signal});}
          else{const fareStatus=await browserAi('/tdx',{method:'POST',data:{action:'fare-status'},signal:work.signal});if(live(work))await onExplain({assistantContent:transitServiceText(service,fareStatus),serviceStatus:service},{signal:work.signal});}
          status('資料服務查核結果已回報至 AI 空間助理。');return {handled:true};
        }catch(error){fail(error);return {handled:true,error:error.message};}finally{finish(work);}
      }
      if(intent==='status'){
        if(results?.plans?.length)await onExplain({...clone(results),conclusion:true});
        if(recovery)onRecovery(clone(recovery));
        else if(!results?.plans?.length)proposeRecovery(lastIssue||new Error('目前尚未取得可執行方案；查詢直接透過 TDX 與官方票價來源，不需要載入交通圖層。'));
        return {handled:true};
      }
      if(recovery){const index=transitConfirmationIndex(text);if(index!==null)return confirmRecovery(recovery.id,index);return {handled:true,needsConfirmation:true};}
      if(intent==='confirm'){
        if(results?.offerId&&results.plans?.length)return executeConfirmed(0);
        proposeRecovery(lastIssue||new Error('尚未取得可執行的官方方案，請確認下方建議。'));return {handled:true,needsConfirmation:true};
      }
      if(!results?.plans?.length&&!results?.needsClarification)return {handled:false};panel.show();try{const response=await parse(text,{followup:true,refresh:/錯過|重新|最新/.test(text)});return {handled:true,...response};}catch(error){fail(error);return {handled:true,error:error.message};}
    },
    async plan({refresh=false}={}){try{return await plan(refresh);}catch(error){fail(error);return {error:error.message};}},
    destroy(){if(destroyed)return;cancel();destroyed=true;root.removeEventListener('click',click);root.removeEventListener('input',input);root.removeEventListener('change',input);root.removeEventListener('dragstart',dragStart);root.removeEventListener('dragover',dragOver);root.removeEventListener('drop',drop);root.removeEventListener('dragend',dragEnd);panel.destroy();},
  };
}
