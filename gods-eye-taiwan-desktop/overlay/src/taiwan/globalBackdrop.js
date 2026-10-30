import * as Cesium from 'cesium';

// NLSC orthophoto / EMAP cover Taiwan only. Loading NLSC buildings switches the base to it, so the
// rest of the globe (the 全球 view) would be a bare single-colour sphere. While any NLSC WMTS layer is
// present, keep a worldwide satellite layer underneath it; the NLSC tiles stay on top over Taiwan.
const isNlsc = layer => {
  const provider = layer?.imageryProvider;
  const url = provider?.url || provider?._resource?.url || '';
  return /wmts\.nlsc\.gov\.tw/.test(String(url));
};

export function installGlobalBackdrop(viewer) {
  const layers = viewer.imageryLayers;
  let backdrop = null, creating = false, disposed = false;
  const hasNlsc = () => { for (let i = 0; i < layers.length; i++) if (layers.get(i) !== backdrop && isNlsc(layers.get(i))) return true; return false; };
  async function provider() {
    try {
      return await Cesium.ArcGisMapServerImageryProvider.fromUrl('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', {
        credit: 'Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        enablePickFeatures: false,
      });
    } catch {
      return new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/', credit: '© OpenStreetMap contributors' });
    }
  }
  async function sync() {
    if (disposed || creating) return;
    if (hasNlsc()) {
      if (!backdrop) {
        creating = true;
        try {
          const created = await provider();
          if (disposed || !hasNlsc()) return;
          backdrop = layers.addImageryProvider(created, 0);
        } finally { creating = false; }
      } else if (layers.indexOf(backdrop) !== 0) layers.lowerToBottom(backdrop);
    } else if (backdrop) {
      layers.remove(backdrop, true); backdrop = null;
    }
    viewer.scene.requestRender();
  }
  const offs = [layers.layerAdded.addEventListener(sync), layers.layerRemoved.addEventListener(sync), layers.layerMoved.addEventListener(sync)];
  void sync();
  return () => {
    disposed = true; offs.forEach(off => off());
    if (backdrop && !viewer.isDestroyed()) layers.remove(backdrop, true);
    backdrop = null;
  };
}
