
import { invoke } from '@tauri-apps/api/core';
import { listLayers } from './layerRegistry.js';

function layerContext() {
  return listLayers().map(l => ({ id:l.id, name:l.name, kind:l.kind, featureCount:l.geojson?.features?.length ?? null }));
}
export async function suggestTopics(model='openai/gpt-5') {
  if (!globalThis.__TAURI_INTERNALS__) throw new Error('桌面版才可使用安全 OpenRouter 代理');
  const system = `你是台灣公共工程與空間審計 GIS 助理。只根據已載入資料提出可執行的分析主題。輸出繁體中文 JSON，不要 Markdown。`;
  const prompt = JSON.stringify({ task:'suggest_topics', layers:layerContext(), output:{ topics:[{title:'',purpose:'',requiredLayerIds:[],readiness:'high|medium|low',limitations:[]}]} });
  return JSON.parse(await invoke('openrouter_json', { model, system, prompt }));
}
export async function planAnalysis(topic, model='openai/gpt-5') {
  const system = `你是 GIS 分析規劃器。只能使用 buffer/intersect/area/length/centroid/statistics 等已存在工具。輸出繁體中文 JSON，不要 Markdown。`;
  const prompt = JSON.stringify({ task:'plan_analysis', topic, layers:layerContext(), output:{ title:'',purpose:'',steps:[{tool:'',layerIds:[],params:{}}],limitations:[],outputs:[]} });
  return JSON.parse(await invoke('openrouter_json', { model, system, prompt }));
}
