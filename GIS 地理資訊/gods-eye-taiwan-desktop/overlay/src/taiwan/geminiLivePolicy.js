// Shared, DOM-free policy for the browser and local Gemini token provider.
export const DEFAULT_GEMINI_LIVE_MODEL = 'gemini-3.8-live';
export const GEMINI_LIVE_MODELS = Object.freeze([
  Object.freeze({id:DEFAULT_GEMINI_LIVE_MODEL,name:'Gemini 3.8 Live'}),
  Object.freeze({id:'gemini-3.1-flash-live-preview',name:'Gemini 3.1 Flash Live Preview'}),
]);
export const GEMINI_QUOTA_URL = 'https://aistudio.google.com/usage';
export function normalizeGeminiLiveModel(model){
  return GEMINI_LIVE_MODELS.some(item=>item.id===model)?model:DEFAULT_GEMINI_LIVE_MODEL;
}
export function requireGeminiLiveModel(model=DEFAULT_GEMINI_LIVE_MODEL){
  if(!GEMINI_LIVE_MODELS.some(item=>item.id===model))throw new Error('不支援的 Gemini Live 模型，請選擇清單中的模型');
  return model;
}
export function sanitizeGeminiReason(value){
  return String(value?.message || value || '')
    .replace(/AIza[\w-]+/g,'[金鑰已隱藏]')
    .replace(/auth_tokens\/[^\s"'<>]+/g,'[短效權杖已隱藏]')
    .replace(/([?&](?:key|access_token|api_key)=)[^&\s"']+/gi,'$1[已隱藏]')
    .replace(/((?:authorization|x-goog-api-key)\s*[:=]\s*)(?:Bearer\s+|Token\s+)?[^\s,;"']+/gi,'$1[已隱藏]')
    .slice(0,900);
}
export function geminiLiveFailure({code=null,reason='',model=DEFAULT_GEMINI_LIVE_MODEL,phase='connect'}={}){
  const detail=sanitizeGeminiReason(reason), text=`${code || ''} ${detail}`;
  const kind=/quota|exceed|resource[_ -]exhausted|429|rate.limit/i.test(text)?'quota'
    :/401|403|unauthenticated|permission.denied|api.key.not.valid|invalid.api.key/i.test(text)?'authentication'
    :/404|model.{0,40}(?:not.found|not.supported)/i.test(text)?'model'
    :/400|1008|invalid.argument|invalid.json|unknown.name|unsupported|not.supported/i.test(text)?'configuration'
    :/timeout|逾時/i.test(text)?'timeout':'connection';
  const label={quota:'額度或速率限制',authentication:'金鑰或權限不足',model:'模型不可用',configuration:'連線設定不相容',timeout:'連線逾時',connection:'連線中斷'}[kind];
  const diagnostic={phase:'failed',at:new Date().toISOString(),model:normalizeGeminiLiveModel(model),kind,code,detail,operation:phase,quotaBlocked:kind==='quota',message:detail.startsWith('Gemini Live ')?detail:`Gemini Live ${label}（${model}）${detail?'：'+detail:''}`};
  const error=new Error(diagnostic.message);error.diagnostic=diagnostic;return error;
}
// A close/error before setupComplete must reject immediately rather than wait
// for the SDK's connection promise, which can remain pending after a WS close.
export function createGeminiConnectionGate(){
  let reject,closed=false;
  const failure=new Promise((_,fail)=>{reject=fail;});failure.catch(()=>{});
  return {failure,fail(error){if(!closed){closed=true;reject(error);}},get failed(){return closed;}};
}
