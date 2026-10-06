import {farePreferenceFromRequest} from '../../src/taiwan/farePreference.js';
// TDX MaaS field names follow the official public routing developer manual.
export const TRANSIT_MODES = ['WALK','BUS','TRA','HSR','METRO','LRT','BIKE'];
export const PREFERENCES = ['recommended','fastest','cheapest','fewest-transfers','least-walking','lowest-delay'];
const TRAIN_TYPES=['tze-chiang','chu-kuang','local','any'];
export function tdxError(code,message,status=400){return Object.assign(new Error(message),{code,status});}
export function taipeiTime(value){
  if(value===undefined || value===null || value==='')return null;
  const text=String(value);
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(text))throw tdxError('INVALID_TIME','時間須為 ISO 日期時間');
  const source=/Z$|[+-]\d{2}:\d{2}$/.test(text)?text:`${text}+08:00`,ms=Date.parse(source);
  if(!Number.isFinite(ms))throw tdxError('INVALID_TIME','無法解析行程時間');
  // Date.parse normalizes impossible calendar dates; reject those explicitly.
  const calendar=text.slice(0,10),[y,m,d]=calendar.split('-').map(Number);
  if(m<1 || m>12 || d<1 || d>new Date(Date.UTC(y,m,0)).getUTCDate() || Number(text.slice(11,13))>23 || Number(text.slice(14,16))>59 || Number(text.slice(17,19)||0)>59)throw tdxError('INVALID_TIME','行程日期或時間無效');
  return new Date(ms+8*3600000).toISOString().slice(0,19)+'+08:00';
}
export function locationInput(value){
  if(typeof value==='string'){if(!value.trim() || value.length>200)throw tdxError('INVALID_LOCATION','地點名稱須為 1–200 字');return value.trim();}
  if(!value || typeof value!=='object' || Array.isArray(value))throw tdxError('INVALID_LOCATION','請填寫起點、終點與途經地點');
  const name=String(value.name||'').trim();if(!name || name.length>200)throw tdxError('INVALID_LOCATION','請提供地點名稱');
  if(value.lat===undefined && value.lon===undefined)return {name};
  if(!Number.isFinite(Number(value.lat)) || !Number.isFinite(Number(value.lon)) || Number(value.lat)<20 || Number(value.lat)>27 || Number(value.lon)<117 || Number(value.lon)>123.5)throw tdxError('INVALID_LOCATION','地點座標須位於臺灣服務範圍');
  return {name,lat:Number(value.lat),lon:Number(value.lon),...(typeof value.id==='string'?{id:value.id.slice(0,100)}:{}),source:String(value.source||'使用者確認').slice(0,100)};
}
export function normalizeTripRequest(value={},now=Date.now()){
  const timeMode=value.timeMode||'now';if(!['now','departure','arrival'].includes(timeMode))throw tdxError('INVALID_TIME_MODE','不支援的行程時間模式');
  const modes=(field,fallback)=>{const list=value[field]??fallback;if(!Array.isArray(list) || list.some(x=>!TRANSIT_MODES.includes(x)))throw tdxError('INVALID_MODES','不支援的交通方式');return [...new Set(list)];};
  const excludedModes=modes('excludedModes',[]),allowedModes=modes('allowedModes',TRANSIT_MODES).filter(x=>!excludedModes.includes(x));
  const preference=value.preference||'recommended';if(!PREFERENCES.includes(preference))throw tdxError('INVALID_PREFERENCE','不支援的行程偏好');
  const traTrainType=value.traTrainType||'any';if(traTrainType&&!TRAIN_TYPES.includes(traTrainType))throw tdxError('INVALID_TRAIN_TYPE','請選擇臺鐵車種');
  const waypoints=value.waypoints||[];if(!Array.isArray(waypoints)||waypoints.length>5)throw tdxError('TOO_MANY_WAYPOINTS','最多設定 5 個途經點');
  const departureTime=timeMode==='now'?taipeiTime(new Date(now).toISOString()):taipeiTime(value.departureTime),arrivalDeadline=taipeiTime(value.arrivalDeadline);
  if(timeMode==='departure'&&!departureTime || timeMode==='arrival'&&!arrivalDeadline)throw tdxError('TIME_REQUIRED','請指定出發時間或最晚抵達時間');
  if(departureTime && arrivalDeadline && Date.parse(departureTime)>=Date.parse(arrivalDeadline))throw tdxError('INVALID_TIME_ORDER','抵達期限必須晚於出發時間');
  return {origin:locationInput(value.origin),destination:locationInput(value.destination),waypoints:waypoints.map(w=>{
    const stay=Number(w.stayDurationMinutes??0);if(!Number.isFinite(stay)||stay<0||stay>1440)throw tdxError('INVALID_STAY','停留時間須介於 0–1440 分鐘');
    const arrivalTime=taipeiTime(w.arrivalTime),departureTime=taipeiTime(w.departureTime);
    if(arrivalTime&&departureTime&&Date.parse(departureTime)<Date.parse(arrivalTime)+stay*60000)throw tdxError('INVALID_STAY','途經點離開時間不足以完成指定停留');
    return {location:locationInput(w.location),arrivalTime,departureTime,stayDurationMinutes:stay};
  }),timeMode,departureTime,arrivalDeadline,preference,allowedModes,excludedModes,traTrainType,farePreference:farePreferenceFromRequest(value),userNaturalLanguage:String(value.userNaturalLanguage||'').slice(0,4000)};
}
const modeMap={pedestrian:'WALK','pedestrian-station':'WALK',cycle:'BIKE',HSR:'HSR',TRA:'TRA',Bus:'BUS',HighwayBus:'BUS',MRT:'METRO',LRT:'LRT'};
const num=(value)=>Number.isFinite(Number(value))&&value!==null&&value!==''?Number(value):null;
const place=(p,fallback)=>({name:String(p?.name||fallback||'未命名站點'),lat:num(p?.location?.lat),lon:num(p?.location?.lng),...(p?.id?{id:String(p.id)}:{})});
export function normalizeMaaSRoute(route,index=0){
  const departureTime=taipeiTime(route.start_time),arrivalTime=taipeiTime(route.end_time);
  if(!departureTime || !arrivalTime || Date.parse(arrivalTime)<Date.parse(departureTime))return null;
  const notices=[],segments=[];let lastArrival=Date.parse(departureTime);
  if(!Array.isArray(route.sections)||!route.sections.length||route.sections.length>100)return null;
  for(const section of route.sections){
    const nativeMode=section.transport?.mode||section.type;
    if(nativeMode==='waiting'){
      const preceding=segments.at(-1);if(preceding)preceding.waitAfterSeconds=(preceding.waitAfterSeconds||0)+(num(section.travelSummary?.duration)||0);continue;
    }
    const mode=modeMap[nativeMode];if(!mode)return null;
    const from=place(section.departure?.place),to=place(section.arrival?.place);
    if([from.lat,from.lon,to.lat,to.lon].some(x=>x===null))return null;
    const depart=taipeiTime(section.departure?.time),arrive=taipeiTime(section.arrival?.time);if(!depart||!arrive || Date.parse(arrive)<Date.parse(depart)||Date.parse(depart)<lastArrival||Date.parse(arrive)>Date.parse(arrivalTime))return null;
    lastArrival=Date.parse(arrive);
    // The MaaS manual provides intermediate stops, not route shape. Never claim
    // straight connectors between these stops are the actual street/rail path.
    const stops=(section.intermediateStops||[]).map(x=>place(x.departure?.place||x.arrival?.place)).filter(x=>x.lat!==null&&x.lon!==null);
    segments.push({transferWalk:nativeMode==='pedestrian-station',id:`segment-${index}-${segments.length}`,mode,from,to,departureTime:depart,arrivalTime:arrive,geometry:null,geometryStatus:'missing',intermediateStops:stops,durationSeconds:num(section.travelSummary?.duration)??Math.round((Date.parse(arrive)-Date.parse(depart))/1000),distanceMeters:num(section.travelSummary?.length),routeName:String(section.transport?.shortName||section.transport?.name||mode),trainNumber:section.transport?.number?String(section.transport.number):null,transportType:String(section.transport?.type||''),city:String(section.transport?.city||''),agency:String(section.agency?.name||''),realtimeStatus:'scheduled',fare:mode==='WALK'?{amount:0,currency:'TWD',source:'步行',ticketType:'免票'}:null,source:'TDX MaaS',sourceTime:new Date().toISOString()});
  }
  if(!segments.length)return null;
  const transport=segments.filter(s=>!['WALK','BIKE'].includes(s.mode));
  notices.push('TDX MaaS 提供站點與時刻；本次回傳未附實際道路或鐵路線型，未以站點連線冒充真實路徑。','班次為規劃時刻；未經即時資料核對的車輛到站時間不可視為即時資訊。');
  return {id:`tdx-${index}`,label:'TDX 公共運輸方案',segments,departureTime,arrivalTime,durationSeconds:num(route.travel_time)??Math.round((Date.parse(arrivalTime)-Date.parse(departureTime))/1000),walkDistanceMeters:segments.filter(x=>x.mode==='WALK').reduce((n,x)=>n+(x.distanceMeters||0),0),transfers:num(route.transfers)??Math.max(0,transport.length-1),totalFare:null,fareComplete:false,sources:['TDX MaaS'],notices};
}
export function finalizePlan(plan){
  plan.fareComplete=plan.segments.every(s=>s.fare&&Number.isFinite(s.fare.amount));
  plan.totalFare=plan.fareComplete?plan.segments.reduce((n,s)=>n+s.fare.amount,0):null;
  plan.knownFare=plan.segments.reduce((n,s)=>n+(s.fare?.amount||0),0);
  if(!plan.fareComplete)plan.notices.push('部分票價尚無可核實資料；未知票價不以 0 元補齊，也不保證此方案最便宜。');
  return plan;
}
