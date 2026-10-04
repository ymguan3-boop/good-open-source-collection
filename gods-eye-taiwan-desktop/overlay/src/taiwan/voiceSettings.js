import { db } from './db.js';
import { browserAi } from './browserAi.js';
import {normalizeGeminiLiveModel} from './geminiLivePolicy.js';
async function storedStyle(data){
  return browserAi('/voice-settings',data===undefined?{signal:AbortSignal.timeout(5000)}:{method:'POST',data,signal:AbortSignal.timeout(5000)});
}
const key='gev.tw.voiceSettings';
let latestTimestamp=0;
async function browserCopy(record){
  try{localStorage.setItem(key,record.value);localStorage.setItem(key+'.updatedAt',record.updatedAt);}catch{}
  try{await db.settings.put({key:'voiceSettings',...record});}catch{}
}
export async function loadStoredVoiceSettings(){
  const records=[];
  try{const value=localStorage.getItem(key);if(value!==null)records.push({value,updatedAt:localStorage.getItem(key+'.updatedAt') || '1970-01-01T00:00:00.000Z'});}catch{}
  try{const saved=await db.settings.get('voiceSettings');if(typeof saved?.value==='string')records.push(saved);}catch{}
  let server=null;
  try{server=(await storedStyle()).setting;if(server)records.push(server);}catch{}
  const latest=records.sort((a,b)=>(Date.parse(b.updatedAt)||0)-(Date.parse(a.updatedAt)||0))[0];
  if(!latest)return '';
  latestTimestamp=Math.max(latestTimestamp,Date.parse(latest.updatedAt)||0);
  const record={value:latest.value.slice(0,2000),updatedAt:latest.updatedAt};
  await browserCopy(record);
  if(!server || (Date.parse(server.updatedAt)||0)<latestTimestamp){
    try{await storedStyle(record);}catch{}
  }
  return record.value;
}
export async function saveStoredVoiceSettings(value){
  await loadStoredVoiceSettings();
  const style=String(value).trim().slice(0,2000);latestTimestamp=Math.max(Date.now(),latestTimestamp+1);
  const record={value:style,updatedAt:new Date(latestTimestamp).toISOString()};
  // A successful Save means the same Windows user's next launch can recover it,
  // even if the launch entry point uses another browser profile/origin.
  const saved=(await storedStyle(record)).setting;
  if(saved?.value!==style)throw new Error('本機風格儲存衝突，請重新載入風格後再儲存');
  await browserCopy(saved);return saved.value;
}

export function normalizeVoiceSettings(value={}){return {style:String(value.style || '').trim().slice(0,1400),model:normalizeGeminiLiveModel(value.model),clearPlaceOnNext:value.clearPlaceOnNext!==false,shareMap:value.shareMap===true};}
export async function loadVoiceSettings(){const raw=await loadStoredVoiceSettings();try{return normalizeVoiceSettings(JSON.parse(raw || '{}'));}catch{return normalizeVoiceSettings();}}
export async function saveVoiceSettings(value){return normalizeVoiceSettings(JSON.parse(await saveStoredVoiceSettings(JSON.stringify(normalizeVoiceSettings(value)))));}
