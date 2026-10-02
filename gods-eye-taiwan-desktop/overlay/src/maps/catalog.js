import * as Cesium from 'cesium';
export const MAP_STACKS = [
  {id:'nlsc-ortho',label:'NLSC 臺灣通用正射影像',shortLabel:'正射影像',kind:'nlsc',nlscLayer:'PHOTO2',requiresIon:false},
  {id:'nlsc-emap',label:'NLSC 臺灣通用電子地圖',shortLabel:'電子地圖',kind:'nlsc',nlscLayer:'EMAP',requiresIon:false},
  {
    id: 'photoreal',
    label: 'Google 3D',
    shortLabel: '3D',
    kind: 'photoreal',
    requiresIon: false,
  },
  {
    id: 'bing-aerial',
    label: 'Bing Aerial',
    shortLabel: 'Aerial',
    kind: 'ion',
    style: Cesium.IonWorldImageryStyle.AERIAL,
    requiresIon: true,
  },
  {
    id: 'bing-labels',
    label: 'Bing Labels',
    shortLabel: 'Labels',
    kind: 'ion',
    style: Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS,
    requiresIon: true,
  },
  {
    id: 'esri-imagery',
    label: 'Esri Satellite',
    shortLabel: 'SAT',
    kind: 'esri-imagery',
    requiresIon: false,
  },
  {
    id: 'osm',
    label: 'OSM',
    shortLabel: 'OSM',
    kind: 'osm',
    requiresIon: false,
  },
];
