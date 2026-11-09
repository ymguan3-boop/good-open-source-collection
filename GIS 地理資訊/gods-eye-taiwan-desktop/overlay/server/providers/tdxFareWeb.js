import {createOfficialFareFetcher} from './officialFareSources.js';
// Fixed official sources only. Web amounts are accepted only for an exact OD
// and ticket type; page text is data and is never sent as executable instructions.
export const TRA_TRAIN_TYPES=Object.freeze({'tze-chiang':'自強號（含普悠瑪／太魯閣）','chu-kuang':'莒光號',local:'區間／區間快',any:'不限車種，逐班比較'});
export const TRA_FARE_URL='https://www.railway.gov.tw/tra-tip-web/tip/tip001/tip114/query';
export function parseTraEffectiveDate(html){
  const match=plain(html).match(/(?:^|\s)票價計算原則\s*[（(]\s*乘車日\s*(\d{2,4})年\s*(\d{1,2})月\s*(\d{1,2})日生效/);if(!match)return null;const year=Number(match[1])+(Number(match[1])<1911?1911:0),month=Number(match[2]),day=Number(match[3]),date=new Date(Date.UTC(year,month-1,day));return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?date.toISOString().slice(0,10):null;
}
export function traClass(name){
  const s=String(name||'');
  return /自強|普悠瑪|太魯閣/.test(s)?'tze-chiang':/莒光/.test(s)?'chu-kuang':/區間|區間快/.test(s)?'local':null;
}
export function selectTraFare(fares,actualClass){
  if(!actualClass)return null;
  const matches=(fares||[]).filter(f=>traClass(f.TicketType)===actualClass&&/全票|成人/.test(f.TicketType)&&f.Price!==null&&Number.isFinite(Number(f.Price))&&Number(f.Price)>=0&&!/商務|優惠|敬老|愛心|孩童|兒童/.test(f.TicketType));
  // Different tariffs within one class cannot be collapsed to the cheapest.
  return matches.length&&new Set(matches.map(f=>Number(f.Price))).size===1?matches[0]:null;
}
const plain=s=>String(s||'').replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
const codes=s=>String(s).match(/(?:BR|BL|R|G|O|Y)\d{2}A?/g)||[];
const matches=(cell,p)=>codes(cell).includes(p.id)&&plain(cell).replace(/(?:BR|BL|R|G|O|Y)\d{2}A?/g,'').replaceAll('臺','台').replace(/\s/g,'')===String(p.name||'').replaceAll('臺','台').replace(/\s/g,'');
export function parseMetroFareTable(html,from,to){
  const table=html.match(/<table\b[^>]*class=["'][^"']*timepricetable[^"']*["'][^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if(!table||!/全票/.test(table))return null;
  const amounts=[];
  for(const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>plain(m[1]));
    if(cells.length<7||!matches(cells[0],from)||!matches(cells[2],to)||!/^\d{1,3}$/.test(cells[3]))continue;
    const amount=Number(cells[3]);if(amount>0&&amount<=200)amounts.push(amount);
  }
  return amounts.length&&new Set(amounts).size===1?amounts[0]:null;
}

const traName=value=>String(value||'').replaceAll('臺','台').replace(/\s|號|車/g,'').replaceAll('（','(').replaceAll('）',')');
// Accept a quote only for its explicit train type, adult single ticket, OD and date.
// TDX abbreviated fare names are deliberately not inferred from a lowest price.
export function parseTraFareQuote(html,segment,date,{passengerType='adult',seatClass='normal'}={}){
  const field=html.match(/<input\b(?=[^>]*\bname=["']tip114QueryVOs\[0\]\.trnDate["'])[^>]*>/i)?.[0];
  if(field?.match(/\bvalue=["']([^"']+)["']/)?.[1]!==date.replaceAll('-','/'))return null;
  const seats=html.match(/<select\b(?=[^>]*\bname=["']tip114QueryVOs\[0\]\.seatTypeCode["'])[^>]*>([\s\S]*?)<\/select>/i)?.[1];
  if(seatClass==='premium'&&!/<option(?=[^>]*value=["']310["'])(?=[^>]*selected)[^>]*>/i.test(seats||''))return null;
  if(seatClass==='normal'&&/<option(?=[^>]*value=["']310["'])(?=[^>]*selected)[^>]*>/i.test(seats||''))return null;
  const start=html.match(/<table\b[^>]*class=["'][^"']*\bfare-table\b[^"']*["'][^>]*>/i);
  if(!start)return null;
  const body=html.slice(start.index+start[0].length).split(/<table\b|<\/table>/i)[0],amounts=[];
  for(const row of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>plain(m[1]));
    if(cells.length!==9||cells[2]!== (seatClass==='premium'?'騰雲座艙單程票':'一般單程票')||traName(cells[3])!==traName(segment.from.name)+traName(segment.to.name)||traName(cells[4])!==traName(segment.transportType)||!new RegExp(`^${{adult:'全票',child:'孩童(?:票)?',senior:'敬老(?:票)?',disabled:'愛心(?:票)?',companion:'愛陪(?:票)?'}[passengerType]||'INVALID'}\\s*1\\s*張$`).test(cells[7]))continue;
    const price=cells[8].match(/^(\d{1,5})\s*元$/)?.[1];if(price&&Number(price)>0&&Number(price)<10000)amounts.push(Number(price));
  }
  return amounts.length&&new Set(amounts).size===1?amounts[0]:null;
}

export function createOfficialFareLookup({fetcher=fetch,now=Date.now,ttlMs=86400000,checkPolicy=true}={}){
  if(checkPolicy)fetcher=createOfficialFareFetcher({fetcher,now});
  const cache=new Map(),traCache=new Map(),ttl=()=>typeof ttlMs==='function'?ttlMs():ttlMs;
  async function traPage(options,signal){
    const response=await fetcher(TRA_FARE_URL,{...options,redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(6000)].filter(Boolean))});
    if(!response.ok){await response.body?.cancel();throw Error(`臺鐵官方票價頁 HTTP ${response.status}`);}
    if(Number(response.headers?.get('content-length'))>500000){await response.body?.cancel();throw Error('官方票價頁過大');}
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>500000)throw Error('官方票價頁過大');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
    return {html:new TextDecoder().decode(bytes),cookies:(response.headers.getSetCookie?.()||[]).map(c=>c.split(';')[0]).join('; ')};
  }
  async function lookupTra(segment,{signal,date,passengerType='adult',seatClass='normal',refresh=false}={}){
    if(segment.trainClassStatus!=='matched'||!segment.transportType||!/^\d{4}$/.test(segment.from?.id)||!/^\d{4}$/.test(segment.to?.id)||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!segment.from.name||!segment.to.name)return null;
    const key=JSON.stringify([segment.from,segment.to,segment.transportType,date,passengerType,seatClass]),old=traCache.get(key);if(!refresh&&old&&now()-old.at<ttl())return structuredClone(old.fare);
    const budget=AbortSignal.any([signal,AbortSignal.timeout(12000)].filter(Boolean)),form=await traPage({headers:{Accept:'text/html'}},budget);
    // Discover station IDs and form options from the actual public quote page.
    const titles=[...form.html.matchAll(/<button\b[^>]*\btitle=["']([^"']+)["'][^>]*>/gi)].map(m=>traName(m[1]));
    if(![segment.from,segment.to].every(p=>titles.includes(traName(`${p.id}-${p.name}`))))return null;
    const select=form.html.match(/<select\b(?=[^>]*\bname=["']tip114QueryVOs\[0\]\.trainType["'])[^>]*>([\s\S]*?)<\/select>/i)?.[1];
    const types=[...(select||'').matchAll(/<option\b[^>]*\bvalue=["'](\d{1,2})["'][^>]*>([\s\S]*?)<\/option>/gi)].filter(m=>traName(plain(m[2]))===traName(segment.transportType));
    const token=form.html.match(/<input\b(?=[^>]*\bname=["']_csrf["'])[^>]*\bvalue=["']([^"']+)["'][^>]*>/i)?.[1];
    if(types.length!==1||!token||token.length>200||form.cookies.length>10000)return null;
    if(!['adult','child','senior','disabled','companion'].includes(passengerType))return null;
    if(seatClass==='premium'&&types[0][1]!=='11')return null;
    const body=new URLSearchParams({_csrf:token,query:''});
    const fields={ticketDeadlineType:'ONCE',trnDate:date.replaceAll('-','/'),SpecLineExtEnum:'TIP_SPEC_LINE_OTHERS',directionExtEnum:'TIP_DIR_UNUSED',startStation:`${segment.from.id}-${segment.from.name}`,endStation:`${segment.to.id}-${segment.to.name}`,trainType:types[0][1],ticketPriceType:String({adult:1,child:2,senior:3,disabled:4,companion:5}[passengerType]||''),seatTypeCode:seatClass==='premium'?'310':'301',ticketCount:'1'};
    for(const [name,value]of Object.entries(fields))body.set(`tip114QueryVOs[0].${name}`,value);
    const quote=await traPage({method:'POST',headers:{Accept:'text/html','Content-Type':'application/x-www-form-urlencoded',Referer:TRA_FARE_URL,...(form.cookies?{Cookie:form.cookies}:{})},body},budget),amount=parseTraFareQuote(quote.html,segment,date,{passengerType,seatClass});
    if(amount===null)return null;
    const fare={amount,currency:'TWD',ticketType:`${segment.transportType}${{adult:'成人全票',child:'孩童票',senior:'敬老票',disabled:'愛心票',companion:'愛陪票'}[passengerType]}單程票`,seatClass,passengerType,contentHashInput:quote.html,effectiveFrom:parseTraEffectiveDate(quote.html),source:'臺鐵官方網站（票價試算）',sourceUrl:TRA_FARE_URL,fetchedAt:new Date(now()).toISOString(),sourceTime:null,method:'official-web',notice:'官方以最短營業里程試算；實際票價依票面及實際運行里程。'};
    if(traCache.size>=32)traCache.delete(traCache.keys().next().value);traCache.set(key,{at:now(),fare});return structuredClone(fare);
  }
  async function page(url,signal){
    const target=new URL(url);
    if(target.origin!=='https://web.metro.taipei'||!/^\/pages2026\/(?:WebRouteStation\/(?:BR|BL|R|G|O|Y)|WebStation\/\d{3}(?:\/8)?)$/.test(target.pathname)||target.search)throw Error('非允許的官方票價頁');
    const old=cache.get(url);if(old&&now()-old.at<ttl())return old;
    const response=await fetcher(url,{redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(6000)].filter(Boolean)),headers:{Accept:'text/html'}});
    if(!response.ok){await response.body?.cancel();throw Error(`官方票價頁 HTTP ${response.status}`);}
    if(Number(response.headers?.get('content-length'))>500000){await response.body?.cancel();throw Error('官方票價頁過大');}
    const reader=response.body.getReader();let size=0;const chunks=[];
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>500000)throw Error('官方票價頁過大');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
    const result={html:new TextDecoder().decode(bytes),at:now(),fetchedAt:new Date(now()).toISOString()};
    if(cache.size>=32)cache.delete(cache.keys().next().value);cache.set(url,result);return result;
  }
  async function lookup(segment,options={}){
    const {signal,date,refresh=false}=options;
    if(segment.mode==='TRA')return lookupTra(segment,options);
    if(segment.mode!=='METRO'||segment.railSystem!=='TRTC'||options.passengerType&&options.passengerType!=='adult'||options.fareMedia&&options.fareMedia!=='single')return null;
    if(refresh)cache.clear();
    const line=String(segment.from?.id||'').match(/^(BR|BL|R|G|O)\d{2}A?$/)?.[1];if(!line)return null;
    const budget=AbortSignal.any([signal,AbortSignal.timeout(10000)].filter(Boolean));
    const index=await page(`https://web.metro.taipei/pages2026/WebRouteStation/${line}`,budget);
    let stationPath=null;
    for(const anchor of index.html.matchAll(/<a\b([^>]*)>/gi)){
      const title=anchor[1].match(/\btitle=["']([^"']+)["']/i)?.[1],href=anchor[1].match(/\bhref=["']([^"']+)["']/i)?.[1];
      if(title&&matches(title,segment.from)&&/^\/pages2026\/WebStation\/\d{3}$/.test(href||'')){if(stationPath&&stationPath!==href)return null;stationPath=href;}
    }
    if(!stationPath)return null;
    const url=`https://web.metro.taipei${stationPath}/8`,source=await page(url,budget),amount=parseMetroFareTable(source.html,segment.from,segment.to);
    if(amount===null)return null;
    return {amount,currency:'TWD',ticketType:'成人全票單程票',source:'臺北捷運官方網站（票價及乘車時間）',sourceUrl:url,fetchedAt:source.fetchedAt,sourceTime:null,method:'official-web',contentHashInput:source.html};
  }
  return {lookup};
}
