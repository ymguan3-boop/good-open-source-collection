const zero=value=>(typeof value==='number' || typeof value==='string' && value.trim()!=='') && Number(value)===0;
export const isFreeTextModel=model=>model?.architecture?.output_modalities?.includes('text') && ['prompt','completion'].every(field=>zero(model.pricing?.[field])) && ['request','image','internal_reasoning'].every(field=>Number(model.pricing?.[field]||0)===0) && !/safety|guard|moderation|embedding|lyria/i.test(`${model.id} ${model.name}`);
let cache=null;
export async function freeTextModels(signal){
  if(cache && Date.now()-cache.at<60000)return cache.models;
  const response=await fetch('https://openrouter.ai/api/v1/models',{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)].filter(Boolean))});
  if(!response.ok)throw new Error('免費模型清單暫時無法取得');
  const value=await response.json(),models=(value.data || []).filter(isFreeTextModel);
  cache={at:Date.now(),models};return models;
}

/** Classifier verdicts are not assistant answers, regardless of the router ID. */
export const isClassificationOnly = text => /^(?:user\s+safety|(?:user\s+)?(?:safety|moderation|classification)(?:\s+verdict)?|safe|unsafe)(?:\s*[:：]|\s*$)/i.test(String(text||'').trim()) || /^(?:safe|unsafe)\s*(?:[.,]|$)/i.test(String(text||'').trim());
export const isClassifierModel = id => /safety|guard|moderation|embedding|lyria/i.test(String(id||''));

/** Hidden reasoning consumes the same completion budget; prefer final answers. */
export function finalTextOptions(model){
 const r=model?.reasoning,params=model?.supported_parameters||[];let reasoning;
 if(params.includes('reasoning')){
  if(!r?.mandatory)reasoning={enabled:false,exclude:true};
  else if(r.supports_max_tokens)reasoning={max_tokens:512,exclude:true};
  else {const efforts=r.supported_efforts,effort=['minimal','low','medium','high','xhigh','max'].find(v=>!Array.isArray(efforts)||efforts.includes(v));reasoning=effort?{effort,exclude:true}:{exclude:true};}
 }
 return {max_tokens:4096,...(reasoning?{reasoning}:{})};
}
