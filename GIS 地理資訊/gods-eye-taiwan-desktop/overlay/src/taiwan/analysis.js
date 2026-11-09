
import * as turf from '@turf/turf';
import { addGeoJSON } from './dataImport.js';
import { listLayers, removeLayer } from './layerRegistry.js';

export function bufferFeatureCollection(fc, distance, units='meters') {
  return turf.buffer(fc, distance, { units });
}
export function intersectFeatures(a, b) {
  const features = turf.featureCollection([a, b]);
  return turf.intersect(features);
}
export function summarize(fc) {
  const features = fc?.features || [];
  let area = 0, length = 0;
  for (const f of features) {
    const t = f?.geometry?.type || '';
    if (t.includes('Polygon')) area += turf.area(f);
    if (t.includes('LineString')) length += turf.length(f, { units:'kilometers' });
  }
  return { count: features.length, areaM2: area, lengthKm: length };
}
export function centroid(fc) { return turf.centroid(fc); }

export async function runBuffer(layer, viewer, distance=500) {
  if (!layer?.geojson) throw new Error('此圖層沒有可分析的 GeoJSON');
  if (isBufferLayer(layer)) throw new Error('請選擇原始圖層，避免重複對影響範圍計算');
  const meters = Number(distance);
  if (!Number.isFinite(meters) || meters <= 0 || meters > 100000) throw new Error('影響範圍請輸入 0 至 100,000 公尺之間的數字');
  const result = bufferFeatureCollection(layer.geojson, distance, 'meters');
  const created = await addGeoJSON(result, `${layer.name}｜${meters}m 影響範圍`, viewer, {
    stroke:'#a78bfa', fill:'#a78bfa', alpha:0.18, flyTo:false,
    metadata:{ bufferSourceId:layer.id, bufferDistanceMeters:meters },
  });
  for (const old of listLayers()) {
    if (old.id !== created.id && isBufferLayer(old) && (old.bufferSourceId === layer.id || (!old.bufferSourceId && bufferBase(old.name) === layer.name)) && bufferMeters(old) === meters) removeLayer(old.id);
  }
  return created;
}

export function bufferBase(name) {
  return String(name || '').replace(/(?:\s*[｜|]\s*\d+(?:\.\d+)?m\s*影響範圍)+$/g, '').trim();
}

export function isBufferLayer(layer) {
  return Number.isFinite(Number(layer?.bufferDistanceMeters)) && layer?.bufferDistanceMeters != null || bufferBase(layer?.name) !== String(layer?.name || '').trim();
}

function bufferMeters(layer) {
  if (layer.bufferDistanceMeters != null) return Number(layer.bufferDistanceMeters);
  return Number([...String(layer.name).matchAll(/[｜|]\s*(\d+(?:\.\d+)?)m\s*影響範圍/g)].at(-1)?.[1]);
}

export function removeDuplicateBuffers() {
  const seen = new Set();
  for (const layer of [...listLayers()].reverse()) {
    if (!isBufferLayer(layer)) continue;
    const key = `${layer.bufferSourceId || bufferBase(layer.name)}|${bufferMeters(layer)}`;
    if (seen.has(key)) removeLayer(layer.id);
    else seen.add(key);
  }
}
