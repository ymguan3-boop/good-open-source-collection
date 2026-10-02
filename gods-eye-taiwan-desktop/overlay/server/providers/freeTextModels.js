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
