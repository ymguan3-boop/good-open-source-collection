import {tdxLimit} from './tdxLimits.js';
import {createFareService,defaultFareCacheFile,fareComparison,rankTransitPlans} from './fareEngine.js';
import {vehicleAllowed} from '../../src/taiwan/farePreference.js';
import {createHash,randomUUID} from 'node:crypto';
import {getCredential} from './taiwanCredentialStore.js';
import {normalizeTripRequest,normalizeMaaSRoute,finalizePlan,taipeiTime,tdxError} from './tdxTrip.js';
import {parseTransitText} from './tdxParse.js';
import {createTdxGeometry} from './tdxGeometry.js';
import {createOfficialFareLookup,TRA_TRAIN_TYPES,TRA_FARE_URL,traClass,selectTraFare} from './tdxFareWeb.js';
import {createOfficialTransit} from './officialTransit.js';

const AUTH='https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const BASE='https://tdx.transportdata.tw/api/basic';
const ROUTING='https://tdx.transportdata.tw/api/maas/routing';
const MODE_CODES={HSR:3,TRA:4,BUS:5,METRO:6,LRT:7};
export const TDX_TTL={stations:86400000,fare:86400000,schedule:3600000,eta:20000,route:30000,search:300000};
const abort=signal=>signal?.throwIfAborted();
const norm=name=>String(name||'').replaceAll('臺','台').replace(/(?:火車站|車站|站)$/,'').trim();
const safeId=id=>{if(!/^[A-Za-z0-9_-]{1,100}$/.test(String(id)))throw tdxError('INVALID_STATION_ID','車站代碼不正確');return encodeURIComponent(id);};

export function createTdxService({fetcher=fetch,credential=getCredential,now=Date.now,cacheFile=null,checkFarePolicy=true}={}){
  let token=null,authPromise=null,lastServiceError=null;const cache=new Map(),pendingApi=new Map(),rateLimits=new Map(),offers=new Map();
  const trainQuestion=request=>({plans:[],request,needsClarification:true,clarificationField:'traTrainType',questions:['這段旅程可能搭乘臺鐵，請先選擇自強號、莒光號、區間／區間快，或明確選擇不限車種；不同車種票價不同。'],notices:['請在旅程表單選擇「臺鐵車種需求」，或直接在 AI 空間助理回答想搭的車種，再重新規劃。'],sourceStatus:{tdx:'needs-confirmation'}});
  const fingerprint=()=>createHash('sha256').update(`${credential('TDX_CLIENT_ID')}\0${credential('TDX_CLIENT_SECRET')}`).digest('hex');
  const configured=()=>!!credential('TDX_CLIENT_ID')&&!!credential('TDX_CLIENT_SECRET');
  const limits=()=>{const prefix=fingerprint()+':';return [...rateLimits].filter(([key,l])=>key.startsWith(prefix)&&Date.parse(l.resetAt||l.retryAt)>now()).map(([key,l])=>({...l,source:new URL(key.slice(prefix.length)).pathname}));};
  async function serviceError(response,url){
    let text='';try{text=(await response.text()).slice(0,12000);}catch{/* Status remains authoritative. */}
    const limited=response.status===429||response.status===403&&/quota|配額|額度|點數不足/i.test(text);
    const limit=limited?tdxLimit(response,text,now()):null;if(limit)rateLimits.set(`${fingerprint()}:${url}`,limit);
    const code=limit?.kind==='quota'?'TDX_QUOTA_EXCEEDED':limit?'TDX_RATE_LIMITED':response.status===403?'TDX_PERMISSION_DENIED':response.status===401?'TDX_AUTH_FAILED':'TDX_SERVICE_FAILED';
    const message=limit?.kind==='quota'?'TDX 用量額度已滿':limit?'TDX 查詢頻率或用量受到限制':response.status===403?'TDX 此資料服務沒有存取權限':response.status===401?'TDX 權杖驗證失敗':'TDX 資料服務未能回傳資料';
    const error=Object.assign(tdxError(code,`${message}（HTTP ${response.status}）`,limited?429:response.status===403?403:response.status===401?401:502),{upstreamStatus:response.status,rateLimit:limit});lastServiceError={code,message:error.message,rateLimit:limit,at:new Date(now()).toISOString(),source:new URL(url).pathname};return error;
  }
  function checkLimit(url){const limit=rateLimits.get(`${fingerprint()}:${url}`);if(limit&&Date.parse(limit.resetAt||limit.retryAt)>now())throw Object.assign(tdxError(limit.kind==='quota'?'TDX_QUOTA_EXCEEDED':'TDX_RATE_LIMITED',limit.kind==='quota'?'TDX 用量額度已滿；依官方時間等待再查詢。':'TDX 已要求暫緩此來源查詢；已驗證快取仍可使用。',429),{rateLimit:limit});}
  async function readJson(response){
    if(Number(response.headers?.get('content-length'))>12000000){await response.body?.cancel();throw tdxError('TDX_RESPONSE_TOO_LARGE','TDX 回應超過處理大小限制',502);}
    const text=await response.text();if(text.length>12000000)throw tdxError('TDX_RESPONSE_TOO_LARGE','TDX 回應超過處理大小限制',502);
    try{return JSON.parse(text);}catch{throw tdxError('TDX_INVALID_RESPONSE','TDX 未回傳有效 JSON',502);}
  }
  const cached=(key,ttl)=>{const value=cache.get(key);return value&&now()-value.at<ttl?structuredClone(value.data):null;};
  const store=(key,data)=>{if(cache.size>=150)cache.delete(cache.keys().next().value);cache.set(key,{at:now(),data:structuredClone(data)});return data;};
  async function accessToken(signal){
    abort(signal);if(!configured())throw tdxError('TDX_CREDENTIALS_REQUIRED','請先在設定儲存 TDX Client ID 與 Client Secret；公共運輸班次規劃不能以 AI 虛構資料替代',428);
    checkLimit(AUTH);const identity=fingerprint();if(token?.identity===identity&&token.expires>now())return token.value;
    if(authPromise?.identity!==identity){
      const task=(async()=>{
        const response=await fetcher(AUTH,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:credential('TDX_CLIENT_ID'),client_secret:credential('TDX_CLIENT_SECRET')}),signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw await serviceError(response,AUTH);
        const data=await readJson(response);if(typeof data.access_token!=='string'||!Number.isFinite(Number(data.expires_in)))throw tdxError('TDX_AUTH_FAILED','TDX 未提供有效存取權杖',502);
        const next={identity,value:data.access_token,expires:now()+Math.max(0,Number(data.expires_in)*1000-60000)};
        if(identity===fingerprint())token=next;return next.value;
      })();authPromise={identity,task};task.finally(()=>{if(authPromise?.task===task)authPromise=null;}).catch(()=>{});
    }
    // Shared token refresh has its own deadline. Cancelling one browser request
    // stops that caller, without breaking another request awaiting the token.
    const task=authPromise.task;
    if(!signal)return task;
    return new Promise((resolve,reject)=>{const stop=()=>reject(signal.reason||new DOMException('Aborted','AbortError'));signal.addEventListener('abort',stop,{once:true});task.then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop));if(signal.aborted)stop();});
  }
  async function fetchApi(url,{ttl=0,signal,refresh=false}={}){
    abort(signal);const key=`${fingerprint()}:${url}`;if(!refresh&&ttl){const hit=cached(key,ttl);if(hit!==null)return hit;}
    for(let attempt=0;attempt<2;attempt++){
      const bearer=await accessToken(signal);abort(signal);
      const response=await fetcher(url,{headers:{Authorization:`Bearer ${bearer}`,Accept:'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(15000)].filter(Boolean))});
      if(response.status===401&&attempt===0){await response.body?.cancel();token=null;continue;}
      if(!response.ok)throw await serviceError(response,url);
      const data=await readJson(response);abort(signal);
      if(data&&typeof data==='object'&&!Array.isArray(data))data._tdxFetchedAt=new Date(now()).toISOString();
      return ttl?store(key,data):data;
    }
    throw tdxError('TDX_AUTH_FAILED','TDX 金鑰無法存取此服務',401);
  }
  async function api(url,{ttl=0,signal,refresh=false}={}){
    abort(signal);const key=`${fingerprint()}:${url}`;
    if(!refresh&&ttl){const hit=cached(key,ttl);if(hit!==null)return hit;}
    checkLimit(url);
    let task=pendingApi.get(key);
    if(!task){task=fetchApi(url,{ttl,refresh,signal:AbortSignal.timeout(30000)});pendingApi.set(key,task);task.finally(()=>{if(pendingApi.get(key)===task)pendingApi.delete(key);}).catch(()=>{});}
    if(!signal)return structuredClone(await task);
    return new Promise((resolve,reject)=>{const stop=()=>reject(signal.reason||new DOMException('Aborted','AbortError'));signal.addEventListener('abort',stop,{once:true});task.then(value=>resolve(structuredClone(value)),reject).finally(()=>signal.removeEventListener('abort',stop));if(signal.aborted)stop();});
  }
  const basic=(path,ttl,signal,query={},refresh=false)=>{const url=new URL(`${BASE}${path}`);Object.entries({'$format':'JSON',...query}).forEach(([k,v])=>url.searchParams.set(k,String(v)));return api(url.href,{ttl,signal,refresh});};
  const stations=(mode,signal)=>basic(`/v2/Rail/${mode==='HSR'?'THSR':'TRA'}/Station`,TDX_TTL.stations,signal,{'$top':500});
  const fares=createFareService({basic,stations,fetcher,now,cacheFile,checkPolicy:checkFarePolicy});
  const official=createOfficialTransit({fetcher,credential,now,checkPolicy:checkFarePolicy}),attempts=new Map();

  async function resolveLocation(query,{signal}={}){
    abort(signal);query=String(query||'').trim();if(!query||query.length>200)throw tdxError('INVALID_LOCATION','請輸入 1–200 字地點名稱');
    const results=[],notices=[];
    if(configured()&&/站|台鐵|高鐵/.test(query)){
      for(const mode of ['TRA','HSR']){try{for(const s of await stations(mode,signal)){
        const name=s.StationName?.Zh_tw;if(norm(name)!==norm(query.replace(/^台鐵|^臺鐵|^高鐵/,'')))continue;
        const lat=Number(s.StationPosition?.PositionLat),lon=Number(s.StationPosition?.PositionLon);if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
        results.push({id:`${mode}:${s.StationID}`,name,lat,lon,address:s.StationAddress||'',type:mode,source:`TDX ${mode==='HSR'?'高鐵':'臺鐵'}車站`});
      }}catch(e){abort(signal);notices.push(e.message);}}
    }
    if(/站|台鐵|臺鐵/.test(query)&&!results.some(r=>r.type==='TRA')){
      try{for(const s of await official.stations(signal))if(norm(s.name)===norm(query.replace(/^台鐵|^臺鐵/,'')))results.push({...s,type:'TRA'});}catch{abort(signal);}
    }
    // A uniquely named official station with an explicit rail system needs no
    // second POI search or choice among unrelated nearby businesses.
    const explicitSystem=/^高鐵/.test(query)?'HSR':/^台鐵|^臺鐵|火車站$/.test(query)?'TRA':null;
    const exactStations=results.filter(r=>r.type===explicitSystem);
    if(exactStations.length===1)return {results:exactStations,needsSelection:false,notices};
    const cacheKey=`search:${query}:${!!credential('TOMTOM_API_KEY')}`,hit=cached(cacheKey,TDX_TTL.search);
    let publicResults=hit;
    if(!publicResults){
      const tt=credential('TOMTOM_API_KEY');let url;
      if(tt){url=new URL(`https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json`);Object.entries({key:tt,language:'zh-TW',limit:5,countrySet:'TW'}).forEach(([k,v])=>url.searchParams.set(k,v));}
      else{url=new URL('https://photon.komoot.io/api/');Object.entries({q:query,limit:5,bbox:'117,20,123.5,27'}).forEach(([k,v])=>url.searchParams.set(k,v));}
      try{
        const response=await fetcher(url.href,{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)].filter(Boolean))});if(!response.ok){await response.body?.cancel();throw tdxError('GEOCODE_FAILED','地點搜尋服務暫時無法使用',502);}
        const data=await readJson(response);publicResults=tt?(data.results||[]).map(r=>({id:r.id,name:r.poi?.name||r.address?.freeformAddress,lat:r.position?.lat,lon:r.position?.lon,address:r.address?.freeformAddress||'',source:'TomTom 地點搜尋',type:r.type})): (data.features||[]).map((r,i)=>({id:r.properties?.osm_id?`osm:${r.properties.osm_type}:${r.properties.osm_id}`:`photon:${i}`,name:r.properties?.name||query,lat:r.geometry?.coordinates?.[1],lon:r.geometry?.coordinates?.[0],address:[r.properties?.city,r.properties?.street,r.properties?.housenumber].filter(Boolean).join(' '),source:'Photon / OpenStreetMap',type:r.properties?.osm_value||'place'}));
        publicResults=publicResults.filter(r=>Number.isFinite(r.lat)&&Number.isFinite(r.lon)&&r.lat>=20&&r.lat<=27&&r.lon>=117&&r.lon<=123.5);store(cacheKey,publicResults);
      }catch(e){abort(signal);notices.push('地點搜尋失敗；請稍後重試或選擇已確認車站。');publicResults=[];}
    }
    for(const r of publicResults)if(!results.some(x=>norm(x.name)===norm(r.name)&&Math.abs(x.lat-r.lat)<.002&&Math.abs(x.lon-r.lon)<.002))results.push(r);
    return {results:results.slice(0,8),needsSelection:results.length>1,notices};
  }
  async function enrich(plan,signal,request){
    const parentSignal=signal;signal=AbortSignal.any([signal,AbortSignal.timeout(25000)].filter(Boolean));
    const geometry=createTdxGeometry({basic,credential,fetcher,signal,ttl:TDX_TTL});
    for(const segment of plan.segments){
      if(signal.aborted){abort(parentSignal);plan.notices.push('路線線型／票價補充已達 25 秒處理上限；保留已核實資料，其餘標示缺漏，可重新查詢。');break;}
      const geometryKey=`geometry:${fingerprint()}:${!!credential('TOMTOM_API_KEY')}:${JSON.stringify([segment.mode,segment.routeName,segment.city,segment.transportType,segment.from,segment.to,segment.intermediateStops])}`;
      const savedGeometry=cached(geometryKey,cache.get(geometryKey)?.data?.missing?TDX_TTL.eta:TDX_TTL.schedule);
      if(savedGeometry){Object.assign(segment,savedGeometry.fields||{});Object.assign(segment.from,savedGeometry.fromMeta||{});Object.assign(segment.to,savedGeometry.toMeta||{});}
      else{
        let ready=false;try{ready=await geometry.enrich(segment);}catch{abort(parentSignal);}
        if(signal.aborted){abort(parentSignal);plan.notices.push('路線線型補充已達處理上限；未完成線型仍標示缺漏。');break;}
        const fields={};for(const key of ['geometry','geometryStatus','geometrySource','geometryUpdatedAt','railSystem','bikeRegion','bikeSystems','agency','busStops','routeId','subRouteId','operatorId','routeUid','subRouteUid','direction','busCity'])if(segment[key]!==undefined)fields[key]=segment[key];
        store(geometryKey,{fields,fromMeta:{...segment.from},toMeta:{...segment.to},missing:!ready});
      }
      segment.updatedAt=segment.sourceTime;
      if(segment.waitAfterSeconds!==undefined)segment.waitSeconds=segment.waitAfterSeconds;
      if(segment.mode==='BUS'&&segment.routeUid&&Math.abs(Date.parse(segment.departureTime)-now())<3600000){
        try{
          const suffix=segment.busCity?`City/${segment.busCity}/${encodeURIComponent(segment.routeName.replace(/[去返]$/,''))}`:`InterCity/${encodeURIComponent(segment.routeName.replace(/[去返]$/,''))}`;
          const rows=await basic(`/v2/Bus/EstimatedTimeOfArrival/${suffix}`,TDX_TTL.eta,signal,{'$top':500}),matched=rows.filter(r=>r.RouteUID===segment.routeUid&&r.StopUID===segment.from.id&&r.Direction===segment.direction);
          if(matched.length===1&&matched[0].StopStatus===0&&Number.isFinite(matched[0].EstimateTime))Object.assign(segment,{realtimeStatus:'dynamic',waitSeconds:matched[0].EstimateTime,realtimeSource:'TDX 公車到站預估',realtimeTime:matched[0].UpdateTime,updatedAt:matched[0].UpdateTime});
        }catch{abort(parentSignal);plan.notices.push('公車即時到站資料不可用；保留規劃時刻。');}
      }
      if(!['HSR','TRA'].includes(segment.mode))continue;
      try{
        const list=await stations(segment.mode,signal),find=p=>list.filter(x=>norm(x.StationName?.Zh_tw)===norm(p.name)&&Math.abs(Number(x.StationPosition?.PositionLat)-p.lat)<.01&&Math.abs(Number(x.StationPosition?.PositionLon)-p.lon)<.01);
        const origins=find(segment.from),destinations=find(segment.to);if(origins.length!==1||destinations.length!==1)continue;
        const from=origins[0],to=destinations[0],operator=segment.mode==='HSR'?'THSR':'TRA';
        segment.from.id=from.StationID;segment.to.id=to.StationID;
        if(segment.mode==='TRA'){
          let actual=traClass(segment.transportType);
          if(!actual||request.farePreference.modePreferences.TRA.vehicleTypes.length||request.farePreference.modePreferences.TRA.excludedVehicleTypes.length){
            try{
              const date=taipeiTime(segment.departureTime).slice(0,10),depart=taipeiTime(segment.departureTime).slice(11,16),arrive=taipeiTime(segment.arrivalTime).slice(11,16);
              const rows=await basic(`/v2/Rail/TRA/DailyTimetable/OD/${safeId(from.StationID)}/to/${safeId(to.StationID)}/${date}`,TDX_TTL.schedule,signal,{'$top':500});
              const exact=rows.filter(r=>r.TrainDate===date&&r.OriginStopTime?.StationID===from.StationID&&r.DestinationStopTime?.StationID===to.StationID&&r.OriginStopTime?.DepartureTime?.slice(0,5)===depart&&r.DestinationStopTime?.ArrivalTime?.slice(0,5)===arrive&&Number(r.DailyTrainInfo?.SuspendedFlag)===0&&(!segment.trainNumber||String(r.DailyTrainInfo?.TrainNo)===segment.trainNumber));
              if(exact.length===1){actual=traClass(exact[0].DailyTrainInfo?.TrainTypeName?.Zh_tw);segment.trainNumber=String(exact[0].DailyTrainInfo.TrainNo);segment.transportType=exact[0].DailyTrainInfo.TrainTypeName?.Zh_tw||'';segment.trainTypeId=exact[0].DailyTrainInfo.TrainTypeID;segment.trainTypeSource='TDX 臺鐵起迄站時刻表';}
            }catch{abort(parentSignal);}
          }
          segment.trainClass=actual;segment.requestedTrainClass=request.traTrainType;
          segment.trainClassStatus=actual&&segment.transportType&&(request.traTrainType==='any'||request.traTrainType===actual)&&vehicleAllowed(segment.transportType,segment.trainTypeId,request.farePreference.modePreferences.TRA)&&!(request.farePreference.modePreferences.TRA.seatClasses.length===1&&request.farePreference.modePreferences.TRA.seatClasses[0]==='premium'&&!/^自強\s*[(（]?3000/.test(segment.transportType))?'matched':actual?'mismatch':'unverified';
          segment.fareLookup={source:'臺鐵官方票價查詢',sourceUrl:TRA_FARE_URL,status:'manual-required',ticketType:TRA_TRAIN_TYPES[request.traTrainType]||'待選車種'};
        }
        if(segment.mode==='TRA'&&segment.trainNumber&&Math.abs(Date.parse(segment.departureTime)-now())<3600000){
          try{const board=await basic(`/v2/Rail/TRA/LiveBoard/Station/${safeId(from.StationID)}`,TDX_TTL.eta,signal);const live=board.find(x=>String(x.TrainNo)===segment.trainNumber);if(live){segment.realtimeStatus='dynamic';segment.delayMinutes=live.DelayTime!==null&&live.DelayTime!==undefined&&Number.isFinite(Number(live.DelayTime))?Number(live.DelayTime):null;segment.delaySeconds=segment.delayMinutes===null?null:segment.delayMinutes*60;segment.realtimeSource='TDX 臺鐵到離站';segment.realtimeTime=live.UpdateTime||null;segment.updatedAt=live.UpdateTime||segment.sourceTime;}}
          catch{abort(parentSignal);plan.notices.push('臺鐵即時資料暫不可用；保留原規劃時刻。');}
        }
      }catch(e){abort(parentSignal);plan.notices.push(`${segment.routeName} 票價或車站資料未取得；不估造票價。`);}
    }
    // Exact segment identity and preferences flow through the independent engine.
    for(const segment of plan.segments){
      try{segment.fare=await fares.quoteSegment(segment,request.farePreference,{signal:parentSignal,preferCheapest:request.preference==='cheapest'});if(segment.fare.notice)plan.notices.push(segment.fare.notice);if(segment.fare.complete)delete segment.fareLookup;}
      catch(e){abort(parentSignal);segment.fare={amount:null,complete:false,notice:'票價來源驗證未完成，未推測金額。'};plan.notices.push(segment.fare.notice);}
    }
    // A station-internal transfer is a single OD fare, including all passengers.
    for(let i=0;i<plan.segments.length;i++){
      const first=plan.segments[i];if(!['METRO','LRT'].includes(first.mode)||!first.railSystem)continue;
      const group=[first];let end=i;for(let j=i+1;j<plan.segments.length;j++){const s=plan.segments[j];if(s.mode==='WALK'&&s.transferWalk)continue;if(s.mode===first.mode&&s.railSystem===first.railSystem){group.push(s);end=j;}else break;}
      if(group.length<2)continue;i=end;let fare=null;try{fare=await fares.quoteSegment({...first,to:group.at(-1).to},request.farePreference,{signal:parentSignal});}catch{abort(parentSignal);}
      if(fare?.complete){first.fare=fare;for(const s of group.slice(1))s.fare={amount:0,currency:'TWD',source:fare.source,sourceUrl:fare.sourceUrl,fetchedAt:fare.fetchedAt,ticketType:'站內轉乘：票價已計入前段',complete:true};}
      else{for(const s of group)s.fare={amount:null,complete:false};plan.notices.push('連續站內轉乘未取得完整起訖票價，不加總分段票價。');}
    }
    const count=plan.segments.filter(s=>s.geometry).length;
    plan.geometryStatus=count===plan.segments.length?'ready':count?'partial':'missing';
    plan.notices=plan.notices.filter(n=>!n.startsWith('TDX MaaS 提供站點'));
    if(count<plan.segments.length)plan.notices.push('部分路段未取得可核實實際線型；保留缺漏，不以直線冒充道路／鐵路。');
    for(const s of plan.segments){if(s.geometrySource&&!plan.sources.includes(s.geometrySource))plan.sources.push(s.geometrySource);if(s.fare?.source&&!plan.sources.includes(s.fare.source))plan.sources.push(s.fare.source);}
    return finalizePlan(plan);
  }
  async function routing(from,to,request,time,arrival,signal,gc,current=false,refresh=false,trace=()=>{}){
    const transit=request.allowedModes.map(m=>MODE_CODES[m]).filter(Boolean);if(!transit.length)throw tdxError('TDX_MODES_UNSUPPORTED','TDX MaaS 規劃須包含公共運輸；僅步行／自行車的實際路線尚無可靠服務',422);
    const url=new URL(ROUTING);Object.entries({origin:`${from.lat},${from.lon}`,destination:`${to.lat},${to.lon}`,gc,top:3,transit:transit.join(','),transfer_time:'5,60',first_mile_mode:0,last_mile_mode:0,first_mile_time:30,last_mile_time:30,[arrival?'arrival':'depart']:taipeiTime(time).slice(0,19)}).forEach(([k,v])=>url.searchParams.set(k,String(v)));
    // MaaS may expand its search before the ideal time. A 10-minute planning window keeps useful future candidates; past departures are still rejected.
    if(!current&&Date.parse(time)<now())throw tdxError('TDX_TIME_IN_PAST','指定時間已經過去，請改選「現在出發」或未來時間',422);
    if(!arrival)url.searchParams.set('depart',taipeiTime(new Date((current?now():Date.parse(time))+600000).toISOString()).slice(0,19));
    const data=await api(url.href,{ttl:TDX_TTL.route,signal,refresh});
    if(data.result&&data.result!=='success')throw tdxError('TDX_NO_ROUTE','TDX 未找到符合條件的公共運輸方案',422);
    const rows=data.data?.routes||data.routes||[];
    const normalized=rows.map((r,i)=>{try{const plan=normalizeMaaSRoute(r,i);if(plan){for(const segment of plan.segments)segment.sourceTime=data._tdxFetchedAt||null;if(plan.segments[0].from.name==='未命名站點')plan.segments[0].from.name=from.name;if(plan.segments.at(-1).to.name==='未命名站點')plan.segments.at(-1).to.name=to.name;}return plan;}catch{return null;}}).filter(Boolean),allowed=normalized.filter(p=>p.segments.every(s=>request.allowedModes.includes(s.mode)||(s.mode==='WALK'&&!request.excludedModes.includes('WALK')))),timed=allowed.filter(p=>arrival?Date.parse(p.arrivalTime)<=Date.parse(time):Date.parse(p.departureTime)>=Date.parse(time));
    trace(`${from.name} → ${to.name}：官方回傳 ${rows.length} 個候選，格式／時間順序可驗證 ${normalized.length} 個，符合運具 ${allowed.length} 個，符合指定${arrival?'抵達':'出發'}時間 ${timed.length} 個。`);return timed;
  }
  async function directTra(request,signal,refresh=false,allowAlternativeModes=false){
    if(request.waypoints.length||!request.allowedModes.includes('TRA')||!allowAlternativeModes&&request.allowedModes.some(m=>!['TRA','WALK'].includes(m)))return null;
    const list=await stations('TRA',signal),match=p=>list.filter(s=>norm(s.StationName?.Zh_tw)===norm(p.name)&&Math.abs(Number(s.StationPosition?.PositionLat)-p.lat)<.002&&Math.abs(Number(s.StationPosition?.PositionLon)-p.lon)<.002);
    const from=match(request.origin),to=match(request.destination);if(from.length!==1||to.length!==1)return null;
    if(!request.traTrainType)return trainQuestion(request);
    const time=request.timeMode==='arrival'?request.arrivalDeadline:request.departureTime;
    if(request.timeMode!=='now'&&Date.parse(time)<now())throw tdxError('TDX_TIME_IN_PAST','指定時間已經過去，請改選「現在出發」或未來時間',422);
    const date=taipeiTime(time).slice(0,10),rows=await basic(`/v2/Rail/TRA/DailyTimetable/OD/${safeId(from[0].StationID)}/to/${safeId(to[0].StationID)}/${date}`,TDX_TTL.schedule,signal,{'$top':500},refresh);
    const plans=[];
    for(const r of rows){
      const info=r.DailyTrainInfo,kind=traClass(info?.TrainTypeName?.Zh_tw);
      if(r.TrainDate!==date||r.OriginStopTime?.StationID!==from[0].StationID||r.DestinationStopTime?.StationID!==to[0].StationID||Number(info?.SuspendedFlag)!==0||!info?.TrainTypeName?.Zh_tw||request.traTrainType!=='any'&&kind!==request.traTrainType||!vehicleAllowed(info.TrainTypeName.Zh_tw,info.TrainTypeID,request.farePreference.modePreferences.TRA)||request.farePreference.modePreferences.TRA.seatClasses.length===1&&request.farePreference.modePreferences.TRA.seatClasses[0]==='premium'&&!/^自強\s*[(（]?3000/.test(info.TrainTypeName.Zh_tw))continue;
      const d=r.OriginStopTime?.DepartureTime,a=r.DestinationStopTime?.ArrivalTime;if(!/^\d{2}:\d{2}(?::\d{2})?$/.test(d||'')||!/^\d{2}:\d{2}(?::\d{2})?$/.test(a||''))continue;
      let departure,arrival;
      try{departure=taipeiTime(`${date}T${d}`);arrival=taipeiTime(`${date}T${a}`);if(Date.parse(arrival)<Date.parse(departure))arrival=taipeiTime(new Date(Date.parse(arrival)+86400000).toISOString());}catch{continue;}
      if(Date.parse(departure)<now()||request.timeMode!=='arrival'&&Date.parse(departure)<Date.parse(time)||request.arrivalDeadline&&Date.parse(arrival)>Date.parse(request.arrivalDeadline))continue;
      const p=normalizeMaaSRoute({start_time:departure,end_time:arrival,sections:[{type:'transit',transport:{mode:'TRA',type:info.TrainTypeName.Zh_tw,name:`${info.TrainTypeName.Zh_tw} ${info.TrainNo}`,number:String(info.TrainNo)},departure:{time:departure,place:{name:from[0].StationName.Zh_tw,location:{lat:from[0].StationPosition.PositionLat,lng:from[0].StationPosition.PositionLon}}},arrival:{time:arrival,place:{name:to[0].StationName.Zh_tw,location:{lat:to[0].StationPosition.PositionLat,lng:to[0].StationPosition.PositionLon}}}}]},plans.length);
      if(!p)continue;p.sources=['TDX 臺鐵起迄站時刻表'];p.notices=['依已選車種與官方班表規劃；表定時刻不代表即時列車位置。'];
      for(const s of p.segments){s.trainTypeId=info.TrainTypeID;s.source='TDX 臺鐵起迄站時刻表';s.sourceTime=r.UpdateTime||null;}
      plans.push(p);
    }
    const sort=p=>request.preference==='fastest'?p.durationSeconds:request.timeMode==='arrival'?-Date.parse(p.departureTime):Date.parse(p.departureTime);
    plans.sort((a,b)=>sort(a)-sort(b));const pool=request.preference==='cheapest'?plans.filter((p,i)=>plans.findIndex(x=>x.segments[0].transportType===p.segments[0].transportType)===i).slice(0,8):plans.slice(0,3),chosen=pool;
    for(const [i,p]of chosen.entries()){p.id=`tra-${i}`;p.label=`方案 ${String.fromCharCode(65+i)}`;await enrich(p,signal,request);}
    rankTransitPlans(chosen,request.preference,request.departureTime||new Date(now()).toISOString());
    return {plans:chosen.slice(0,3),request,sourceStatus:{tdx:chosen.length?'ready':'no-matching-train',geometry:chosen.every(p=>p.geometryStatus==='ready')&&chosen.length?'ready':chosen.some(p=>p.segments.some(s=>s.geometry))?'partial':'missing',realtime:'scheduled'},notices:chosen.length?['起訖已確認為臺鐵車站，直接以官方起迄站班表查詢符合所選車種的最多三班；非即時定位。']:['指定日期與時間沒有取得符合所選車種的班次；請調整時間或車種。未套用其他車種票價。']};
  }
  async function planTdx(input,{signal,refresh=false}={}){
    await accessToken(signal);const request=normalizeTripRequest(input,now()),points=[request.origin,...request.waypoints.map(w=>w.location),request.destination],unresolved=[];
    for(let i=0;i<points.length;i++){
      const p=points[i];if(p&&typeof p==='object'&&Number.isFinite(p.lat)&&Number.isFinite(p.lon))continue;
      const resolved=await resolveLocation(typeof p==='string'?p:p.name,{signal});
      if(resolved.results.length!==1)unresolved.push({index:i,query:typeof p==='string'?p:p.name,...resolved});else points[i]=resolved.results[0];
    }
    if(unresolved.length)return {plans:[],request,needsSelection:true,unresolvedLocations:unresolved,sourceStatus:{tdx:'ready',geocode:'needs-confirmation'},notices:['請先確認候選地點，避免規劃到錯誤車站或同名地點。']};
    request.origin=points[0];request.destination=points.at(-1);request.waypoints.forEach((w,i)=>w.location=points[i+1]);
    const direct=await directTra(request,signal,refresh);if(direct)return direct;
    // A single MaaS call already returns up to three authoritative alternatives.
    // Avoid weight sweeps that exhaust the member's minute-level rate allowance.
    if(!request.waypoints.length){
      const reverse=request.timeMode==='arrival',time=reverse?request.arrivalDeadline:request.departureTime;
      const gc=request.preference==='fastest'?1:request.preference==='cheapest'?0:.5;
      const plans=await routing(points[0],points[1],request,time,reverse,signal,gc,request.timeMode==='now',refresh);
      let valid=plans.filter(p=>!request.arrivalDeadline||Date.parse(p.arrivalTime)<=Date.parse(request.arrivalDeadline));
      if(!request.traTrainType&&valid.some(p=>p.segments.some(s=>s.mode==='TRA')))return trainQuestion(request);
      const deadline=Date.now()+45000;
      for(const [index,p] of valid.slice(0,3).entries()){
        p.id=`tdx-${index}`;p.label=`方案 ${String.fromCharCode(65+index)}`;
        if(Date.now()<deadline)await enrich(p,signal,request);else{p.geometryStatus='missing';p.notices.push('其他方案線形補充已達時間上限，保留班次資料。');finalizePlan(p);}
      }
      const unchecked=valid.some(p=>p.segments.some(s=>s.mode==='TRA'&&s.trainClassStatus!=='matched'));
      valid=valid.filter(p=>p.segments.every(s=>s.mode!=='TRA'||s.trainClassStatus==='matched'));
      if(unchecked&&!valid.length){const alternative=await directTra(request,signal,refresh,true);if(alternative?.plans?.length){alternative.notices.push('TDX MaaS 臺鐵時刻未對應當日官方班表，改查相同起訖的臺鐵直達候選；其他運具未窮舉。');return alternative;}}
      if(unchecked&&!valid.length)return {plans:[],request,notices:['目前回傳臺鐵班次的車種與您的選擇不符，或班次資料不足以核對車種；請調整時間／車種後再查詢。未套用其他車種票價。'],sourceStatus:{tdx:'no-matching-train'}};
      const score=p=>request.preference==='fewest-transfers'?p.transfers:request.preference==='least-walking'?p.walkDistanceMeters:request.preference==='fastest'?p.durationSeconds:request.preference==='cheapest'?(p.totalFare??Infinity):p.durationSeconds;
      rankTransitPlans(valid,request.preference,request.departureTime||new Date(now()).toISOString());
      return {plans:valid.slice(0,3),request,sourceStatus:{tdx:valid.length?'ready':'no-route',geometry:valid.length&&valid.every(p=>p.geometryStatus==='ready')?'ready':valid.some(p=>p.segments.some(s=>s.geometry))?'partial':'missing',realtime:valid.some(p=>p.segments.some(s=>s.realtimeStatus==='dynamic'))?'partial':'scheduled'},notices:[...(!valid.length?['TDX 未回傳符合時間與運具條件的可行班次；請調整出發時間或交通工具後再查詢。']:[]),'單次查詢取得 TDX 官方最多三個候選，依指定時間／成本偏好；非全網窮舉。',...(request.timeMode==='now'?['現在出發以 10 分鐘後為理想搜尋時間；TDX 可能前後擴大搜尋，只保留尚未出發的方案，以各方案實際時刻為準。']:[]),'行程示意非即時車輛位置；沒有核實線形的路段不造直線。',...(request.preference==='lowest-delay'?['部分班次無即時延誤資料，無法保證延誤最低。']:[])]};
    }
    const reverse=request.timeMode==='arrival',gcs=[request.preference==='fastest'?1:request.preference==='cheapest'?0:.5],plans=[],checks=[];
    // Sequential legs use the actual previous route arrival + required stay.
    // Reverse planning propagates the latest departure backwards from deadline.
    for(const gc of gcs){
      abort(signal);let time=reverse?request.arrivalDeadline:request.departureTime,parts=[],failed=false;
      const order=Array.from({length:points.length-1},(_,i)=>i);if(reverse)order.reverse();
      for(const i of order){
        const waypoint=reverse?request.waypoints[i]:request.waypoints[i-1];
        if(waypoint){
          if(reverse){time=taipeiTime(new Date(Date.parse(time)-waypoint.stayDurationMinutes*60000).toISOString());if(waypoint.arrivalTime&&Date.parse(waypoint.arrivalTime)<Date.parse(time))time=waypoint.arrivalTime;}
          else{time=taipeiTime(new Date(Date.parse(time)+waypoint.stayDurationMinutes*60000).toISOString());if(waypoint.departureTime&&Date.parse(waypoint.departureTime)>Date.parse(time))time=waypoint.departureTime;}
        }
        const candidates=await routing(points[i],points[i+1],request,time,reverse,signal,gc,request.timeMode==='now'&&i===0&&!reverse,refresh,message=>checks.push(message));
        const viable=candidates.filter(p=>!(request.waypoints[i]?.arrivalTime&&Date.parse(p.arrivalTime)>Date.parse(request.waypoints[i].arrivalTime))&&!(request.waypoints[i-1]?.departureTime&&Date.parse(p.departureTime)<Date.parse(request.waypoints[i-1].departureTime)));
        if(request.preference==='fewest-transfers')viable.sort((a,b)=>a.transfers-b.transfers);
        else if(request.preference==='least-walking')viable.sort((a,b)=>a.walkDistanceMeters-b.walkDistanceMeters);
        else if(request.preference==='fastest')viable.sort((a,b)=>reverse?Date.parse(b.departureTime)-Date.parse(a.departureTime):Date.parse(a.arrivalTime)-Date.parse(b.arrivalTime));
        // For cost/recommended preferences retain the MaaS weight-ranked order;
        // selecting the earliest arrival would override its cost calculation.
        if(!viable.length){failed=true;break;}
        const part=viable[0];parts.push(part);time=reverse?part.departureTime:part.arrivalTime;
      }
      if(failed)continue;if(reverse)parts.reverse();
      const combined={...parts[0],id:`tdx-${plans.length}`,label:gc===1?'偏重最快':gc===0?'偏重成本':'綜合方案',segments:parts.flatMap(p=>p.segments),departureTime:parts[0].departureTime,arrivalTime:parts.at(-1).arrivalTime,notices:[...new Set(parts.flatMap(p=>p.notices))],transfers:parts.reduce((n,p)=>n+p.transfers,0),walkDistanceMeters:parts.reduce((n,p)=>n+p.walkDistanceMeters,0)};
      combined.durationSeconds=Math.round((Date.parse(combined.arrivalTime)-Date.parse(combined.departureTime))/1000);
      if(request.arrivalDeadline&&Date.parse(combined.arrivalTime)>Date.parse(request.arrivalDeadline)||request.departureTime&&Date.parse(combined.departureTime)<Date.parse(request.departureTime)){checks.push(`逐段候選串接抵達 ${taipeiTime(combined.arrivalTime)}，期限 ${request.arrivalDeadline||'未指定'}；未符合完整時間窗，已排除。`);continue;}
      const signature=p=>JSON.stringify(p.segments.map(s=>[s.mode,s.routeName,s.departureTime,s.from.name,s.to.name])),key=signature(combined);if(plans.some(p=>signature(p)===key))continue;
      if(!request.traTrainType&&combined.segments.some(s=>s.mode==='TRA'))return trainQuestion(request);
      await enrich(combined,signal,request);
      if(combined.segments.some(s=>s.mode==='TRA'&&s.trainClassStatus!=='matched')){checks.push('串接方案的臺鐵班次／車種未能對應當日官方班表，已排除。');continue;}
      plans.push(combined);
    }
    const score=p=>request.preference==='fewest-transfers'?p.transfers:request.preference==='least-walking'?p.walkDistanceMeters:request.preference==='cheapest'?(p.totalFare??Infinity):request.preference==='lowest-delay'?(p.segments.filter(s=>!['WALK','BIKE'].includes(s.mode)).every(s=>s.delayMinutes!==null&&s.delayMinutes!==undefined)?p.segments.reduce((n,s)=>n+(s.delayMinutes||0),0):Infinity):p.durationSeconds;
    rankTransitPlans(plans,request.preference,request.departureTime||new Date(now()).toISOString());
    return {plans,request,sourceStatus:{tdx:plans.length?'ready':'no-route',geometry:plans.length&&plans.every(p=>p.geometryStatus==='ready')?'ready':plans.some(p=>p.geometryStatus!=='missing')?'partial':'missing',realtime:plans.some(p=>p.segments.some(s=>s.realtimeStatus==='dynamic'))?'partial':'scheduled'},notices:plans.length?['逐段採指定偏好的 TDX 候選串接；非全網窮舉最優解。','車站時刻規劃非裝置實際位置；交通變動請再查營運單位。',...(request.preference==='lowest-delay'?['只有部分車次有即時延誤資料，未知延誤不當作零延誤；無法保證延誤最低。']:[])]:['TDX 未回傳符合模式、出發時間及抵達期限的可靠方案。',...checks]};
  }
  async function plan(input,{signal,refresh=false,onProgress=()=>{},forceOfficial=false}={}){
    const request=normalizeTripRequest(input,now()),key=createHash('sha256').update(JSON.stringify(request)).digest('hex');let result,error;
    const prior=attempts.get(key)||{count:0,diagnostic:null},previous=prior.count;
    onProgress(forceOfficial?'工作中... 已完成旅程條件整理；正在依您的要求查詢官方公開資料。':'工作中... 已完成旅程條件整理；正在查詢 TDX 班次與路線。');
    if(!forceOfficial&&previous<2)try{result=await planTdx(request,{signal,refresh});}catch(e){abort(signal);error=e;}
    if(result?.needsSelection||result?.needsClarification)return result;
    if(result?.plans?.length){attempts.delete(key);onProgress('工作中... 已完成官方班次、票價與路線查核；正在準備地圖。');return result;}
    if(error&&!['TDX_NO_ROUTE','TDX_PERMISSION_DENIED','TDX_QUOTA_EXCEEDED','TDX_RATE_LIMITED','TDX_SERVICE_FAILED','TDX_CREDENTIALS_REQUIRED','TDX_AUTH_FAILED'].includes(error.code))throw error;
    const reason=error?.message||result?.notices?.join('；')||(forceOfficial?`${prior.diagnostic?.message||''} 依您的要求查詢官方公開班表。`:`${prior.diagnostic?.message||''} 相同條件已連續兩次無可靠方案，停止重複相同 TDX 查詢。`);
    const diagnostic=(forceOfficial&&prior.diagnostic)||(!forceOfficial&&previous>=2)?{...prior.diagnostic,message:reason,failedAttempts:previous}:{code:forceOfficial?'OFFICIAL_REQUESTED':error?.code||'TDX_NO_MATCHING_PLAN',message:reason,upstreamStatus:error?.upstreamStatus||error?.rateLimit?.httpStatus||null,rateLimit:error?.rateLimit||null,failedAttempts:previous+(forceOfficial?0:1),classification:forceOfficial?'requested':error?.code?.includes('QUOTA')?'quota':error?.code?.includes('PERMISSION')?'permission':error?'service':'no-matching-plan'};
    if(!forceOfficial){attempts.set(key,{count:Math.min(2,previous+1),diagnostic});if(attempts.size>30)attempts.delete(attempts.keys().next().value);}
    onProgress(`工作中... ${forceOfficial?'已選擇官方公開資料':'TDX 查核已完成'}：${reason} 正在查詢官方公開班表備援。`);
    let resolved=result?.request||request;
    const points=[resolved.origin,...resolved.waypoints.map(w=>w.location),resolved.destination];
    for(let i=0;i<points.length;i++){if(Number.isFinite(points[i]?.lat)&&Number.isFinite(points[i]?.lon))continue;const found=await resolveLocation(typeof points[i]==='string'?points[i]:points[i].name,{signal});if(found.results.length!==1)return {plans:[],request:resolved,needsSelection:true,unresolvedLocations:[{index:i,...found}],diagnostic,notices:['請確認正確起訖地點，避免將同名市區當成車站。']};points[i]=found.results[0];}
    resolved={...resolved,origin:points[0],destination:points.at(-1),waypoints:resolved.waypoints.map((w,i)=>({...w,location:points[i+1]}))};
    let backup;try{backup=await official.plan(resolved,{signal,onProgress});}catch(e){abort(signal);return {plans:[],request:resolved,diagnostic,serviceError:diagnostic,notices:[reason,'官方公開班表備援：'+e.message]};}
    for(const p of backup.plans){for(const segment of p.segments){try{segment.fare=await fares.quoteSegment(segment,resolved.farePreference,{signal,allowEstimates:true,preferCheapest:resolved.preference==='cheapest'});}catch(e){abort(signal);p.notices.push('此段票價未取得，保留缺漏：'+e.message);}}finalizePlan(p);}
    rankTransitPlans(backup.plans,resolved.preference,resolved.departureTime);
    backup.diagnostic=diagnostic;backup.serviceError=error?diagnostic:undefined;backup.notices.unshift('TDX 查核原因：'+reason);onProgress(backup.plans.length?'工作中... 已完成備援班次、票價及完整地圖路徑；正在回報規劃結果。':'查核已結束，未取得符合所有條件的可靠方案；詳細原因已回報。');return backup;
  }
  async function handle(data,{signal,onProgress}={}){
    if(!data||typeof data!=='object')throw tdxError('INVALID_REQUEST','請提供大眾運輸請求');abort(signal);
    switch(data.action){
      case 'status':return {configured:configured(),clientIdPresent:!!credential('TDX_CLIENT_ID'),clientSecretPresent:!!credential('TDX_CLIENT_SECRET'),authenticated:!!(token?.identity===fingerprint()&&token.expires>now()),storage:'windows-dpapi',limits:limits(),lastError:lastServiceError,capabilities:{routing:'TDX MaaS',geocode:'TomTom / Photon / TDX 車站',fare:'獨立 Fare Engine；六類運具逐段官方核實、乘客／車廂偏好、已驗證本機快取',realtime:'公車及臺鐵部分即時資料',geometry:'TDX Shape 依確切路線與站點核實；步行／自行車使用既有 TomTom Key'},notices:['TDX 服務依會員訂閱權限與頻率限制；本程式不購買或升級方案。']};
      case 'test':await accessToken(signal);return {ok:true,authenticated:true,source:'TDX OAuth2',notices:['權杖取得成功；不代表 MaaS、票價或加值服務權限均已開放。']};
      case 'resolve':return resolveLocation(data.query,{signal});
      case 'plan':{const result=await plan(data.request,{signal,refresh:data.refresh===true,onProgress,forceOfficial:data.forceOfficial===true});result.comparisons=fareComparison(result.plans||[]);if(result.plans?.length){result.offerId=randomUUID();if(offers.size>=12)offers.delete(offers.keys().next().value);offers.set(result.offerId,{at:now(),identity:fingerprint(),result:structuredClone(result)});}return result;}
      case 'execute-plan':{
        const offer=offers.get(data.offerId),index=Number(data.index??0);
        if(!offer||now()-offer.at>1800000||offer.identity!==fingerprint())throw tdxError('PLAN_EXPIRED','方案已逾時或服務設定已變更，請重新規劃再確認。',409);
        if(!Number.isInteger(index)||index<0||index>=offer.result.plans.length)throw tdxError('INVALID_PLAN','請確認有效方案');
        const result=structuredClone(offer.result),selected=result.plans[index];
        if(Date.parse(selected.departureTime)<now())throw tdxError('PLAN_DEPARTED','候選班次已出發，請依最新資訊重新規劃。',409);
        // The server owns the timetable and geometry snapshot. The client cannot supply fares or an invented journey.
        for(const segment of selected.segments){abort(signal);if(segment.fare?.complete||segment.mode==='WALK')continue;
          try{segment.fare=await fares.quoteSegment(segment,result.request.farePreference,{signal,refresh:true,allowEstimates:true,preferCheapest:result.request.preference==='cheapest'});}catch(error){abort(signal);selected.notices.push('此段官方票價查核未完成，保留已取得票價及缺漏：'+error.message);}
        }
        // Fare boundaries span station-internal transfers; never add two short OD fares as a through fare.
        for(let i=0;i<selected.segments.length;i++){
          const first=selected.segments[i];if(!['METRO','LRT'].includes(first.mode)||!first.railSystem)continue;
          const group=[first];let end=i;for(let j=i+1;j<selected.segments.length;j++){const next=selected.segments[j];if(next.mode==='WALK'&&next.transferWalk)continue;if(next.mode===first.mode&&next.railSystem===first.railSystem){group.push(next);end=j;}else break;}
          if(group.length<2)continue;i=end;let quote=null;
          try{quote=await fares.quoteSegment({...first,to:group.at(-1).to},result.request.farePreference,{signal,refresh:true,allowEstimates:true});}catch(error){abort(signal);}
          if(Number.isFinite(quote?.amount)){first.fare=quote;for(const next of group.slice(1))next.fare={amount:0,complete:true,source:quote.source,sourceUrl:quote.sourceUrl,ticketType:'站內轉乘已計入前段'};}
          else for(const next of group)next.fare={amount:null,complete:false,notice:'站內轉乘缺少完整起訖票價與估算依據，未加總分段票價。'};
        }
        finalizePlan(selected);result.plans=[selected];result.conclusion=true;result.executedPlanIndex=index;result.comparisons=[];return result;
      }
      case 'official-fare-info':return fares.sources({signal,modes:Array.isArray(data.request?.allowedModes)?data.request.allowedModes.filter(m=>['TRA','HSR','BUS','METRO','LRT','BIKE','WALK'].includes(m)):['TRA','HSR']});
      case 'fare-options':return fares.metadata({signal,refresh:data.refresh===true});
      case 'fare-status':return fares.status();
      case 'fare-update':return fares.update({signal});
      case 'fare-config':await fares.configure(Number(data.ttlMs));return fares.status();
      case 'parse':return parseTransitText(data.text,data.request,{signal,credential,fetcher,now,onProgress});
      default:throw tdxError('INVALID_ACTION','不支援的大眾運輸操作');
    }
  }
  return {handle,plan,resolve:resolveLocation,accessToken,basic,stations,cacheSize:()=>cache.size};
}
export const tdxService=createTdxService({cacheFile:defaultFareCacheFile});
