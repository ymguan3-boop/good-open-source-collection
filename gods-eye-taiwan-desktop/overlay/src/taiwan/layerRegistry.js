const layers = new Map();
let seq = 0;

export function registerLayer(layer) {
  for (const existing of [...layers.values()]) {
    if ((layer.sourceKey && existing.sourceKey === layer.sourceKey) ||
        (layer.serviceUrl && existing.kind === layer.kind && existing.serviceUrl === layer.serviceUrl)) removeLayer(existing.id);
  }
  const id = layer.id || `tw-${++seq}`;
  const item = { visible:true, ...layer, id };
  layers.set(id, item);
  emit();
  return item;
}

export function removeLayer(id) {
  const item = layers.get(id);
  if (!item) return;
  for (const child of [...layers.values()].filter(layer => layer.bufferSourceId === id)) removeLayer(child.id);
  item?.dataSource && item.viewer?.dataSources.remove(item.dataSource, true);
  item?.tileset && item.viewer?.scene.primitives.remove(item.tileset);
  item?.imageryLayer && item.viewer?.imageryLayers.remove(item.imageryLayer, true);
  item?.dispose?.();
  layers.delete(id);
  emit();
}

export function setLayerVisible(id, visible) {
  const item = layers.get(id);
  if (!item) return false;
  item.visible = !!visible;
  if (item.dataSource) item.dataSource.show = item.visible;
  if (item.tileset) item.tileset.show = item.visible;
  if (item.imageryLayer) item.imageryLayer.show = item.visible;
  item.setVisibility?.(item.visible);
  for(const child of [...layers.values()].filter(layer=>layer.bufferSourceId === id))setLayerVisible(child.id,item.visible);
  emit();
  return true;
}

export function listLayers() { return [...layers.values()]; }
export function getLayer(id) { return layers.get(id); }
export function moveLayer(id,direction) {
  const items=[...layers.values()];const index=items.findIndex(layer=>layer.id === id);if(index<0)return;
  const selected=items[index];const siblings=items.filter(layer=>selected.bufferSourceId ? layer.bufferSourceId === selected.bufferSourceId : !layer.bufferSourceId && (selected.kind !== 'annotation' || layer.kind === 'annotation'));
  const siblingIndex=siblings.indexOf(selected)+(direction === 'up' ? -1 : 1);if(siblingIndex<0 || siblingIndex>=siblings.length)return;
  const next=items.indexOf(siblings[siblingIndex]);[items[index],items[next]]=[items[next],items[index]];
  layers.clear();for(const item of items)layers.set(item.id,item);
  for(const item of items){if(item.dataSource && item.viewer?.dataSources.contains(item.dataSource))item.viewer.dataSources.raiseToTop(item.dataSource);if(item.imageryLayer && item.viewer?.imageryLayers.contains(item.imageryLayer))item.viewer.imageryLayers.raiseToTop(item.imageryLayer);}
  emit();
}

function emit() {
  window.dispatchEvent(new CustomEvent('gev-tw:layers-changed', { detail:listLayers() }));
}
