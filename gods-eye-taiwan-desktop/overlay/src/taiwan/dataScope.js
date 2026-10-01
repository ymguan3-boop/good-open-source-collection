import * as turf from '@turf/turf';
let selected = {mode:'county',county:'宜蘭縣'};
try {const saved=JSON.parse(localStorage.getItem('gev.tw.dataScope') || 'null');if(saved && ['county','taiwan'].includes(saved.mode))selected=saved;} catch {}
let boundaries;let loading;
export async function ensureCounties() {
  if(boundaries)return boundaries;
  loading ||= fetch(new URL('./data/taiwan-counties.geojson',import.meta.url)).then(response=>{if(!response.ok)throw new Error('官方縣市界載入失敗');return response.json();}).then(fc=>{boundaries=fc;return fc;}).catch(error=>{loading=null;throw error;});
  return loading;
}
export function dataScope(){return {...selected};}
export function scopeLabel(){return selected.mode === 'taiwan' ? '全台灣' : selected.county;}
export async function setDataScope(mode,county) {
  await ensureCounties();
  if(!['county','taiwan'].includes(mode) || (mode === 'county' && !boundaries.features.some(f=>f.properties.COUNTYNAME === county)))throw new Error('請選擇有效縣市');
  selected={mode,county};localStorage.setItem('gev.tw.dataScope',JSON.stringify(selected));
}
export function scopeGeometry(county=selected.mode === 'county' ? selected.county : null) {
  if(!boundaries)throw new Error('請先載入縣市界');
  return county ? boundaries.features.find(f=>f.properties.COUNTYNAME === county) : turf.featureCollection(boundaries.features);
}
export function scopeBounds(county) {const box=turf.bbox(scopeGeometry(county));return {west:box[0],south:box[1],east:box[2],north:box[3]};}
export function countyNames(){return boundaries?.features.map(f=>f.properties.COUNTYNAME) || [];}
export function withinScope(lon,lat) {
  if(!Number.isFinite(lon) || !Number.isFinite(lat))return false;
  if(selected.mode === 'taiwan')return lon>=117.8 && lon<=123.5 && lat>=20 && lat<=27;
  if(boundaries) {const f=scopeGeometry();const b=f.bbox || turf.bbox(f);if(lon<b[0] || lon>b[2] || lat<b[1] || lat>b[3])return false;return turf.booleanPointInPolygon(turf.point([lon,lat]),f);}
  return lon>=117 && lon<=123.5 && lat>=20 && lat<=27;
}
export function filterToCounty(fc,county) {
  const region=scopeGeometry(county);const b=region.bbox || turf.bbox(region);
  return {...fc,features:fc.features.filter(feature=>{try{const f=feature.bbox || turf.bbox(feature);if(f[2]<b[0] || f[0]>b[2] || f[3]<b[1] || f[1]>b[3])return false;return turf.booleanIntersects(feature,region);}catch{return false;}})};
}
// Keep the official boundary exact, but clip the mask to the current query tile.
// Yield between small batches so Cancel and progress remain usable.
export async function filterToCountyAsync(fc,county,{bbox,signal}={}) {
  const original=scopeGeometry(county),region=bbox?turf.bboxClip(original,[bbox.west,bbox.south,bbox.east,bbox.north]):original;
  const bounds=turf.bbox(region),features=[];
  for(let index=0;index<fc.features.length;index++){
    signal?.throwIfAborted();const feature=fc.features[index];
    try{const b=feature.bbox||turf.bbox(feature);if(!(b[2]<bounds[0]||b[0]>bounds[2]||b[3]<bounds[1]||b[1]>bounds[3]) && turf.booleanIntersects(feature,region))features.push(feature);}catch{}
    // Timer yields are throttled to seconds in a background browser tab.
    // Message tasks let controls respond without multiplying that delay per batch.
    if(index%100===99)await new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};channel.port2.postMessage(null);});
  }
  return {...fc,features};
}
export function filterAircraftSnapshot(snapshot) {
  if(!Array.isArray(snapshot?.records))return snapshot;
  return {...snapshot,records:snapshot.records.filter(record=>withinScope(record.longitude,record.latitude)),coverage:`${scopeLabel()}；來源目前回傳的航空動態`};
}

export function withinMarineScope(lon,lat) {
  if(!Number.isFinite(lon) || !Number.isFinite(lat))return false;
  if(selected.mode === 'taiwan' || !boundaries)return lon>=117.8 && lon<=123.5 && lat>=20 && lat<=27;
  const b=scopeBounds();return lon>=b.west-0.1 && lon<=b.east+0.1 && lat>=b.south-0.1 && lat<=b.north+0.1;
}
