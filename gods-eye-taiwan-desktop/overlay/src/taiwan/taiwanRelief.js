import * as Cesium from 'cesium';
import { createNlscImagery } from '../maps/nlscImagery.js';
import { browserAi } from './browserAi.js';
import { ensureCounties } from './dataScope.js';
import { registerLayer, listLayers, setLayerVisible } from './layerRegistry.js';

/** A reversible presentation of real terrain, not a synthetic elevation model. */
export async function loadTaiwanRelief(viewer, { signal, mapStackController } = {}) {
  signal?.throwIfAborted();
  const existing = listLayers().find(layer => layer.kind === 'taiwan-relief');
  if (existing) {
    setLayerVisible(existing.id, true);
    existing.focusTaiwan();
    return existing;
  }
  const counties = await ensureCounties();
  const world = listLayers().find(layer => layer.kind === 'world-terrain');
  let provider = world?.terrainProvider, terrainSource = world?.source;
  if (!provider) {
    const runtime = await browserAi('/runtime');
    signal?.throwIfAborted();
    if (runtime.cesiumIonToken) {
      const resource = await Cesium.IonResource.fromAssetId(1, { accessToken: runtime.cesiumIonToken });
      provider = await Cesium.CesiumTerrainProvider.fromUrl(resource, { requestVertexNormals: true });
      terrainSource = 'Cesium World Terrain / ion asset 1';
    } else {
      provider = await Cesium.CesiumTerrainProvider.fromUrl('https://terrain.reearth.land/cesium-mesh/ellipsoid', { requestVertexNormals: true });
      terrainSource = 'Re:Earth / Mapterhorn CC BY 4.0';
    }
  }
  signal?.throwIfAborted();
  const scene = viewer.scene, globe = scene.globe;
  const imageryLayer = viewer.imageryLayers.addImageryProvider(createNlscImagery('PHOTO2'));
  imageryLayer.show = false;
  const borders = new Cesium.CustomDataSource('台灣地形展示縣市界');
  for (const feature of counties.features) {
    const polygons = feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [feature.geometry.coordinates];
    for (const polygon of polygons) for (const ring of polygon) {
      borders.entities.add({ polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(ring.flatMap(point => point.slice(0, 2))),
        width: 1.5, material: Cesium.Color.fromCssColorString('#85ddd1'), clampToGround: true,
      } });
    }
  }
  borders.show = false;
  try {
    await viewer.dataSources.add(borders);
    signal?.throwIfAborted();
  } catch (error) {
    viewer.dataSources.remove(borders, true);
    viewer.imageryLayers.remove(imageryLayer, true);
    throw error;
  }
  let saved = null, scale = 3, disposed = false, layer;
  const lightFrame = Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(121, 24));
  const lightDirection = Cesium.Cartesian3.normalize(Cesium.Matrix4.multiplyByPointAsVector(lightFrame, new Cesium.Cartesian3(0.6, -0.6, -0.8), new Cesium.Cartesian3()), new Cesium.Cartesian3());
  function activate() {
    if (disposed || saved) return;
    const host = mapStackController?.getImageryHostTileset();
    saved = {
      terrain: viewer.terrainProvider, exaggeration: scene.verticalExaggeration,
      relativeHeight: scene.verticalExaggerationRelativeHeight, light: scene.light,
      lighting: globe.enableLighting, atmosphere: globe.showGroundAtmosphere,
      fadeOut: globe.lightingFadeOutDistance, fadeIn: globe.lightingFadeInDistance,
      globeShow: globe.show, host, hostShow: host?.show,
      tilesets: listLayers().filter(item => item.kind === '3d-tiles' && item.tileset),
      imagery: Array.from({ length: viewer.imageryLayers.length }, (_, index) => viewer.imageryLayers.get(index))
        .filter(item => item !== imageryLayer).map(item => [item, item.show]),
    };
    for (const [item] of saved.imagery) item.show = false;
    for (const item of saved.tilesets) item.tileset.show = false;
    if (host && !host.isDestroyed()) host.show = false;
    viewer.terrainProvider = provider;
    globe.show = true;
    globe.enableLighting = true;
    globe.showGroundAtmosphere = false;
    // Keep slope lighting visible at island scale, independent of the clock.
    globe.lightingFadeOutDistance = 0;
    globe.lightingFadeInDistance = 1;
    scene.light = new Cesium.DirectionalLight({ direction: lightDirection, intensity: 1.3 });
    scene.verticalExaggeration = scale;
    scene.verticalExaggerationRelativeHeight = 0;
    imageryLayer.show = true;
    borders.show = true;
    scene.requestRender();
  }
  function deactivate(restoreMap = true) {
    if (!saved) return;
    const previous = saved;
    saved = null;
    imageryLayer.show = false;
    borders.show = false;
    scene.verticalExaggeration = previous.exaggeration;
    scene.verticalExaggerationRelativeHeight = previous.relativeHeight;
    scene.light = previous.light;
    globe.enableLighting = previous.lighting;
    globe.showGroundAtmosphere = previous.atmosphere;
    globe.lightingFadeOutDistance = previous.fadeOut;
    globe.lightingFadeInDistance = previous.fadeIn;
    // Restore overlay visibility even when a new base map owns the globe.
    // Respect changes made to registered layers while the presentation was open.
    for (const [item, show] of previous.imagery) if (viewer.imageryLayers.contains(item)) {
      const owner = listLayers().find(registered => registered.imageryLayer === item);
      item.show = owner ? owner.visible : show;
    }
    for (const item of previous.tilesets) if (listLayers().includes(item) && !item.tileset.isDestroyed()) item.tileset.show = item.visible;
    if (restoreMap) {
      // A hidden/removed world-terrain layer must not be revived by restoration.
      const currentWorld = listLayers().find(item => item.kind === 'world-terrain');
      viewer.terrainProvider = currentWorld
        ? (currentWorld.visible ? currentWorld.terrainProvider : new Cesium.EllipsoidTerrainProvider())
        : previous.terrain;
      globe.show = previous.globeShow;
      if (previous.host && !previous.host.isDestroyed()) previous.host.show = previous.hostShow;
    }
    scene.requestRender();
  }
  const removeMapListener = mapStackController?.subscribe(() => {
    if (!saved) return;
    // A new base map owns its provider and visibility; only undo presentation.
    deactivate(false);
    layer.visible = false;
    window.dispatchEvent(new CustomEvent('gev-tw:layers-changed'));
  });
  function focusTaiwan() {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(121, 22.7, 500000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-60), roll: 0 }, duration: 1.2,
    });
  }
  layer = registerLayer({
    name: '台灣 3D 地形地貌', kind: 'taiwan-relief', sourceKey: 'taiwan-relief', viewer,
    source: `${terrainSource} + 國土測繪中心 PHOTO2 / 官方縣市界`,
    description: '真實地形展示；高程視覺放大不改變原始高程，不是官方 20 公尺 DTM。',
    dataMetadata: { displayOnly: true, verticalExaggeration: scale },
    terrainProvider: provider,
    setVisibility: visible => visible ? activate() : deactivate(),
    getScale: () => scale,
    setScale: value => {
      const number = Number(value);
      if (!Number.isFinite(number)) return;
      scale = Math.max(1, Math.min(6, number));
      layer.dataMetadata.verticalExaggeration = scale;
      if (saved) scene.verticalExaggeration = scale;
      scene.requestRender();
    },
    focusTaiwan,
    dispose: () => {
      deactivate(); disposed = true; removeMapListener?.();
      viewer.dataSources.remove(borders, true);
      viewer.imageryLayers.remove(imageryLayer, true);
    },
  });
  activate();
  focusTaiwan();
  return layer;
}
