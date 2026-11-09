import {DEFAULT_GEMINI_LIVE_MODEL,GEMINI_LIVE_MODELS,GEMINI_QUOTA_URL,requireGeminiLiveModel,geminiLiveFailure} from '../../src/taiwan/geminiLivePolicy.js';
let lastAttempt=null,lastFailure=null;
export function geminiLiveStatus(configured){
  return {configured:!!configured,models:GEMINI_LIVE_MODELS,defaultModel:DEFAULT_GEMINI_LIVE_MODEL,
    quota:{remaining:null,limit:null,status:'unknown',consoleUrl:GEMINI_QUOTA_URL,explanation:'Gemini API Key 無法查詢精確剩餘額度；請在 Google AI Studio 查看專案用量與限制。'},
    lastAttempt,lastFailure};
}
export async function issueGeminiLiveToken({key,model=DEFAULT_GEMINI_LIVE_MODEL,fetchImpl=fetch,now=Date.now()}={}){
  model=requireGeminiLiveModel(model);
  if(!key)throw new Error('請先輸入 Gemini Live 金鑰');
  lastAttempt={model,at:new Date(now).toISOString(),phase:'token'};
  try{
    const response=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/auth_tokens',{
      method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),
      body:JSON.stringify({uses:1,expireTime:new Date(now+30*60*1000).toISOString(),newSessionExpireTime:new Date(now+60*1000).toISOString()})
    });
    const value=await response.json();
    if(!response.ok)throw geminiLiveFailure({code:response.status,reason:value?.error?.message || response.statusText,model,phase:'token'});
    if(typeof value.name!=='string' || !value.name)throw new Error('Gemini 未回傳短效權杖');
    lastAttempt={...lastAttempt,phase:'token-issued'};lastFailure=null;
    return {token:value.name,model,expireTime:value.expireTime || null};
  }catch(cause){
    const error=cause.diagnostic?cause:geminiLiveFailure({reason:cause,model,phase:'token'});
    lastFailure=error.diagnostic;lastAttempt={...lastAttempt,phase:'failed'};throw error;
  }
}
