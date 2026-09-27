
const layers = new Map();
let seq = 0;

export function registerLayer(layer) {
  const id = layer.id || `tw-${++seq}`;
  const item = { ...layer, id };
  layers.set(id, item);
  window.dispatchEvent(new CustomEvent('gev-tw:layers-changed', { detail: listLayers() }));
  return item;
}
export function removeLayer(id) {
  const item = layers.get(id);
  item?.dataSource && item.viewer?.dataSources.remove(item.dataSource, true);
  layers.delete(id);
  window.dispatchEvent(new CustomEvent('gev-tw:layers-changed', { detail: listLayers() }));
}
export function listLayers() { return [...layers.values()]; }
export function getLayer(id) { return layers.get(id); }
