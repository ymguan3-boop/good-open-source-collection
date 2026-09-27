
import * as turf from '@turf/turf';
import { addGeoJSON } from './dataImport.js';

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
  const result = bufferFeatureCollection(layer.geojson, distance, 'meters');
  return addGeoJSON(result, `${layer.name}｜${distance}m 影響範圍`, viewer, { stroke:'#a78bfa', fill:'#a78bfa', alpha:0.18 });
}
