import * as Cesium from 'cesium';
import shp from 'shpjs';
import { registerLayer,removeLayer } from './layerRegistry.js';
import { attachViewportLines } from './viewportLines.js';

export async function importFile(file, viewer, { signal } = {}) {
  signal?.throwIfAborted();
  const name = file.name || '圖資';
  const lower = name.toLowerCase();
  const digest = await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  const metadata = {sourceFile:name,sourceKey:`file:${[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('')}`};
  signal?.throwIfAborted();
  if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
    const geojson = JSON.parse(await file.text());
    signal?.throwIfAborted();
    return addGeoJSON(geojson, name, viewer,{metadata});
  }
  if (lower.endsWith('.zip')) {
    const parsed = await shp(await file.arrayBuffer());
    signal?.throwIfAborted();
    const geojson = Array.isArray(parsed)
      ? { type:'FeatureCollection', features:parsed.flatMap(x => x.features || []) }
      : parsed;
    return addGeoJSON(geojson, name, viewer,{metadata});
  }
  if (lower.endsWith('.kml') || lower.endsWith('.kmz')) {
    const url = URL.createObjectURL(file);
    try {
      const ds = await Cesium.KmlDataSource.load(url, {
        camera:viewer.scene.camera,
        canvas:viewer.scene.canvas,
      });
      signal?.throwIfAborted();
      await viewer.dataSources.add(ds);
      viewer.flyTo(ds);
      return registerLayer({ name,...metadata, kind:'kml', dataSource:ds, viewer });
    } finally { URL.revokeObjectURL(url); }
  }
  if (lower.endsWith('.czml')) {
    const czml = JSON.parse(await file.text());
    const ds = await Cesium.CzmlDataSource.load(czml);
    signal?.throwIfAborted();
    await viewer.dataSources.add(ds);
    viewer.flyTo(ds);
    return registerLayer({ name,...metadata, kind:'czml', dataSource:ds, viewer });
  }
  throw new Error('目前支援 GeoJSON / JSON / Shapefile ZIP / KML / KMZ / CZML');
}

export async function addGeoJSON(geojson, name, viewer, style={}) {
  if(style.viewportLines){
    const item={name,kind:style.kind||'geojson',geojson,viewer,dataSource:new Cesium.CustomDataSource(name),style:{...style,metadata:undefined},...style.metadata};
    await viewer.dataSources.add(item.dataSource);const registered=registerLayer(item);
    try{await attachViewportLines(registered,{signal:style.signal});return registered;}catch(error){removeLayer(registered.id);throw error;}
  }
  const limit = Number(style.renderFeatureLimit);
  const rendered = geojson?.type === 'FeatureCollection' && Number.isInteger(limit) && limit > 0 && geojson.features.length > limit
    ? { ...geojson, features:geojson.features.filter((_,index) => index % Math.ceil(geojson.features.length / limit) === 0) }
    : geojson;
  const ds = await Cesium.GeoJsonDataSource.load(rendered, {
    credit:style.credit || (String(style.metadata?.source || '').startsWith('OpenStreetMap') ? '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · <a href="https://download.geofabrik.de/asia/taiwan.html">Geofabrik</a>' : undefined),
    clampToGround:style.clampToGround ?? false,
    stroke:Cesium.Color.fromCssColorString(style.stroke || '#38bdf8'),
    fill:Cesium.Color.fromCssColorString(style.fill || '#38bdf8').withAlpha(style.alpha ?? 0.18),
    strokeWidth:style.strokeWidth || 1.5,
    markerSize:style.circleRadius ? Math.max(4, style.circleRadius * 2) : undefined,
    markerColor:Cesium.Color.fromCssColorString(style.fill || '#38bdf8').withAlpha(style.alpha ?? 1),
  });
  const metadata = style.metadata || {};
  const item = {
    name,
    kind:style.kind || 'geojson',
    geojson,
    dataSource:ds,
    viewer,
    style:{ stroke:style.stroke, fill:style.fill, alpha:style.alpha, strokeWidth:style.strokeWidth, strokeEnabled:style.strokeEnabled ?? true, circleRadius:style.circleRadius,clampToGround:style.clampToGround ?? false },
    ...(rendered !== geojson ? { renderedFeatureCount:rendered.features.length } : {}),
    ...metadata,
  };
  if(style.kind === 'annotation' || style.customized) updateLayerStyle(item,item.style);
  if (style.stageOnly) return item;
  await viewer.dataSources.add(ds);
  if (style.flyTo !== false) viewer.flyTo(ds);
  return registerLayer(item);
}

export function updateLayerStyle(layer,patch) {
  if(!layer?.dataSource)throw new Error('此服務沒有可調整顏色的向量圖層');
  const style={...layer.style,...patch};
  for(const field of ['fill','stroke'])if(style[field] && !/^#[0-9a-f]{3,8}$/i.test(style[field]))throw new Error('顏色格式不正確');
  style.strokeWidth=Math.max(1,Math.min(8,Number(style.strokeWidth) || 3));
  const fill=Cesium.Color.fromCssColorString(style.fill || '#38bdf8'),stroke=Cesium.Color.fromCssColorString(style.stroke || '#38bdf8');
  const time=Cesium.JulianDate.now();
  const entities=layer.dataSource.entities;
  entities.suspendEvents();
  try{for(const entity of [...entities.values]) {
    if(entity._twBorderOnly)continue;
    if(entity.polygon){
      entity.polygon.material=fill.withAlpha(style.alpha ?? .18);entity.polygon.outline=false;
      for(const old of entity._twBorders || [])entities.remove(old);
      entity._twBorders=[];
      if(style.strokeEnabled !== false){
        const hierarchy=entity.polygon.hierarchy?.getValue(time);
        for(const ring of [hierarchy,...(hierarchy?.holes || [])].filter(Boolean))if(ring.positions?.length){
          const border=entities.add({polyline:{positions:[...ring.positions,ring.positions[0]],width:style.strokeWidth,material:stroke,clampToGround:style.clampToGround ?? false}});
          border._twBorderOnly=true;entity._twBorders.push(border);
        }
      }
    }
    if(entity.polyline){entity.polyline.material=style.strokeEnabled === false ? fill : stroke;entity.polyline.width=style.strokeWidth;}
    if(entity.point){entity.point.color=fill;entity.point.outlineColor=stroke;entity.point.outlineWidth=style.strokeEnabled === false ? 0 : style.strokeWidth;}
    if(entity.billboard){entity.billboard.image=new Cesium.PinBuilder().fromColor(fill,24).toDataURL();entity.billboard.color=Cesium.Color.WHITE;}
  }}finally{entities.resumeEvents();}
  style.customized=true;layer.style=style;layer.refreshRendering?.();layer.viewer?.scene.requestRender();
}
