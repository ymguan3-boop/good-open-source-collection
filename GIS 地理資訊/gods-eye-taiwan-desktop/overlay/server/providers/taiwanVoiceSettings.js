import { mkdir,readFile,writeFile,rename } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
const folder=join(process.env.LOCALAPPDATA || join(homedir(),'.config'),'GodsEyeTaiwan');
const filename=join(folder,'voice-settings.json');
let queue=Promise.resolve();
export async function readVoiceSettings(){
  await queue;
  try{const value=JSON.parse(await readFile(filename,'utf8'));return typeof value.value==='string' && typeof value.updatedAt==='string' ? {value:value.value.slice(0,2000),updatedAt:value.updatedAt} : null;}
  catch(error){if(error.code==='ENOENT')return null;throw new Error('無法讀取本機對話風格設定');}
}
export function writeVoiceSettings(data){
  if(typeof data.value!=='string' || data.value.length>2000 || !Number.isFinite(Date.parse(data.updatedAt)))throw new Error('風格設定格式不正確');
  const job=queue.then(async()=>{
    let existing=null;try{existing=JSON.parse(await readFile(filename,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
    if(Date.parse(existing?.updatedAt)>=Date.parse(data.updatedAt))return {value:existing.value,updatedAt:existing.updatedAt};
    const record={value:data.value,updatedAt:data.updatedAt};await mkdir(folder,{recursive:true});
    const temporary=filename+'.tmp';await writeFile(temporary,JSON.stringify(record),'utf8');await rename(temporary,filename);return record;
  });queue=job.catch(()=>{});return job;
}
