// TomTom-compatible fallback. When TomTom rejects the stored key (HTTP 401/403)
// the same request is answered from OpenStreetMap services (Nominatim, Photon,
// FOSSGIS OSRM) and returned in TomTom's JSON shape, so existing callers keep
// working. The rejected key is remembered only in memory; a changed key retries.
const UA = { 'User-Agent':'GodsEyeTaiwan-local/1.0 (+https://github.com/ymguan3-boop/good-open-source-collection)' };
const rejected = new Set();
let lastNominatim = 0;
export const tomtomFallbackState = { active:false, reason:'', at:null };

const abbreviations = [[/國民中學/g,'國中'],[/國民小學/g,'國小'],[/高級中學/g,'高中'],[/高級職業學校/g,'高職']];
const inTaiwan = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= 20 && lat <= 27 && lon >= 117 && lon <= 123.5;

async function getJson(url, signal, timeout = 15000) {
  const response = await fetch(url, { headers:UA, signal:AbortSignal.any([signal, AbortSignal.timeout(timeout)].filter(Boolean)) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
async function nominatim(query, signal) {
  const wait = lastNominatim + 1100 - Date.now(); lastNominatim = Date.now() + Math.max(0, wait);
  if (wait > 0) await new Promise(done => setTimeout(done, wait));
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ q:query, format:'jsonv2', limit:'5', countrycodes:'tw', 'accept-language':'zh-TW', addressdetails:'1' });
  const rows = await getJson(url, signal);
  return rows.map(row => ({ name:row.name || row.display_name.split(',')[0], address:row.display_name, municipality:row.address?.city || row.address?.town || row.address?.county || '', lat:Number(row.lat), lon:Number(row.lon), id:`osm:${row.osm_type}:${row.osm_id}`, type:['administrative','city','town'].includes(row.type) ? 'Geography' : 'POI' }));
}
async function photon(query, signal) {
  const url = new URL('https://photon.komoot.io/api/');
  url.search = new URLSearchParams({ q:query, limit:'5', bbox:'117,20,123.5,27' });
  const data = await getJson(url, signal);
  return (data.features || []).map((f, i) => ({ name:f.properties?.name || query, address:[f.properties?.state, f.properties?.city, f.properties?.street, f.properties?.housenumber].filter(Boolean).join(''), municipality:f.properties?.city || '', lat:f.geometry?.coordinates?.[1], lon:f.geometry?.coordinates?.[0], id:f.properties?.osm_id ? `osm:${f.properties.osm_type}:${f.properties.osm_id}` : `photon:${i}`, type:'POI' }));
}
export async function publicGeocode(query, signal) {
  // OSM writes 臺 (not 台) and 校區 (not 分校/分部); retry with those spellings, then without the campus suffix.
  const spellings = [...new Set([query, query.replace(/台/g, '臺')])];
  const campus = spellings.flatMap(text => [text, text.replace(/(分校|分部|分院)$/, '校區'), text.replace(/(分校|分部|分院|校區|校園)$/, '')]);
  const variants = [...new Set([...campus, ...campus.flatMap(text => abbreviations.map(([from, to]) => text.replace(from, to))), query.replace(/^[^縣市]{1,3}[縣市]/, '')])].filter(Boolean).slice(0, 14);
  for (const variant of variants) {
    for (const search of [nominatim, photon]) {
      try { const found = (await search(variant, signal)).filter(item => inTaiwan(item.lat, item.lon)); if (found.length) return found; }
      catch (error) { signal?.throwIfAborted(); }
    }
  }
  return [];
}
const toTomTom = item => ({ id:item.id, type:item.type, poi:{ name:item.name }, address:{ freeformAddress:item.address || item.name, municipality:item.municipality }, position:{ lat:item.lat, lon:item.lon } });

const messageOf = step => {
  const verb = { turn:'轉彎', 'new name':'繼續行駛', depart:'出發', arrive:'抵達目的地', merge:'匯入', 'on ramp':'進入匝道', 'off ramp':'離開匝道', fork:'分岔', roundabout:'進入圓環', rotary:'進入圓環', 'end of road':'道路盡頭轉彎', continue:'繼續直行' }[step.maneuver?.type] || '前進';
  const side = { left:'左', right:'右', 'slight left':'稍向左', 'slight right':'稍向右', 'sharp left':'急向左', 'sharp right':'急向右', uturn:'迴轉' }[step.maneuver?.modifier];
  return `${side && ['turn', 'end of road', 'fork'].includes(step.maneuver?.type) ? side + verb : verb}${step.name ? '，沿 ' + step.name : ''}`;
};
async function osrmRoute(url, signal) {
  const match = decodeURIComponent(url.pathname).match(/calculateRoute\/(-?[\d.]+),(-?[\d.]+):(-?[\d.]+),(-?[\d.]+)/);
  if (!match) throw new Error('路線座標不正確');
  const [, lat1, lon1, lat2, lon2] = match;
  const profile = url.searchParams.get('travelMode') === 'pedestrian' ? 'routed-foot' : 'routed-car';
  const data = await getJson(`https://routing.openstreetmap.de/${profile}/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson&steps=true`, signal, 25000);
  const route = data.routes?.[0];
  if (data.code !== 'Ok' || !route?.geometry?.coordinates?.length) throw new Error('OpenStreetMap 路線服務查無路線');
  let offset = 0;
  const instructions = (route.legs || []).flatMap(leg => leg.steps || []).map(step => { const item = { routeOffsetInMeters:Math.round(offset), message:messageOf(step) }; offset += step.distance || 0; return item; });
  return { routes:[{ summary:{ lengthInMeters:Math.round(route.distance), travelTimeInSeconds:Math.round(route.duration), trafficDelayInSeconds:0 }, legs:[{ points:route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })) }], guidance:{ instructions } }], fallback:'osm' };
}
const reply = body => new Response(JSON.stringify(body), { status:200, headers:{ 'Content-Type':'application/json; charset=utf-8', 'X-Provider-Fallback':'openstreetmap' } });

/** Drop-in for fetch(): TomTom first; on 401/403 answer from OpenStreetMap. */
export async function tomtomFetch(input, init = {}) {
  const href = typeof input === 'string' ? input : input?.href || input?.url;
  let url; try { url = new URL(href); } catch { return fetch(input, init); }
  if (url.hostname !== 'api.tomtom.com') return fetch(input, init);
  const key = url.searchParams.get('key') || '';
  const isSearch = /^\/search\/2\/(?:search|geocode|poiSearch)\//.test(url.pathname), isRoute = /^\/routing\/1\/calculateRoute\//.test(url.pathname);
  if (!(isSearch || isRoute)) return fetch(input, init);
  if (!rejected.has(key)) {
    const response = await fetch(input, init);
    if (response.status !== 401 && response.status !== 403) return response;
    await response.body?.cancel(); rejected.add(key);
  }
  Object.assign(tomtomFallbackState, { active:true, reason:'TomTom 金鑰被拒絕（HTTP 401/403），已改用 OpenStreetMap 免金鑰服務', at:new Date().toISOString() });
  const signal = init.signal;
  try {
    if (isRoute) return reply(await osrmRoute(url, signal));
    const query = decodeURIComponent(url.pathname.split('/').pop().replace(/\.json$/, ''));
    let found = await publicGeocode(query, signal);
    if (/geocode/.test(url.pathname)) found = found.map(item => ({ ...item, type:'Geography', municipality:query }));
    const limit = Number(url.searchParams.get('limit')) || 5;
    return reply({ results:found.slice(0, limit).map(toTomTom), fallback:'osm' });
  } catch (error) {
    return new Response(JSON.stringify({ error:{ message:`TomTom 金鑰無效，且 OpenStreetMap 備援失敗：${error.message}` } }), { status:502, headers:{ 'Content-Type':'application/json' } });
  }
}
