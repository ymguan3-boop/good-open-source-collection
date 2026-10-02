import { db } from './db.js';
const key='gev.tw.responseStyle';
let latestTimestamp=0;
export async function loadResponseStyle(){
  let localValue=null,localTime='';try{localValue=localStorage.getItem(key);localTime=localStorage.getItem(key+'.updatedAt') || '';}catch{}
  latestTimestamp=Math.max(latestTimestamp,Date.parse(localTime)||0);
  try{const saved=await db.settings.get('responseStyle');latestTimestamp=Math.max(latestTimestamp,Date.parse(saved?.updatedAt)||0);return localValue!==null && localTime>(saved?.updatedAt || '') ? localValue : saved?.value ?? localValue ?? '';}catch{return localValue ?? '';}
}
export async function saveResponseStyle(value){
  await loadResponseStyle();
  const style=String(value).trim().slice(0,2000);let persisted=false;latestTimestamp=Math.max(Date.now(),latestTimestamp+1);const updatedAt=new Date(latestTimestamp).toISOString();
  try{localStorage.setItem(key,style);localStorage.setItem(key+'.updatedAt',updatedAt);persisted=localStorage.getItem(key)===style;}catch{}
  try{await db.settings.put({key:'responseStyle',value:style,updatedAt});persisted=(await db.settings.get('responseStyle'))?.value===style || persisted;}catch{}
  if(!persisted)throw new Error('自訂風格未能儲存，請確認未禁止網站儲存或使用無痕視窗');
  return style;
}
