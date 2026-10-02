import * as Cesium from 'cesium';

/** Official, public NLSC WMTS; keep rows and columns in the service's order. */
export function createNlscImagery(layer = 'PHOTO2') {
  if (!['PHOTO2', 'EMAP'].includes(layer)) throw new Error('不支援的 NLSC 底圖');
  return new Cesium.WebMapTileServiceImageryProvider({
    url: `https://wmts.nlsc.gov.tw/wmts/${layer}/default/GoogleMapsCompatible/{TileMatrix}/{TileRow}/{TileCol}`,
    layer,
    style: 'default',
    format: 'image/jpeg',
    tileMatrixSetID: 'GoogleMapsCompatible',
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    maximumLevel: 19,
    rectangle: Cesium.Rectangle.fromDegrees(117.5, 20, 123.5, 27),
    credit: '內政部國土測繪中心｜' + (layer === 'PHOTO2' ? '臺灣通用正射影像' : '臺灣通用電子地圖'),
  });
}
