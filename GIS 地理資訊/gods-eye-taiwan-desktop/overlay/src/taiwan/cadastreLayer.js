import * as Cesium from 'cesium';
import { registerLayer, removeLayer, listLayers } from './layerRegistry.js';

// 地籍圖（地號線）：本機匯入的地籍圖（data/local/cadastre-yilan.sqlite）依畫面中心取回附近地號邊界並貼地繪製。
// 高度超過約 4 公里不繪製（避免一次取回幾十萬筆）；只畫畫面中心約 0.9 公里見方的範圍，500 公尺內再標地號。
const API = '/api/taiwan/nlsc-buildings/info/cadastre';
const MAX_HEIGHT_M = 4000, WINDOW_DEGREES = 0.004, LABEL_HEIGHT_M = 500, MAX_PARCELS = 5000, MAX_LABELS = 500;
export const CADASTRE_LAYER_NAME = '宜蘭縣地籍圖';

// One layer per township, so each can be loaded, shown, hidden and removed on its own.
export const cadastreLayers = () => listLayers().filter(layer => layer.kind === 'cadastre');
export const cadastreLayerOf = town => cadastreLayers().find(layer => layer.cadastreTown === town) || null;
export const cadastreActive = () => cadastreLayers().some(layer => layer.visible !== false);

const ringCentre = ring => {
  let x = 0, y = 0;
  for (const [lon, lat] of ring) { x += lon; y += lat; }
  return [x / ring.length, y / ring.length];
};

export function loadCadastreLayer(viewer, status = {}, town) {
  if (!town) throw new Error('需要指定鄉鎮市');
  const existing = cadastreLayerOf(town);
  if (existing) removeLayer(existing.id);
  const dataSource = new Cesium.CustomDataSource(`${CADASTRE_LAYER_NAME}｜${town}`);
  viewer.dataSources.add(dataSource);
  let timer = null, controller = null, destroyed = false;
  const state = { note: '拉近到約 4 公里內才會顯示地號線', parcels: 0, truncated: false };
  const notify = () => window.dispatchEvent(new CustomEvent('gev-tw:layers-changed'));
  const polylineMaterial = Cesium.Color.fromCssColorString('#facc15').withAlpha(0.95);
  const labelFill = Cesium.Color.fromCssColorString('#fff7cc'), labelOutline = Cesium.Color.fromCssColorString('#3b2f00');

  const clear = () => { dataSource.entities.removeAll(); state.parcels = 0; state.truncated = false; };
  async function refresh() {
    if (destroyed || !layer.visible) return;
    const height = viewer.camera.positionCartographic.height;
    if (height > MAX_HEIGHT_M) { clear(); state.note = '高度太高，請拉近到約 4 公里內再顯示地號線（只畫畫面中心附近）'; viewer.scene.requestRender(); return notify(); }
    const canvas = viewer.scene.canvas, centre = viewer.camera.pickEllipsoid(new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2), viewer.scene.globe.ellipsoid) || Cesium.Cartesian3.clone(viewer.camera.positionWC);
    const where = Cesium.Cartographic.fromCartesian(centre), lon = Cesium.Math.toDegrees(where.longitude), lat = Cesium.Math.toDegrees(where.latitude);
    const box = [lon - WINDOW_DEGREES, lat - WINDOW_DEGREES, lon + WINDOW_DEGREES, lat + WINDOW_DEGREES];
    controller?.abort(); controller = new AbortController();
    try {
      const response = await fetch(`${API}/parcels?bbox=${box.map(v => v.toFixed(6)).join(',')}&limit=${MAX_PARCELS}&town=${encodeURIComponent(town)}`, { signal: controller.signal, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (destroyed) return;
      dataSource.entities.suspendEvents();
      clear();
      const labelled = height <= LABEL_HEIGHT_M && data.features.length <= MAX_LABELS;
      for (const feature of data.features) {
        const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
        for (const rings of polygons) for (const ring of rings) {
          dataSource.entities.add({ polyline: { positions: Cesium.Cartesian3.fromDegreesArray(ring.flat()), width: 1.2, material: polylineMaterial, clampToGround: true, classificationType: Cesium.ClassificationType.TERRAIN } });
        }
        if (labelled) {
          const [lon, lat] = ringCentre(polygons[0][0]);
          dataSource.entities.add({ position: Cesium.Cartesian3.fromDegrees(lon, lat), label: { text: feature.properties.landNumber, font: '600 13px sans-serif', fillColor: labelFill, outlineColor: labelOutline, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: 1e6, scale: 0.95 } });
        }
      }
      dataSource.entities.resumeEvents();
      state.parcels = data.features.length; state.truncated = data.truncated;
      state.note = `畫面中心附近 ${data.features.length.toLocaleString('zh-TW')} 筆地號${data.truncated ? `（超過 ${MAX_PARCELS} 筆，只畫前 ${MAX_PARCELS} 筆；請再拉近）` : ''}${labelled ? '，已標示地號' : '；拉近到約 500 公尺內會標示地號'}`;
      viewer.scene.requestRender(); notify();
    } catch (error) {
      if (error.name === 'AbortError') return;
      dataSource.entities.resumeEvents(); state.note = '地籍圖讀取失敗：' + error.message; notify();
    }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => void refresh(), 350); };
  const remove = viewer.camera.moveEnd.addEventListener(schedule);
  const layer = registerLayer({
    name: `${CADASTRE_LAYER_NAME}｜${town}`, kind: 'cadastre', cadastreTown: town, dataSource, viewer, scopeManaged: false,
    source: `${status.source || '內政部地政司 地籍圖'}（使用者提供，本機匯入）${status.latestDataDate ? '；資料日期 ' + status.latestDataDate : ''}`,
    dataMetadata: { parcels: status.parcels ?? null, latestDataDate: status.latestDataDate ?? null, sourceSha256: status.sourceSha256 ?? null, coverageNote: '只畫畫面中心附近（約 0.9 公里見方、最多 5,000 筆）的地號邊界；本機資料，非官方線上服務。' },
    cadastreState: state,
    refresh,
    dispose() { destroyed = true; clearTimeout(timer); controller?.abort(); remove?.(); },
  });
  // The layer list announces every change (including this layer's own status text): refresh only when it is shown again.
  let lastVisible = layer.visible;
  const onLayers = () => { if (layer.visible !== lastVisible) { lastVisible = layer.visible; if (layer.visible) schedule(); } };
  window.addEventListener('gev-tw:layers-changed', onLayers);
  const priorDispose = layer.dispose; layer.dispose = () => { window.removeEventListener('gev-tw:layers-changed', onLayers); priorDispose?.(); };
  void refresh();
  return layer;
}
