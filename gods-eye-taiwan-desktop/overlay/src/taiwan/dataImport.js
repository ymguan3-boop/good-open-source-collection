import * as Cesium from 'cesium';
import shp from 'shpjs';
import { registerLayer } from './layerRegistry.js';

export async function importFile(file, viewer) {
  const name = file.name || '圖資';
  const lower = name.toLowerCase();
  if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
    const geojson = JSON.parse(await file.text());
    return addGeoJSON(geojson, name, viewer);
  }
  if (lower.endsWith('.zip')) {
    const parsed = await shp(await file.arrayBuffer());
    const geojson = Array.isArray(parsed)
      ? { type:'FeatureCollection', features:parsed.flatMap(x => x.features || []) }
      : parsed;
    return addGeoJSON(geojson, name, viewer);
  }
  if (lower.endsWith('.kml') || lower.endsWith('.kmz')) {
    const url = URL.createObjectURL(file);
    try {
      const ds = await Cesium.KmlDataSource.load(url, {
        camera:viewer.scene.camera,
        canvas:viewer.scene.canvas,
      });
      await viewer.dataSources.add(ds);
      viewer.flyTo(ds);
      return registerLayer({ name, kind:'kml', dataSource:ds, viewer });
    } finally { URL.revokeObjectURL(url); }
  }
  if (lower.endsWith('.czml')) {
    const czml = JSON.parse(await file.text());
    const ds = await Cesium.CzmlDataSource.load(czml);
    await viewer.dataSources.add(ds);
    viewer.flyTo(ds);
    return registerLayer({ name, kind:'czml', dataSource:ds, viewer });
  }
  throw new Error('目前支援 GeoJSON / JSON / Shapefile ZIP / KML / KMZ / CZML');
}

export async function addGeoJSON(geojson, name, viewer, style={}) {
  const ds = await Cesium.GeoJsonDataSource.load(geojson, {
    clampToGround:style.clampToGround ?? false,
    stroke:Cesium.Color.fromCssColorString(style.stroke || '#38bdf8'),
    fill:Cesium.Color.fromCssColorString(style.fill || '#38bdf8').withAlpha(style.alpha ?? 0.18),
    strokeWidth:style.strokeWidth || 1.5,
  });
  await viewer.dataSources.add(ds);
  if (style.flyTo !== false) viewer.flyTo(ds);
  const metadata = style.metadata || {};
  return registerLayer({
    name,
    kind:style.kind || 'geojson',
    geojson,
    dataSource:ds,
    viewer,
    ...metadata,
  });
}
