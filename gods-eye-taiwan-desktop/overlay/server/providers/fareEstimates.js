import {traClass,parseTraEffectiveDate,TRA_FARE_URL} from './tdxFareWeb.js';
const plain=s=>String(s).replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
/** Read rates from the actual official page; never use model knowledge as a tariff. */
export function parseTraRateRules(html) {
  const effectiveFrom=parseTraEffectiveDate(html),text=plain(html),rates={};
  if(!effectiveFrom||!/起碼里程為\s*10\s*公里/.test(text))return null;
  for(const table of String(html).matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    if(!/50\.1\s*[-～]\s*100/.test(plain(table[1]))||!/300\.1/.test(plain(table[1])))continue;
    for(const row of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells=[...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m=>plain(m[1]));
      const kind=traClass(cells[0]);if(!kind||cells.length!==6)continue;
      const values=cells.slice(1).map(Number);
      if(values.every((n,i)=>n>0&&n<20&&(!i||n<=values[i-1])))rates[kind]=values;
    }
  }
  if(Object.keys(rates).length!==3)return null;
  return {rates,effectiveFrom,minimumKm:10,childHalf:/孩童[\s\S]*?票價按成人票價半數/.test(text)};
}
export function routeDistanceKm(segment) {
  if(Number.isFinite(segment.distanceMeters)&&segment.distanceMeters>0)return {km:segment.distanceMeters/1000,basis:'TDX 規劃路段里程'};
  const points=segment.geometry?.type==='LineString'&&segment.geometrySource?segment.geometry.coordinates:null;
  if(!Array.isArray(points)||points.length<2||!points.every(p=>p?.length>=2&&p.slice(0,2).every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90))return null;
  let km=0;const rad=n=>n*Math.PI/180;
  for(let i=1;i<points.length;i++){const [a,b]=[points[i-1],points[i]],dlat=rad(b[1]-a[1]),dlon=rad(b[0]-a[0]);km+=6371*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dlon/2)**2)));}
  return km>0?{km,basis:segment.geometrySource+' 線型量測里程'}:null;
}
export function estimateTraFare(segment,profile,seat,rules,{now=Date.now()}={}) {
  const kind=traClass(segment.transportType),distance=routeDistanceKm(segment),day=String(segment.departureTime||'').slice(0,10);
  if(segment.mode!=='TRA'||segment.trainClassStatus!=='matched'||seat==='premium'||!rules?.rates?.[kind]||!distance||distance.km>1500||!day||rules.effectiveFrom>day||!/^(adult|child)$/.test(profile.type))return null;
  let remaining=Math.max(rules.minimumKm,distance.km),price=0,previous=0;
  for(const [i,end]of [50,100,200,300,Infinity].entries()){const km=Math.min(remaining,end-previous);price+=km*rules.rates[kind][i];remaining-=km;previous=end;if(remaining<=0)break;}
  const adult=Math.round(price),half=profile.type==='child'&&rules.childHalf;
  return {amount:half?Math.round(adult/2):adult,currency:'TWD',passengerType:profile.type,seatClass:seat,estimated:true,confidence:'estimated',sourceType:'official-web-estimate',source:'臺鐵官方費率（里程估算）',sourceUrl:TRA_FARE_URL,effectiveFrom:rules.effectiveFrom,fetchedAt:new Date(now).toISOString(),calculationMethod:'official-rate-with-proxy-distance',estimateBasis:`${distance.basis} ${distance.km.toFixed(2)} 公里，起碼 ${rules.minimumKm} 公里；依已爬取官方車種分段費率 ${rules.rates[kind].join('/')} 元／公里計算${half?'；兒童票暫按半票，資格需確認':''}。規劃／量測里程可能與營業計價里程不同，非正式報價。`,notice:'估算；未套用優惠、無座折扣或特殊座艙。實際票價與優惠資格以業者驗證為準。'};
}
export function estimateFromAdult(adult,profile) {
  if(profile.type==='adult'||!Number.isFinite(adult?.amount)||adult.amount<0||adult.confidence!=='verified'||!adult.sourceUrl)return null;
  return {...adult,passengerType:profile.type,amount:adult.amount,estimated:true,confidence:'estimated',sourceType:'official-reference-estimate',calculationMethod:'same-segment-adult-budget',estimateBasis:'同路線、起訖、車種與座位已核實的成人全票作為保守預算；未確認此票種折扣，因此暫不扣減優惠。',notice:'估算預算，並非該乘客票種的正式報價；實際資格與票價以業者為準。'};
}
