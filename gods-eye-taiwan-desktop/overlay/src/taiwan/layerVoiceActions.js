import { parseVoiceScope, normalizeVoiceText, extractVoiceScope, scopeInUtterance, scopeCapabilities, scopeQuestion } from './voiceScope.js';
import { listLayers, getLayer, setLayerVisible } from './layerRegistry.js';

export const LAYER_VOICE_TOOLS = [
  { name: 'list_available_data_layers', description: '列出工具列可載入的圖資、底圖，以及已匯入圖層的代碼、名稱與顯示狀態；指定圖資操作前先查此清單。', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'control_data_layer', description: '載入、顯示、隱藏、切換或更新工具列的指定圖資。切換底圖使用 show，toggle 是切換目前顯示狀態；只操作清單內來源。', parameters: { type: 'OBJECT', properties: {
    target: { type: 'STRING', description: '圖資清單中的 id 或名稱，例如 admin-counties、縣市界、TomTom 即時交通、飛機即時動態、NLSC 臺灣通用正射影像' },
    operation: { type: 'STRING', enum: ['load', 'show', 'hide', 'toggle', 'update'] },
    scope: {type:'STRING',description:'使用者已指定或確認的範圍：正式縣市名稱、全台灣、全球、目前範圍、原始資料範圍。未確認就不要猜，先詢問；不支援範圍先解釋來源並給建議。'},
  }, required: ['target', 'operation'] } },
  { name: 'load_all_data_layers', description: '使用者已指定縣市或全台灣範圍時直接執行，未指定才詢問，再一鍵載入全部內建向量、官方 DTM、NLSC 建物與參考圖；回報逐項成功或失敗，不自動開啟付費底圖或即時串流。', parameters: { type: 'OBJECT', properties: {scope:{type:'STRING',description:'使用者指定的正式縣市名稱、全台灣或目前範圍'}} } },
  { name: 'hide_all_data_layers', description: '一鍵隱藏所有圖資及即時資料，保留 Google 擬真 3D 底圖，繼續語音對話。', parameters: { type: 'OBJECT', properties: {} } },
];

const normalize = value => normalizeVoiceText(value).trim().toLowerCase().replace(/[\s／/・｜|_-]/g, '');

export function createLayerVoiceActions({ builtinCatalog, dataManager, mapStackController, viewer, adapters }) {
  const services = [
    { id: 'world-terrain', name: '全球地形', aliases: ['地形'] },
    { id: 'taiwan-relief', name: '台灣 3D 地形地貌', aliases: ['台灣地形', '3D示意地形圖'] },
    { id: 'official-dtm-2025', name: '全臺 20 公尺 DTM', aliases: ['DTM', '官方DTM'] },
    { id: 'nlsc-buildings', name: 'NLSC 3D 建物', aliases: ['3D建物', 'NLSC建物'] },
    { id: 'national-reference', name: 'NLSC 道路、水系與鐵路參考圖', aliases: ['全台參考圖'] },
    { id: 'tomtom-flow-image', name: 'TomTom 即時交通', aliases: ['TomTom', '車流', '即時交通'] },
  ];
  const live = [
    { id: 'flights', name: '飛機即時動態', aliases: ['飛機', '航機', '飛機動態'] },
    { id: 'ais-live-vessels', name: '船舶 AIS 動態', aliases: ['AIS', '船舶'] },
    { id: 'local-firms', name: 'NASA FIRMS 熱點', aliases: ['FIRMS', '熱點'] },
    { id: 'earthquakes', name: 'USGS 地震事件', aliases: ['地震'] },
  ];
  let pendingScope=null,pendingRequest=null;
  const completedRequests=new Map();
  const turnKey=context=>context.turnId ?? context.utterance;
  function entryLayer(id) {
    return listLayers().find(layer => layer.builtinId === id || layer.sourceKey === id ||
      (id === 'national-reference' && layer.kind === 'national-wms') ||
      (id === 'nlsc-buildings' && layer.kind === '3d-tiles'));
  }
  function catalog() {
    const definitions = [
      ...builtinCatalog.map(item => ({ id: item.id, name: item.name, kind: 'builtin', aliases: item.id === 'osm-waterways' ? ['水系', '河川', '河川水系中心線'] : item.id === 'osm-roads' ? ['道路', '道路中心線'] : [] })),
      ...services.map(item => ({ ...item, kind: 'service' })),
      ...live.filter(item => dataManager?.layers.has(item.id)).map(item => ({ ...item, kind: 'live' })),
      ...(mapStackController?.getStacks() || []).map(map => ({ id: map.id, name: ({ photoreal: 'Google 擬真 3D', 'bing-aerial': 'Bing 影像', 'bing-labels': 'Bing 影像與標籤', 'esri-imagery': 'Esri 衛星影像', osm: 'OpenStreetMap 底圖' })[map.id] || map.label, aliases: map.id === 'photoreal' ? ['Google 3D', 'Google擬真底圖'] : [], kind: 'basemap' })),
    ];
    for (const layer of listLayers()) if (!definitions.some(item => entryLayer(item.id)?.id === layer.id)) definitions.push({ id: layer.id, name: layer.name, kind: 'loaded', aliases: [] });
    const reliefVisible=listLayers().some(layer=>layer.kind==='taiwan-relief' && layer.visible);
    return definitions.map(item => ({ ...item, ...scopeCapabilities(item),currentScope:adapters.getScope(), loaded: item.kind === 'basemap' ? mapStackController.getActiveId() === item.id : item.kind === 'live' ? dataManager.isEnabled(item.id) : !!entryLayer(item.id) || !!getLayer(item.id),
      visible: item.kind === 'basemap' ? !reliefVisible && mapStackController.getActiveId() === item.id && !!(item.id==='photoreal' ? mapStackController.getImageryHostTileset()?.show : viewer.scene.globe.show) : item.kind === 'live' ? dataManager.isEnabled(item.id) : item.id==='nlsc-buildings' ? listLayers().some(layer=>layer.kind==='3d-tiles' && layer.visible) : (entryLayer(item.id) || getLayer(item.id))?.visible === true }));
  }
  function resolve(target) {
    if (typeof target !== 'string' || !target.trim() || target.length > 200) throw new Error('請指定有效的圖資名稱');
    const items = catalog(), exact = items.find(item => item.id === target);
    if (exact) return exact;
    const text = normalize(target), matches = items.filter(item => [item.name, item.id, ...item.aliases].some(value => normalize(value) === text));
    if (matches.length !== 1) throw new Error(matches.length ? `名稱不明確，請指定：${matches.map(item => item.name).join('、')}` : '找不到指定圖資，請先查詢圖資清單');
    return matches[0];
  }
  async function confirmScope(item,args,context){
    const current=adapters.getScope(),capability=scopeCapabilities(item);
    const requested=parseVoiceScope(args.scope,current);
    let scope=scopeInUtterance(requested,context.utterance,current) ? requested : extractVoiceScope(context.utterance,current),focus=null;
    if(pendingScope && Date.now()-pendingScope.at>120000)pendingScope=null;
    const trusted=scopeInUtterance(scope,context.utterance,current);
    const accepts=/^(?:好|好的|可以|同意|照建議|依建議|就用建議)(?:[。，！!?？]|$)/.test(normalizeVoiceText(context.utterance).trim());
    if(!trusted && accepts && pendingScope?.id===item.id && pendingScope.turn!==turnKey(context) && pendingScope.recommendation){scope=pendingScope.recommendation;focus=pendingScope.focus;}
    else if(!trusted){const explicit=typeof args.scope==='string' && context.utterance?.includes(args.scope) ? {label:args.scope} : null;const result=scopeQuestion(item,capability,explicit);pendingScope={id:item.id,at:Date.now(),turn:turnKey(context)};return result;}
    if(!scope || !capability.modes.includes(scope.mode)){
      const result=scopeQuestion(item,capability,scope || {label:String(args.scope || '指定範圍')});
      // Suggest one definite coverage. Acceptance on the next user turn only.
      const mode=capability.modes.length===1?capability.modes[0]:null;
      pendingScope={id:item.id,at:Date.now(),turn:turnKey(context),focus:scope && ['county','taiwan'].includes(scope.mode)?scope:null,recommendation:mode ? {mode,label:mode==='global'?'全球':mode==='taiwan'?'全台灣':'原始資料範圍'} : null};return result;
    }
    if(item.id==='nlsc-buildings' && scope.mode==='county'){
      const supported=await adapters.supportsBuildingCounty(scope.county,{signal:context.signal});
      if(!supported){pendingScope={id:item.id,at:Date.now(),turn:turnKey(context)};return {ok:false,needsScope:true,question:`官方清單沒有 ${scope.county} 建物服務。建議使用其他已提供的縣市，或選擇全台灣模式查看有服務的地區；仍不代表全臺完整建物。`,availableScopes:['其他有服務的縣市','全台灣']};}
    }
    if(trusted && pendingScope?.id===item.id && pendingScope.recommendation?.mode===scope.mode)focus=pendingScope.focus;
    pendingScope=null;
    if(focus)await adapters.focusScope(focus,{signal:context.signal});
    const changed=scope.mode==='county' || scope.mode==='taiwan' ? current.mode!==scope.mode || scope.mode==='county' && current.county!==scope.county : false;
    if(changed)await adapters.setScope(scope,{signal:context.signal});
    return {ok:true,scope,changed};
  }
  async function control(target, operation, context = {}, args={}) {
    const {signal}=context;
    signal?.throwIfAborted();
    if (!['load', 'show', 'hide', 'toggle', 'update'].includes(operation)) throw new Error('不支援的圖資操作');
    const explicitlyUpdating=operation==='update';
    const item = resolve(target), visible = operation === 'hide' ? false : operation === 'toggle' ? !item.visible : true;
    let selection;
    if(visible && (operation==='load' || operation==='update' || !item.loaded)){
      selection=await confirmScope(item,args,context);if(!selection.ok)return selection;
      if((selection.changed || context.forceReload) && item.loaded && item.kind!=='basemap')operation='update';
    }
    if (item.kind === 'basemap') await adapters.setBasemap(item.id, visible, { signal });
    else if (item.kind === 'live') await adapters.setLive(item.id, visible, { signal, refresh: explicitlyUpdating });
    else {
      let layer = entryLayer(item.id) || getLayer(item.id);
      if (!visible) {
        const targets = item.id === 'nlsc-buildings' ? listLayers().filter(candidate => candidate.kind === '3d-tiles') : layer ? [layer] : [];
        for (const targetLayer of targets) setLayerVisible(targetLayer.id, false);
      } else if (item.kind === 'builtin' && (!layer || operation === 'update')) {
        layer = await adapters.loadBuiltin(item.id, { signal, fresh: explicitlyUpdating });
      } else if (item.kind === 'service' && (!layer || operation === 'update')) await adapters.loadService(item.id, { signal });
      else if (layer){
        if(operation==='update')throw new Error('此匯入圖層不支援線上更新，請重新匯入原始資料');
        const targets=item.id==='nlsc-buildings' ? listLayers().filter(candidate=>candidate.kind==='3d-tiles') : [layer];
        for(const targetLayer of targets){signal?.throwIfAborted();if(targetLayer.pendingService)await adapters.connectCustom(targetLayer,{signal});else setLayerVisible(targetLayer.id,true);}
      }
      else throw new Error('此匯入圖層已移除，請重新匯入 JSON');
    }
    signal?.throwIfAborted();
    adapters.refresh();
    const state = catalog().find(candidate => candidate.id === item.id);
    if (state?.visible !== visible) throw new Error(`「${item.name}」未完成${visible ? '載入／顯示' : '隱藏'}`);
    return { ok: true, scope:selection?.scope || null, partial:!!(entryLayer(item.id) || getLayer(item.id))?.dataMetadata?.partial, message: `已${visible ? operation === 'update' ? '更新' : '顯示' : '隱藏'}「${item.name}」`, data: state, observedAt: new Date().toISOString() };
  }
  async function dispatch(name, args = {}, context = {}) {
    if (name === 'list_available_data_layers') return { ok: true, layers: catalog(), pendingRequest: getPendingRequest(), observedAt: new Date().toISOString() };
    if (name === 'control_data_layer') return control(args.target, args.operation, context,args);
    if (name === 'hide_all_data_layers') {
      clearPending();context.signal?.throwIfAborted(); await adapters.hideAll();
      return { ok: true, message: '已隱藏所有圖資，保留 Google 擬真 3D；語音對話繼續。', layers: catalog().filter(item => item.visible) };
    }
    if (name === 'load_all_data_layers') {
      const scope=await confirmScope({id:'all-builtin',name:'全部內建圖資',kind:'builtin'},args,context);if(!scope.ok)return scope;
      const results = [];
      for (const id of [...builtinCatalog.map(item => item.id), 'official-dtm-2025', 'national-reference', 'nlsc-buildings']) {
        context.signal?.throwIfAborted();
        try { results.push(await control(id, 'load', {...context,forceReload:scope.changed,utterance:scope.scope.label},{scope:scope.scope.label})); }
        catch (error) { if (context.signal?.aborted) throw error; results.push({ ok: false, id, error: error.message }); }
      }
      const failed=results.filter(result=>!result.ok),partial=results.filter(result=>result.partial);
      return {ok:failed.length===0,partial:failed.length>0 || partial.length>0,message:`內建圖資已載入 ${results.length-failed.length} 項，其中 ${partial.length} 項為部分資料；失敗 ${failed.length} 項`,results};
    }
    throw new Error('不支援的圖資語音工具');
  }
  function clearPending(){pendingScope=null;pendingRequest=null;completedRequests.clear();}
  function getPendingRequest(){
    if(pendingRequest && Date.now()-pendingRequest.at>120000){pendingRequest=null;pendingScope=null;}
    return pendingRequest ? {name:pendingRequest.name,args:{...pendingRequest.args},question:pendingRequest.question} : null;
  }
  function commandInUtterance(utterance){
    const text=normalize(utterance).replace(/(?:載入|再入|在入)/g,'載入');
    if(/不要|不用|別|取消|不想|不需要|如何|怎麼|教我|範例|例如|說明|為什麼|有沒有|能不能|是否/.test(text))return null;
    if(/(?:一鍵|全部|所有).*(?:載入)|載入.*(?:全部|所有)/.test(text))return {name:'load_all_data_layers',args:{}};
    const operation=/更新/.test(text)?'update':/隱藏/.test(text)?'hide':/切換/.test(text)?'toggle':/載入|顯示|開啟/.test(text)?'load':null;
    if(!operation)return null;
    const found=catalog().map(item=>({item,length:Math.max(0,...[item.name,item.id,...item.aliases].filter(value=>text.includes(normalize(value))).map(value=>normalize(value).length))})).filter(match=>match.length>0).sort((a,b)=>b.length-a.length);
    if(!found.length || found[1]?.length===found[0].length)return null;
    return {name:'control_data_layer',args:{target:found[0].item.id,operation}};
  }
  function requestKey(name,args,context){
    const scope=extractVoiceScope(context.utterance,adapters.getScope()) || parseVoiceScope(args.scope,adapters.getScope());
    return JSON.stringify([turnKey(context),name,name==='control_data_layer'?resolve(args.target).id:'all-builtin',args.operation || 'load',scope?.label || '']);
  }
  async function execute(name,args={},context={}){
    const changing=['control_data_layer','load_all_data_layers'].includes(name);
    const key=changing ? requestKey(name,args,context) : null;
    if(key && completedRequests.has(key))return completedRequests.get(key);
    const result=await dispatch(name,args,context);
    if(changing && result.needsScope){
      pendingRequest={name,args:{...args},question:result.question,at:Date.now(),turn:turnKey(context),utterance:context.utterance};
      result.pendingRequest=getPendingRequest();
    }else if(changing){
      pendingRequest=null;
      if(key){completedRequests.set(key,result);if(result.scope)completedRequests.set(requestKey(name,{...args,scope:result.scope.label},context),result);if(completedRequests.size>16)completedRequests.delete(completedRequests.keys().next().value);}
    }
    return result;
  }
  async function resumeFromUtterance(utterance,context={}){
    const text=String(utterance || '').trim(),plain=normalizeVoiceText(text);if(!text)return null;
    const waiting=getPendingRequest();
    if(waiting && pendingRequest.turn===turnKey(context) && normalizeVoiceText(pendingRequest.utterance)===normalizeVoiceText(text))return null;
    if(/^(?:請)?(?:取消|不用了|不要載入|停止載入|別載入)/.test(plain)){if(!waiting)return null;clearPending();return {ok:true,message:'已取消待載入的圖資請求'};}
    const command=commandInUtterance(text);
    const scope=extractVoiceScope(text,adapters.getScope());
    const accepts=/^(?:好|好的|可以|同意|照建議|依建議|就用建議)(?:[。，！!?？]|$)/.test(plain);
    let request=command;
    if(!request && waiting && pendingRequest.turn!==turnKey(context) && !/飛到|帶我|看看|規劃|導航|分析|查詢|介紹|天氣|如何|怎麼|為什麼|是否/.test(plain) && (scope || accepts))request=waiting;
    if(!request)return null;
    const args={...request.args};if(scope)args.scope=scope.label;
    const callContext={...context,utterance:text};
    if(completedRequests.has(requestKey(request.name,args,callContext)))return null;
    return execute(request.name,args,callContext);
  }
  return { execute, catalog, resumeFromUtterance, getPendingRequest, clearPending };
}
