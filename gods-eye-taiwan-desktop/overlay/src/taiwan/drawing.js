import * as Cesium from 'cesium';
import * as turf from '@turf/turf';
import { addGeoJSON } from './dataImport.js';
import { removeLayer } from './layerRegistry.js';

const LABELS = { path:'路徑', polygon:'多邊形', circle:'圓形', distance:'距離量測', area:'面積量測' };

export function createDrawingController(viewer, onResult) {
  let mode = null;
  let positions = [];
  let preview = null;
  const vertices = [];
  let priorDoubleClick = null;
  let revision = 0;
  let requestedRadius = 100;
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  const colors = { stroke:'#ffca55', fill:'#ffca55', alpha:0.2, strokeWidth:3, clampToGround:true, flyTo:false };

  function pick(screen) {
    const scene = viewer.scene;
    const cartesian = scene.pickPositionSupported ? scene.pickPosition(screen) : null;
    const ground = cartesian || viewer.camera.pickEllipsoid(screen, scene.globe.ellipsoid);
    if (!ground) return null;
    const c = Cesium.Cartographic.fromCartesian(ground);
    return [Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude)];
  }
  function repaint() {
    viewer.entities.remove(preview);
    preview = null;
    for (const vertex of vertices) viewer.entities.remove(vertex);
    vertices.length = 0;
    if (!positions.length) return;
    const points = positions.map(p => Cesium.Cartesian3.fromDegrees(...p));
    const color = Cesium.Color.fromCssColorString(colors.strokeEnabled === false ? colors.fill : colors.stroke);
    for (const [index,position] of points.entries()) vertices.push(viewer.entities.add({position,
      point:{pixelSize:index === 0 ? 12 : 9,color,outlineColor:Cesium.Color.WHITE,outlineWidth:2,heightReference:Cesium.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:Number.POSITIVE_INFINITY},
      ...(index === 0 && ['polygon','area'].includes(mode) ? {label:{text:'起點',font:'12px sans-serif',pixelOffset:new Cesium.Cartesian2(0,-20),fillColor:Cesium.Color.WHITE,showBackground:true,heightReference:Cesium.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:Number.POSITIVE_INFINITY}} : {})}));
    if (mode === 'circle' && positions.length === 2) {
      const circle = turf.circle(positions[0], turf.distance(positions[0], positions[1]), { units:'kilometers', steps:96 });
      preview = viewer.entities.add({ polygon:{ hierarchy:circle.geometry.coordinates[0].map(p => Cesium.Cartesian3.fromDegrees(...p)), material:Cesium.Color.fromCssColorString(colors.fill).withAlpha(colors.alpha) }, ...(colors.strokeEnabled !== false ? {polyline:{positions:circle.geometry.coordinates[0].map(p=>Cesium.Cartesian3.fromDegrees(...p)),width:colors.strokeWidth,material:color,clampToGround:true}} : {}) });
    } else if (points.length > 1) {
      preview = viewer.entities.add({ polyline:{ positions:points, width:colors.strokeWidth, material:color, clampToGround:true } });
    } else preview = viewer.entities.add({ point:{ pixelSize:9, color }, position:points[0] });
    viewer.scene.requestRender();
  }
  function start(nextMode,color = '#ffca55') {
    if (!LABELS[nextMode]) throw new Error('不支援的繪製模式');
    cancel();
    mode = nextMode;
    setStyle(typeof color === 'string' ? {fill:color,stroke:color} : color);
    requestedRadius = Number(color.radiusMeters) || 100;
    priorDoubleClick = viewer.screenSpaceEventHandler.getInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    viewer.canvas.style.cursor = 'crosshair';
    onResult({ mode, status:nextMode === 'circle' ? '在地圖點中心，確認半徑後按完成繪製。' : ['polygon','area'].includes(nextMode) ? '依序點選，點回起點閉合；也可雙擊或按完成。' : '在地圖依序點選；雙擊完成。' });
  }
  function cancel() {
    revision++;
    if (priorDoubleClick) viewer.screenSpaceEventHandler.setInputAction(priorDoubleClick, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    priorDoubleClick = null;
    mode = null;
    positions = [];
    viewer.canvas.style.cursor = '';
    if (preview) viewer.entities.remove(preview);
    preview = null;
    for (const vertex of vertices) viewer.entities.remove(vertex);
    vertices.length = 0;
    viewer.scene.requestRender();
  }
  function setColor(tool,color) {
    if (tool !== mode || !/^#[0-9a-f]{6}$/i.test(color)) return;
    colors.fill = color; repaint();
  }
  function setStyle(patch) { Object.assign(colors,patch); repaint(); }
  function setRadius(meters) {
    const value=Number(meters);if(!Number.isFinite(value)||value<1||value>100000)throw new Error('半徑需介於1至100,000公尺');requestedRadius=value;
    if(mode === 'circle' && positions.length){const bearing=positions[1] ? turf.bearing(positions[0],positions[1]) : 90;positions[1]=turf.destination(positions[0],value,bearing,{units:'meters'}).geometry.coordinates;repaint();onResult({mode,status:'請確認半徑後按完成繪製',radiusMeters:value});}
  }
  async function finish() {
    if (!mode) return;
    const active = mode;
    const finalStyle = {...colors};
    const points = [...positions];
    if (points.length < (active === 'polygon' || active === 'area' ? 3 : 2)) {
      onResult({ mode:active, status:'點數不足；請繼續點選。' });
      return;
    }
    cancel();
    const currentRevision = revision;
    let feature;
    if (active === 'circle') feature = turf.circle(points[0], turf.distance(points[0], points[1]), { units:'kilometers', steps:96 });
    else if (active === 'polygon' || active === 'area') feature = turf.polygon([[...points, points[0]]]);
    else feature = turf.lineString(points);
    const lengthMeters = feature.geometry.type === 'LineString'
      ? turf.length(feature, { units:'kilometers' }) * 1000
      : turf.length(turf.polygonToLine(feature), { units:'kilometers' }) * 1000;
    const areaM2 = feature.geometry.type === 'Polygon' ? turf.area(feature) : null;
    const name = `${LABELS[active]} ${new Date().toLocaleString('zh-TW')}`;
    feature.properties = {name,lengthMeters,areaM2,...(active === 'circle' ? {radiusMeters:turf.distance(points[0],points[1],{units:'meters'}),center:points[0]} : {}),analysisStatus:'繪製完成；請加入並確認分析圖資'};
    const layer = await addGeoJSON(turf.featureCollection([feature]), name, viewer, {
      ...finalStyle, flyTo:false, kind:'annotation', metadata:{dataMetadata:{measurement:{mode:active,...feature.properties},analysisInputsConfirmed:false},source:'使用者繪製；Turf.js WGS84 距離及面積概算',description:'先加入圖資、確認後再分析'} });
    if (currentRevision !== revision) { removeLayer(layer.id); return; }
    onResult({ mode:active, layerId:layer.id, status:'繪製完成', ...feature.properties });
  }
  handler.setInputAction(event => {
    if (!mode) return;
    if (['polygon','area'].includes(mode) && positions.length >= 3) {
      const location = Cesium.Cartographic.fromDegrees(...positions[0]);
      const height = viewer.scene.globe.getHeight(location) || 0;
      const first = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene,Cesium.Cartesian3.fromDegrees(...positions[0],height));
      if (first && Cesium.Cartesian2.distance(first,event.position) <= 14) { void finish(); return; }
    }
    const point = pick(event.position);
    if (!point) return;
    if (positions.length >= 500) { onResult({ mode, status:'最多 500 個節點，請完成目前繪製。' }); return; }
    if (positions.length && turf.distance(positions.at(-1), point, { units:'meters' }) < 0.3) return;
    if(mode === 'circle'){if(!positions.length){positions=[point];setRadius(requestedRadius);}else{positions[1]=point;requestedRadius=turf.distance(positions[0],positions[1],{units:'meters'});repaint();onResult({mode,status:'請確認半徑後按完成繪製',radiusMeters:requestedRadius});}return;}
    positions.push(point);repaint();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  handler.setInputAction(() => { if (mode && mode !== 'circle') void finish(); }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  return { start, finish, cancel, setColor, setStyle, setRadius, destroy:() => { cancel(); handler.destroy(); } };
}
