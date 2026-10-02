import { listLayers, getLayer, setLayerVisible } from './layerRegistry.js';

export const LAYER_VOICE_TOOLS = [
  { name: 'list_available_data_layers', description: '列出工具列可載入的圖資、底圖，以及已匯入圖層的代碼、名稱與顯示狀態；指定圖資操作前先查此清單。', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'control_data_layer', description: '載入、顯示、隱藏、切換或更新工具列的指定圖資。切換底圖使用 show，toggle 是切換目前顯示狀態；只操作清單內來源。', parameters: { type: 'OBJECT', properties: {
    target: { type: 'STRING', description: '圖資清單中的 id 或名稱，例如 admin-counties、縣市界、TomTom 即時交通、飛機即時動態、NLSC 臺灣通用正射影像' },
    operation: { type: 'STRING', enum: ['load', 'show', 'hide', 'toggle', 'update'] },
  }, required: ['target', 'operation'] } },
  { name: 'load_all_data_layers', description: '一鍵載入目前範圍的全部內建向量、官方 DTM、NLSC 建物與參考圖；回報逐項成功或失敗，不自動開啟付費底圖或即時串流。', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'hide_all_data_layers', description: '一鍵隱藏所有圖資及即時資料，保留 Google 擬真 3D 底圖，繼續語音對話。', parameters: { type: 'OBJECT', properties: {} } },
];

const normalize = value => String(value).trim().toLowerCase().replace(/臺/g, '台').replace(/[\s／/・｜|_-]/g, '');

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
    return definitions.map(item => ({ ...item, loaded: item.kind === 'basemap' ? mapStackController.getActiveId() === item.id : item.kind === 'live' ? dataManager.isEnabled(item.id) : !!entryLayer(item.id) || !!getLayer(item.id),
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
  async function control(target, operation, { signal } = {}) {
    signal?.throwIfAborted();
    if (!['load', 'show', 'hide', 'toggle', 'update'].includes(operation)) throw new Error('不支援的圖資操作');
    const item = resolve(target), visible = operation === 'hide' ? false : operation === 'toggle' ? !item.visible : true;
    if (item.kind === 'basemap') await adapters.setBasemap(item.id, visible, { signal });
    else if (item.kind === 'live') await adapters.setLive(item.id, visible, { signal, refresh: operation === 'update' });
    else {
      let layer = entryLayer(item.id) || getLayer(item.id);
      if (!visible) {
        const targets = item.id === 'nlsc-buildings' ? listLayers().filter(candidate => candidate.kind === '3d-tiles') : layer ? [layer] : [];
        for (const targetLayer of targets) setLayerVisible(targetLayer.id, false);
      } else if (item.kind === 'builtin' && (!layer || operation === 'update')) {
        layer = await adapters.loadBuiltin(item.id, { signal, fresh: operation === 'update' });
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
    return { ok: true, partial:!!(entryLayer(item.id) || getLayer(item.id))?.dataMetadata?.partial, message: `已${visible ? operation === 'update' ? '更新' : '顯示' : '隱藏'}「${item.name}」`, data: state, observedAt: new Date().toISOString() };
  }
  async function execute(name, args = {}, context = {}) {
    if (name === 'list_available_data_layers') return { ok: true, layers: catalog(), observedAt: new Date().toISOString() };
    if (name === 'control_data_layer') return control(args.target, args.operation, context);
    if (name === 'hide_all_data_layers') {
      context.signal?.throwIfAborted(); await adapters.hideAll();
      return { ok: true, message: '已隱藏所有圖資，保留 Google 擬真 3D；語音對話繼續。', layers: catalog().filter(item => item.visible) };
    }
    if (name === 'load_all_data_layers') {
      const results = [];
      for (const id of [...builtinCatalog.map(item => item.id), 'official-dtm-2025', 'national-reference', 'nlsc-buildings']) {
        context.signal?.throwIfAborted();
        try { results.push(await control(id, 'load', context)); }
        catch (error) { if (context.signal?.aborted) throw error; results.push({ ok: false, id, error: error.message }); }
      }
      const failed=results.filter(result=>!result.ok),partial=results.filter(result=>result.partial);
      return {ok:failed.length===0,partial:failed.length>0 || partial.length>0,message:`內建圖資已載入 ${results.length-failed.length} 項，其中 ${partial.length} 項為部分資料；失敗 ${failed.length} 項`,results};
    }
    throw new Error('不支援的圖資語音工具');
  }
  return { execute, catalog };
}
