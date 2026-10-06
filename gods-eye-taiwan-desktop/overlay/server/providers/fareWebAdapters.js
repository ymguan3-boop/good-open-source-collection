const plain=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ').trim();
const stations={'南港':'Nangang','台北':'Taipei','板橋':'Banqiao','桃園':'Taoyuan','新竹':'Hsinchu','苗栗':'Miaoli','台中':'Taichung','彰化':'Changhua','雲林':'Yunlin','嘉義':'Chiayi','台南':'Tainan','左營':'Zuoying'};
const name=p=>p.nameEn||stations[String(p.name||'').replaceAll('臺','台').replace(/高鐵|站|\s/g,'')];
/** Select by documented cell colour, not by whichever price is cheapest. */
export function parseHsrTable(html,segment,passengerType,seat){
  if(!['adult','child','senior','disabled','companion'].includes(passengerType))return null;
  const a=name(segment.from),b=name(segment.to);if(!a||!b||a===b)return null;
  const desired=seat==='unreserved'?/Non-Reserved Seats Tickets/i:passengerType==='adult'?/^Regular Full Fare Tickets$/:/^Concession Tickets$/,amounts=[];
  for(const match of html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)){
    const title=plain(match[2].match(/<caption[^>]*>([\s\S]*?)<\/caption>/i)?.[1]||match[1].match(/summary=["']([^"']+)/i)?.[1]);if(!desired.test(title))continue;
    const rows=[...match[2].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(r=>[...r[1].matchAll(/<(?:th|td)\b([^>]*)>([\s\S]*?)<\/(?:th|td)>/gi)].map(c=>({attrs:c[1],text:plain(c[2])})));
    const header=rows.find(r=>r[0]?.text==='Station');if(!header)continue;
    for(const [x,y]of [[a,b],[b,a]]){const row=rows.find(r=>r[0]?.text===x),column=header.findIndex(c=>c.text===y),cell=row?.[column];const correct=seat==='unreserved'?(passengerType==='adult'?/\be7f7ff\b/i:/\bFFEBEF\b/i):seat==='business'?/\bFFEBEF\b/i:/\be7f7ff\b/i;if(!cell||!correct.test(cell.attrs)||!/^\d[\d,]*$/.test(cell.text))continue;const price=Number(cell.text.replaceAll(',',''));if(price>0&&price<10000)amounts.push(price);}
  }
  return amounts.length&&new Set(amounts).size===1?amounts[0]:null;
}
/** Parse the published basic rates only. Subsidies and membership are separate. */
export function parseBikeRate(html,system,seconds){
  if(!['YouBike 2.0','YouBike 2.0E'].includes(system)||!Number.isFinite(seconds)||seconds<=0||seconds>120*3600)return null;
  const matches=[];
  for(const item of html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)){
    const title=plain(item[1].match(/<p\b[^>]*class=["']price-title["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]);if(title!==system)continue;
    const price=item[1].match(/<p\b[^>]*class=["']price["'][^>]*>([\s\S]*?)<\/p>/i)?.[1],text=plain(price),first=text.match(/(?:前\s*)?(\d+)\s*小時內?每\s*30\s*分鐘\s*(\d+)/),tail=[...item[1].matchAll(/<dd[^>]*>([\s\S]*?)<\/dd>/gi)].map(m=>plain(m[1]).replace(/[０-９]/g,c=>String(c.charCodeAt(0)-0xff10)));
    if(!first||!tail.some(t=>/未滿\s*30\s*分鐘以\s*30\s*分鐘計算/.test(t)))continue;
    const tiers=[{end:Number(first[1])*3600,price:Number(first[2])}];let valid=true;
    for(const t of tail){const mid=t.match(/^(\d+)\s*[~～]\s*(\d+)\s*小時內每\s*30\s*分鐘\s*(\d+)\s*元/),last=t.match(/^超過\s*(\d+)\s*小時每\s*30\s*分鐘\s*(\d+)\s*元/);if(mid){if(Number(mid[1])*3600!==tiers.at(-1).end)valid=false;tiers.push({end:Number(mid[2])*3600,price:Number(mid[3])});}if(last){if(Number(last[1])*3600!==tiers.at(-1).end)valid=false;tiers.push({end:Infinity,price:Number(last[2])});}}
    if(!valid||tiers.at(-1).end!==Infinity||tiers.some(t=>t.price<0||t.price>500))continue;
    let begin=0,amount=0;for(const t of tiers){const span=Math.min(seconds,t.end)-begin;if(span>0)amount+=Math.ceil(span/1800)*t.price;begin=t.end;}matches.push(amount);
  }
  return matches.length&&new Set(matches).size===1?matches[0]:null;
}
