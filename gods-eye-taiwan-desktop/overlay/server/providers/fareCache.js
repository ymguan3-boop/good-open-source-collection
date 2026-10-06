import {officialFareSource} from './officialFareSources.js';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
export const fareHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validDate=value=>{
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return false;
  const day=value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if(!day)return false;
  const calendar=new Date(Date.UTC(Number(day[1]),Number(day[2])-1,Number(day[3])));
  return calendar.toISOString().slice(0,10)===day[0].slice(0,10);
};
export function validateFareRecord(r,now=Date.now(),referenceDate=r?.lookup?.departureTime||now){
  if(!r||r.version!==1||!Array.isArray(r.quotes)||!r.quotes.length||typeof r.parserVersion!=='string'||!r.parserVersion||!/^\w{64}$/.test(r.contentHash)||!validDate(r.fetchedAt)||Date.parse(r.fetchedAt)>now+300000)return false;
  if(r.sourceUpdatedAt&&!validDate(r.sourceUpdatedAt))return false;
  const travelTime=typeof referenceDate==='number'?referenceDate:Date.parse(referenceDate);
  if(!Number.isFinite(travelTime)||(typeof referenceDate==='string'&&!validDate(referenceDate)))return false;
  const applicable=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)?String(typeof referenceDate==='string'?referenceDate:new Date(travelTime).toISOString()).slice(0,10):travelTime;
  if(r.effectiveFrom&&(!validDate(r.effectiveFrom)||(/^\d{4}-\d{2}-\d{2}$/.test(r.effectiveFrom)?r.effectiveFrom>applicable(r.effectiveFrom):Date.parse(r.effectiveFrom)>travelTime)))return false;
  if(r.effectiveUntil&&(!validDate(r.effectiveUntil)||(/^\d{4}-\d{2}-\d{2}$/.test(r.effectiveUntil)?r.effectiveUntil<applicable(r.effectiveUntil):Date.parse(r.effectiveUntil)<travelTime)))return false;
  return r.quotes.every(q=>q&&q.currency==='TWD'&&typeof q.amount==='number'&&Number.isFinite(q.amount)&&q.amount>=0&&q.amount<=100000&&typeof q.operator==='string'&&q.operator&&['TRA','HSR','BUS','METRO','LRT','BIKE'].includes(q.mode)&&typeof q.originStation==='string'&&q.originStation&&typeof q.destinationStation==='string'&&q.destinationStation&&['adult','child','senior','disabled','companion','student'].includes(q.passengerType)&&(!q.seatClass||(q.mode==='TRA'?['normal','premium']:q.mode==='HSR'?['standard','unreserved','business']:[]).includes(q.seatClass))&&q.sourceUrl&&officialFareSource(q.sourceUrl)&&Number.isInteger(q.quantity)&&q.quantity>0&&q.calculationMethod&&q.confidence==='verified');
}
/** Only verified public fare facts; no credentials, cookies, HTML or travel inputs. */
export function createFareCache({file=null,now=Date.now,ttlMs=24*3600000,maxEntries=500,jumpRatio=.5}={}){
  const records=new Map(),quarantine=new Map();let ttl=ttlMs,loaded=false,queue=Promise.resolve(),warning=null;
  async function load(){if(loaded)return;loaded=true;if(!file)return;try{const data=JSON.parse(await readFile(file,'utf8'));if(data.version!==1)return;ttl=Number.isFinite(data.ttlMs)&&data.ttlMs>=60000&&data.ttlMs<=30*86400000?data.ttlMs:ttl;for(const [k,r]of(data.records||[]).slice(-maxEntries))if(validateFareRecord(r,now()))records.set(k,r);}catch(e){if(e.code!=='ENOENT')warning='票價快取讀取失敗，將重新驗證官方來源。';}}
  const save=()=>{if(!file)return Promise.resolve();queue=queue.catch(()=>{}).then(async()=>{await mkdir(dirname(file),{recursive:true});const tmp=`${file}.tmp`;await writeFile(tmp,JSON.stringify({version:1,ttlMs:ttl,records:[...records]}),'utf8');await rename(tmp,file);}).catch(()=>{warning='票價快取無法保存；本次仍使用已驗證資料。';});return queue;};
  async function get(key,{allowStale=true,referenceDate=now()}={}){await load();const r=records.get(key);if(!r||!validateFareRecord(r,now(),referenceDate))return null;const stale=now()-Date.parse(r.fetchedAt)>ttl;if(stale&&!allowStale)return null;return {...structuredClone(r),stale};}
  async function put(key,record){await load();if(!validateFareRecord(record,now()))throw Error('票價來源未通過格式／日期／金額／起訖驗證');const previous=records.get(key);if(previous){const byId=q=>JSON.stringify([q.passengerType,q.seatClass,q.vehicleType,q.fareType]);for(const q of record.quotes){const old=previous.quotes.find(x=>byId(x)===byId(q));if(old&&Math.abs(q.amount-old.amount)>10&&(old.amount===0||Math.abs(q.amount-old.amount)/old.amount>jumpRatio)){quarantine.set(key,{at:new Date(now()).toISOString(),reason:'需要重新驗證票價來源'});throw Error('票價異常跳動，需要重新驗證票價來源；保留原已驗證票價。');}}}if(records.size>=maxEntries&&!records.has(key))records.delete(records.keys().next().value);records.set(key,structuredClone(record));quarantine.delete(key);await save();return record;}
  async function configure(value){if(!Number.isFinite(value)||value<60000||value>30*86400000)throw Error('票價重新驗證間隔須介於 1 分鐘至 30 天');ttl=value;await save();}
  async function status(){await load();return {ttlMs:ttl,warning,count:records.size,lastUpdated:[...records.values()].map(r=>r.fetchedAt).sort().at(-1)||null,modes:Object.fromEntries(['TRA','HSR','BUS','METRO','LRT','BIKE'].map(mode=>{const rows=[...records.values()].filter(r=>r.quotes.some(q=>q.mode===mode));return [mode,{status:rows.length?'partial':'no-data',records:rows.length,stale:rows.some(r=>now()-Date.parse(r.fetchedAt)>ttl),lastUpdated:rows.map(r=>r.fetchedAt).sort().at(-1)||null}];})),quarantine:[...quarantine.values()]};}
  return {load,get,put,configure,status,entries:async()=>{await load();return [...records].map(([key,r])=>({key,...structuredClone(r)}));},get ttlMs(){return ttl;}};
}
