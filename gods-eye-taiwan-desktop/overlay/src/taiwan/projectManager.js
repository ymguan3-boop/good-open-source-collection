
import { db } from './db.js';

export async function saveProject({ name='未命名專案', viewer, layers=[] }) {
  const now = new Date().toISOString();
  const camera = viewer ? {
    position: [viewer.camera.positionWC.x, viewer.camera.positionWC.y, viewer.camera.positionWC.z],
    heading: viewer.camera.heading,
    pitch: viewer.camera.pitch,
    roll: viewer.camera.roll,
  } : null;
  return db.projects.put({ name, updatedAt: now, camera, layerCount: layers.length });
}

export async function exportProject({ name='未命名專案', viewer, layers=[], metadata={} }) {
  const manifest = {
    format: 'gev-taiwan-project', version: 1, name, exportedAt: new Date().toISOString(), coordinateSystem:'EPSG:4326',
    camera: viewer ? {
      position: [viewer.camera.positionWC.x, viewer.camera.positionWC.y, viewer.camera.positionWC.z],
      heading: viewer.camera.heading, pitch: viewer.camera.pitch, roll: viewer.camera.roll,
    } : null,
    metadata,
    services:layers.filter(layer=>['3d-tiles','national-wms'].includes(layer.kind)).map(layer=>({kind:layer.kind,name:layer.name,visible:layer.visible,
      ...(layer.kind === '3d-tiles' ? {url:publicNlscUrl(layer.serviceUrl)} : {}),metadata:{...layer.dataMetadata,...(layer.aiReports ? {aiReports:layer.aiReports} : {})}})),
    omittedLayers:layers.filter(layer=>!layer.geojson && !['3d-tiles','national-wms'].includes(layer.kind)).map(layer=>layer.name),
    layers: layers.filter(l => l.geojson).map(l => ({ id:l.id, name:l.name, kind:l.kind, visible:l.visible, builtinId:l.builtinId || null, sourceKey:l.sourceKey || null, source:l.source || null, description:l.description || null, metadata:{...l.dataMetadata,...(l.aiReports ? {aiReports:l.aiReports} : {})}, parentSourceKey:l.parentSourceKey || null, bufferSourceId:l.bufferSourceId || null, bufferDistanceMeters:l.bufferDistanceMeters ?? null, style:l.style || null, geojson:l.geojson }))
  };
  return new Blob([JSON.stringify(manifest, null, 2)], { type:'application/json;charset=utf-8' });
}

export async function importProject(file) {
  if (file.size > 50_000_000) throw new Error('專案 JSON 超過 50 MB 限制');
  const text = await file.text();
  const manifest = JSON.parse(text);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const fingerprint = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2,'0')).join('');
  const geolibre = manifest.version === '0.1.0' && manifest.mapView && Array.isArray(manifest.layers);
  const taiwan = manifest.format === 'gev-taiwan-project' && manifest.version === 1 && Array.isArray(manifest.layers);
  if ((!geolibre && !taiwan) || manifest.layers.length > 100) throw new Error('不是受支援的台灣版或 GeoLibre JSON 專案');
  const services = manifest.services || [];
  if (!Array.isArray(services) || services.length > 20) throw new Error('專案服務紀錄格式不正確或超過 20 項');
  for (const service of services) {
    if (!['3d-tiles','national-wms'].includes(service.kind)) throw new Error('專案包含不支援的服務類型');
    if (service.kind === '3d-tiles') service.url = publicNlscUrl(service.url);
  }
  const layers = manifest.layers.map((item, index) => {
    if (item.geojson?.type !== 'FeatureCollection' || !Array.isArray(item.geojson.features)) throw new Error(`第 ${index+1} 個圖層格式不正確`);
    return { path:safe(item.name || `圖層-${index+1}`), geojson:item.geojson, visible:item.visible !== false,
      parentSourceKey:item.parentSourceKey || null, bufferSourceId:item.bufferSourceId || null, bufferDistanceMeters:item.bufferDistanceMeters ?? null, kind:geolibre ? 'geojson' : item.kind || 'geojson', source:geolibre ? 'GeoLibre 匯入' : item.source || null,
      metadata:item.metadata || {}, description:item.description || null, sourceProject:file.name,
      builtinId:taiwan && /^osm-(roads|rail|waterways|water|coastline)$/.test(item.builtinId || '') ? item.builtinId : undefined,
      sourceKey:taiwan && /^(official-dtm-2025|nlsc-national-rail|file:[0-9a-f]{64}|dtm-file:EPSG:(3825|3826|4326):[0-9a-f]{64})$/.test(item.sourceKey || '') ? item.sourceKey : `project:${fingerprint}:${index}`, sourceLayerId:item.id || String(index),
      style:normaliseStyle(item.style) };
  });
  const ids = new Map(layers.map(layer=>[layer.sourceLayerId,layer]));
  if (ids.size !== layers.length) throw new Error('專案有重複的圖層識別碼');
  for (const layer of layers) {
    const seen = new Set([layer.sourceLayerId]); let parent = layer.bufferSourceId;
    while (parent && ids.has(parent)) { if (seen.has(parent)) throw new Error('分析圖層的來源關係形成循環'); seen.add(parent); parent = ids.get(parent).bufferSourceId; }
  }
  return { manifest, layers, services, geolibre, fingerprint, sourceFile:file.name };
}

function safe(value) { return String(value || 'layer').replace(/[\\/:*?"<>|]+/g, '-'); }

function normaliseStyle(style) {
  if (!style || typeof style !== 'object') return {};
  const color = value => typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? value : undefined;
  const width = Number(style.strokeWidth);
  const alpha = Number(style.alpha ?? style.fillOpacity ?? style.opacity);
  const radius = Number(style.circleRadius);
  return {
    ...(typeof style.clampToGround === 'boolean' ? {clampToGround:style.clampToGround} : {}),
    ...(typeof style.strokeEnabled === 'boolean' ? {strokeEnabled:style.strokeEnabled} : {}),
    ...(typeof style.customized === 'boolean' ? {customized:style.customized} : {}),
    ...(color(style.strokeColor || style.stroke) ? { stroke:color(style.strokeColor || style.stroke) } : {}),
    ...(color(style.fillColor || style.fill) ? { fill:color(style.fillColor || style.fill) } : {}),
    ...(Number.isFinite(width) && width > 0 ? { strokeWidth:Math.min(width, 8) } : {}),
    ...(Number.isFinite(alpha) ? { alpha:Math.max(0, Math.min(1, alpha)) } : {}),
    ...(Number.isFinite(radius) && radius > 0 ? { circleRadius:Math.min(radius, 24) } : {}),
  };
}

function publicNlscUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !/(^|\.)nlsc\.gov\.tw$/.test(url.hostname) || !/\/tileset\.json$/i.test(url.pathname) || url.username || url.password || url.search || url.hash) throw new Error('JSON 只支援不含金鑰的 NLSC 公開 tileset.json 服務網址');
  return url.href;
}
