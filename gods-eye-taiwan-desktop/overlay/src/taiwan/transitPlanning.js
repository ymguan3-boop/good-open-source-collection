import {farePreferenceFromRequest} from './farePreference.js';
/** Shared form/NLP state. Transport facts only come from the TDX provider. */
export const TRANSIT_MODES = Object.freeze({WALK:'步行',BUS:'公車',TRA:'臺鐵',HSR:'高鐵',METRO:'捷運',LRT:'輕軌',BIKE:'公共自行車'});
export const TRANSIT_PREFERENCES = Object.freeze({recommended:'AI 綜合推薦',fastest:'最快',cheapest:'最便宜','fewest-transfers':'最少轉乘','least-walking':'最少步行','lowest-delay':'最低延誤風險'});
export const TRA_TRAIN_TYPES=Object.freeze({'tze-chiang':'自強號（含普悠瑪／太魯閣）','chu-kuang':'莒光號',local:'區間／區間快',any:'不限車種，逐班比較'});
export const TRANSIT_EXAMPLES = Object.freeze([
  ['一般通勤','明天下午3點從宜蘭縣政府出發到台北101，希望晚上6點以前到，請幫我安排最快的大眾運輸方式。'],
  ['最省錢','我明天早上9點從羅東車站出發到台北車站，不趕時間，請幫我找最便宜的搭乘方式。'],
  ['少走路','我現在從宜蘭縣政府到礁溪火車站，請盡量安排少走路的方式。'],
  ['少轉乘','我下午2點從蘇澳車站出發到台北101，希望轉乘次數越少越好。'],
  ['有中繼點','我早上9點從宜蘭縣政府出發，先到羅東車站停留30分鐘，再到台北車站，希望下午1點以前抵達。'],
  ['排除特定運具','我明天早上8點從宜蘭到台北，不要搭高鐵，公車和台鐵都可以，請幫我找最快的方式。'],
  ['指定抵達時間','我明天10點以前一定要到台北車站，我從宜蘭縣政府出發，請告訴我最晚幾點要出門。'],
  ['費用與時間平衡','我從宜蘭到台北101，希望不要太貴，但也不要比最快方案多超過30分鐘，請幫我選最適合的方案。'],
  ['多個中繼點','我早上8點從宜蘭出發，先去羅東車站，再去礁溪，最後下午3點以前到台北車站，幫我安排整段大眾運輸。'],
  ['臨時重新規劃','剛剛原本安排的公車錯過了，請依現在最新的交通資訊重新幫我安排到台北車站。'],
]);
export const locationName = value => typeof value === 'string' ? value.trim() : String(value?.name || '').trim();
export const hasCoordinates = value => typeof value === 'object' && value !== null && Number.isFinite(value.lat) && Number.isFinite(value.lon) && Math.abs(value.lat)<=90 && Math.abs(value.lon)<=180;
const clone = value => structuredClone(value);
const duration = value => Number.isFinite(Number(value)) && Number(value)>=0 ? Math.min(10080,Number(value)) : 0;
export function taiwanDateTime(value) {
  if(!value)return null;
  if(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)){const result=`${value}:00+08:00`;return Number.isFinite(Date.parse(result))&&localDateTime(result)===value?result:null;}
  return Number.isFinite(Date.parse(value)) && /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : null;
}
export function localDateTime(value) {
  if(!value || !Number.isFinite(Date.parse(value)))return '';
  return new Date(Date.parse(value)+8*3600000).toISOString().slice(0,16);
}
export function normalizeTripRequest(value={}) {
  const allowed = Array.isArray(value.allowedModes) ? [...new Set(value.allowedModes.filter(mode=>Object.hasOwn(TRANSIT_MODES,mode)))] : Object.keys(TRANSIT_MODES);
  const excluded = Array.isArray(value.excludedModes) ? [...new Set(value.excludedModes.filter(mode=>Object.hasOwn(TRANSIT_MODES,mode)))] : [];
  const request = {
    origin:clone(value.origin ?? ''),destination:clone(value.destination ?? ''),
    waypoints:(Array.isArray(value.waypoints)?value.waypoints:[]).map((item,index)=>({
      id:String(item?.id || `waypoint-${index+1}`),location:clone(typeof item==='string'?item:item?.location ?? item?.name ?? ''),
      arrivalTime:taiwanDateTime(item?.arrivalTime),departureTime:taiwanDateTime(item?.departureTime),
      stayDurationMinutes:duration(item?.stayDurationMinutes ?? value.waypointStayDuration?.[index]),
    })),
    timeMode:['now','departure','arrival'].includes(value.timeMode)?value.timeMode:value.arrivalDeadline&&!value.departureTime?'arrival':value.departureTime?'departure':'now',
    departureTime:taiwanDateTime(value.departureTime),arrivalDeadline:taiwanDateTime(value.arrivalDeadline),
    preference:Object.hasOwn(TRANSIT_PREFERENCES,value.preference)?value.preference:'recommended',
    allowedModes:allowed.filter(mode=>!excluded.includes(mode)),excludedModes:excluded,
    userNaturalLanguage:String(value.userNaturalLanguage || ''),
    traTrainType:Object.hasOwn(TRA_TRAIN_TYPES,value.traTrainType)?value.traTrainType:'any',
    farePreference:farePreferenceFromRequest(value),
    resolvedLocations:Array.isArray(value.resolvedLocations)?clone(value.resolvedLocations.filter(hasCoordinates)):[],
  };
  request.waypointStayDuration=request.waypoints.map(item=>item.stayDurationMinutes);
  // Never retain coordinates for a name that was subsequently edited in either input.
  request.resolvedLocations=tripLocationEntries(request).map(item=>item.value).filter(hasCoordinates).map(clone);
  return request;
}
export function patchTripRequest(current,patch={}) {
  const next={...clone(current)};
  for(const key of ['origin','destination','waypoints','timeMode','departureTime','arrivalDeadline','preference','allowedModes','excludedModes','traTrainType','farePreference','preferredVehicleTypes','excludedVehicleTypes','preferredSeatClass','passengerTypes','passengerCounts','userNaturalLanguage','resolvedLocations','waypointStayDuration'])if(Object.hasOwn(patch,key))next[key]=clone(patch[key]);
  // A freshly allowed selection replaces its complement, not the previous exclusion.
  if(Object.hasOwn(patch,'allowedModes')&&!Object.hasOwn(patch,'excludedModes'))next.excludedModes=Object.keys(TRANSIT_MODES).filter(mode=>!patch.allowedModes.includes(mode));
  return normalizeTripRequest(next);
}
export function validateTripRequest(request,{resolved=false}={}) {
  const errors=[];
  if(!locationName(request.origin))errors.push('請輸入起點');
  if(!locationName(request.destination))errors.push('請輸入終點');
  if(!request.allowedModes.length)errors.push('請至少允許一種交通工具');
  if(request.timeMode==='departure'&&!request.departureTime)errors.push('請指定有效的出發日期與時間');
  if(request.timeMode==='arrival'&&!request.arrivalDeadline)errors.push('請指定有效的抵達日期與時間');
  if(request.departureTime&&request.arrivalDeadline&&Date.parse(request.arrivalDeadline)<=Date.parse(request.departureTime))errors.push('最晚抵達時間須晚於出發時間');
  request.waypoints.forEach((item,index)=>{
    if(!locationName(item.location))errors.push(`請輸入中繼點 ${index+1}`);
    if(item.arrivalTime&&item.departureTime&&Date.parse(item.departureTime)<Date.parse(item.arrivalTime))errors.push(`中繼點 ${index+1} 的出發時間不能早於抵達時間`);
  });
  if(resolved)for(const item of tripLocationEntries(request))if(!hasCoordinates(item.value))errors.push(`${item.label}尚未確認位置`);
  return errors;
}
export function tripLocationEntries(request) {
  return [{key:'origin',label:'起點',value:request.origin},...request.waypoints.map((item,index)=>({key:`waypoint:${item.id}`,label:`中繼點 ${index+1}`,value:item.location})),{key:'destination',label:'終點',value:request.destination}];
}
export function setTripLocation(request,key,location) {
  const next=clone(request);
  if(key==='origin'||key==='destination')next[key]=clone(location);
  else {const item=next.waypoints.find(point=>`waypoint:${point.id}`===key);if(!item)throw new Error('中繼點已變更，請重新規劃');item.location=clone(location);}
  next.resolvedLocations=tripLocationEntries(next).map(item=>item.value).filter(hasCoordinates).map(clone);
  return normalizeTripRequest(next);
}
export function moveWaypoint(request,from,to) {
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=request.waypoints.length||to>=request.waypoints.length)return normalizeTripRequest(request);
  const next=clone(request);next.waypoints.splice(to,0,next.waypoints.splice(from,1)[0]);return normalizeTripRequest(next);
}
export function describeTripRequest(request) {
  const itinerary=tripLocationEntries(request).map(item=>locationName(item.value)||'未填').join(' → ');
  const time=request.timeMode==='now'?'現在出發':request.timeMode==='arrival'?`最晚 ${localDateTime(request.arrivalDeadline).replace('T',' ')} 抵達`:`${localDateTime(request.departureTime).replace('T',' ')} 出發`;
  return `${itinerary}；${time}${request.timeMode!=='arrival'&&request.arrivalDeadline?`；最晚 ${localDateTime(request.arrivalDeadline).replace('T',' ')} 抵達`:''}；${TRANSIT_PREFERENCES[request.preference]}；允許 ${request.allowedModes.map(mode=>TRANSIT_MODES[mode]).join('、')}${request.waypoints.some(item=>item.stayDurationMinutes)?`；停留 ${request.waypoints.map((item,index)=>`${index+1}：${item.stayDurationMinutes} 分鐘`).join('、')}`:''}`;
}
export function normalizeTransitStyle(value={}) {
  return {color:/^#[\da-f]{6}$/i.test(value.color)?value.color:'#ffac45',width:Number.isFinite(Number(value.width))?Math.min(12,Math.max(1,Number(value.width))):3};
}
export function fareText(fare) {
  const amount=typeof fare==='number'?fare:fare?.amount;
  return Number.isFinite(amount)&&amount>=0?`${fare?.currency || 'NT$'} ${amount.toLocaleString('zh-TW')}`:'此段票價目前無可靠資料';
}
export function timeText(value) {
  return value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'未提供';
}
