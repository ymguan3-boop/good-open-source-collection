const layers = new Map();
let seq = 0;

export function registerLayer(layer) {
  const id = layer.id || `tw-${++seq}`;
  const item = { visible:true, ...layer, id };
  layers.set(id, item);
  emit();
  return item;
}

export function removeLayer(id) {
  const item = layers.get(id);
  item?.dataSource && item.viewer?.dataSources.remove(item.dataSource, true);
  layers.delete(id);
  emit();
}

export function setLayerVisible(id, visible) {
  const item = layers.get(id);
  if (!item) return false;
  item.visible = !!visible;
  if (item.dataSource) item.dataSource.show = item.visible;
  emit();
  return true;
}

export function listLayers() { return [...layers.values()]; }
export function getLayer(id) { return layers.get(id); }

function emit() {
  window.dispatchEvent(new CustomEvent('gev-tw:layers-changed', { detail:listLayers() }));
}
