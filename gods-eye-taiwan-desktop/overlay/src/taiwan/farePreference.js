/** Shared contract: no price, URL or eligibility decision may come from an LLM. */
export const PASSENGER_NAMES=Object.freeze({adult:'成人／全票',child:'兒童',senior:'敬老',disabled:'愛心',companion:'愛心陪伴',student:'學生'});
export const SEAT_NAMES=Object.freeze({standard:'標準車廂對號座',unreserved:'自由座',business:'商務車廂',normal:'一般座位',premium:'特殊／騰雲座艙'});
const modes=['TRA','HSR','BUS','METRO','LRT','BIKE'];
const strings=(v,label)=>{if(v===undefined)return [];if(!Array.isArray(v)||v.length>100||v.some(x=>typeof x!=='string'||!x.trim()||x.length>100))throw Error(`${label}格式不正確`);return [...new Set(v.map(x=>x.trim()))];};
export function normalizeFarePreference(v={}){
  if(!v||typeof v!=='object'||Array.isArray(v))throw Error('乘車與票價偏好格式不正確');
  const validKeys=['passengerProfiles','modePreferences','railVehicleTypes','seatClasses','fareMedia','allowDiscountFare'];if(Object.keys(v).some(k=>!validKeys.includes(k)))throw Error('票價偏好含未允許欄位；不得提供金額或來源網址');
  const profiles=v.passengerProfiles??[{type:'adult',quantity:1}];
  if(!Array.isArray(profiles)||!profiles.length||profiles.length>6)throw Error('請設定 1–6 種乘客票種');
  const passengerProfiles=profiles.map(p=>{if(Object.keys(p||{}).some(k=>!['type','quantity'].includes(k))||!Object.hasOwn(PASSENGER_NAMES,p?.type)||!Number.isInteger(p.quantity)||p.quantity<1||p.quantity>99)throw Error('乘客票種或人數不正確');return {type:p.type,quantity:p.quantity};});
  if(new Set(passengerProfiles.map(p=>p.type)).size!==passengerProfiles.length)throw Error('相同乘客票種請合併人數');
  if(v.modePreferences&&(!v.modePreferences||typeof v.modePreferences!=='object'||Array.isArray(v.modePreferences)||Object.keys(v.modePreferences).some(m=>!modes.includes(m))))throw Error('運具票價偏好格式不正確');
  const modePreferences={};
  for(const mode of modes){const p=v.modePreferences?.[mode]||{};if(Object.keys(p).some(k=>!['vehicleTypes','excludedVehicleTypes','seatClasses'].includes(k)))throw Error('運具偏好含未允許欄位');modePreferences[mode]={vehicleTypes:strings(p.vehicleTypes,`${mode}車種`),excludedVehicleTypes:strings(p.excludedVehicleTypes,`${mode}排除車種`),seatClasses:strings(p.seatClasses,`${mode}車廂`)};if(modePreferences[mode].seatClasses.some(s=>!(mode==='TRA'?['normal','premium']:mode==='HSR'?['standard','unreserved','business']:[]).includes(s)))throw Error('車廂選項不正確');}
  // Legacy aliases are interpreted explicitly, never silently discarded.
  if(v.railVehicleTypes!==undefined&&v.modePreferences?.TRA?.vehicleTypes===undefined)modePreferences.TRA.vehicleTypes=strings(v.railVehicleTypes,'臺鐵車種');
  if(v.seatClasses!==undefined&&v.modePreferences?.HSR?.seatClasses===undefined)modePreferences.HSR.seatClasses=strings(v.seatClasses,'高鐵車廂');
  const fareMedia=strings(v.fareMedia??['single'],'票證');if(!fareMedia.length||fareMedia.some(m=>!['single','electronic'].includes(m)))throw Error('票證類型不正確');
  return {passengerProfiles,modePreferences,railVehicleTypes:modePreferences.TRA.vehicleTypes,seatClasses:modePreferences.HSR.seatClasses,fareMedia,allowDiscountFare:v.allowDiscountFare===true};
}
export function farePreferenceFromRequest(value={}){
  const p=structuredClone(value.farePreference&&typeof value.farePreference==='object'?value.farePreference:{});
  if(value.passengerTypes!==undefined||value.passengerCounts!==undefined){if(!Array.isArray(value.passengerTypes)||!Array.isArray(value.passengerCounts)||value.passengerTypes.length!==value.passengerCounts.length)throw Error('乘客票種與人數須一一對應');p.passengerProfiles=value.passengerTypes.map((type,i)=>({type,quantity:value.passengerCounts[i]}));}
  p.modePreferences=p.modePreferences||{};
  const preferred=value.preferredVehicleTypes,excluded=value.excludedVehicleTypes;
  if(preferred!==undefined||excluded!==undefined)p.modePreferences.TRA={...p.modePreferences.TRA,...(preferred!==undefined?{vehicleTypes:preferred}:{}),...(excluded!==undefined?{excludedVehicleTypes:excluded}:{})};
  if(value.preferredSeatClass!==undefined){const seats=Array.isArray(value.preferredSeatClass)?value.preferredSeatClass:[value.preferredSeatClass];const mode=seats.some(x=>['normal','premium'].includes(x))?'TRA':'HSR';p.modePreferences[mode]={...p.modePreferences[mode],seatClasses:seats};}
  return normalizeFarePreference(p);
}
const trainName=x=>String(x||'').replaceAll('臺','台').replace(/[\s（）()號車]/g,'');
export function vehicleAllowed(name,id,p={}){
  const matches=v=>v===String(id)||trainName(v)===trainName(name)||(!/3000|普悠瑪|太魯閣/.test(v)&&trainName(name).startsWith(trainName(v))&&!(trainName(v)==='區間'&&trainName(name).startsWith('區間快')));
  return !(p.excludedVehicleTypes||[]).some(matches)&&(!(p.vehicleTypes||[]).length||p.vehicleTypes.some(matches));
}

/** Group labels from the official catalogue, retaining every actual type ID. */
export function groupOfficialVehicleTypes(types=[]){
  const groups=new Map();for(const type of types){if(!type.id||!type.name)continue;const name=type.name.replace(/[（(](?!\d+[)）]).*$/,'').trim()||type.name;if(!groups.has(name))groups.set(name,{name,types:[]});groups.get(name).types.push(type);}return [...groups.values()];
}
