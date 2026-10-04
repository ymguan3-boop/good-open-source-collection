let cached=null,expires=0;
export async function planningModels(){
  if(cached&&Date.now()<expires)return cached;
  const response=await fetch('https://openrouter.ai/api/v1/models',{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`OpenRouter 模型目錄 HTTP ${response.status}`);
  const value=await response.json();
  cached=(value.data||[]).filter(m=>m.architecture?.output_modalities?.includes('text')||!m.architecture?.output_modalities).map(m=>({id:m.id,name:m.name,free:Number(m.pricing?.prompt)===0&&Number(m.pricing?.completion)===0,priceLabel:[m.pricing?.prompt,m.pricing?.completion].every(v=>v!==undefined&&v!==null&&Number.isFinite(Number(v))&&Number(v)>=0)?`輸入 ${Number((Number(m.pricing.prompt)*1e6).toFixed(6))}／輸出 ${Number((Number(m.pricing.completion)*1e6).toFixed(6))} 美元／百萬 token`:'價格依實際路由／供應商，可能產生費用'}));
  expires=Date.now()+300000;return cached;
}
export async function selectPlanningModel(data){
  if(data.model==='openrouter/free'||data.model==='auto-free')return {...data,model:'openrouter/free',allowPaid:false};
  const selected=(await planningModels()).find(m=>m.id===data.model);
  if(!selected)throw new Error('指定規劃模型不在目前 OpenRouter 目錄中');
  return {...data,allowPaid:!selected.free};
}
