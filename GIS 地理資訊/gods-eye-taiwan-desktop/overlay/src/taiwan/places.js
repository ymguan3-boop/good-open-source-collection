import { browserAi } from './browserAi.js';
const cache = new Map();
export async function resolvePlace(query) {
  query = String(query || '').trim();
  if (!query) throw new Error('請輸入地標名稱');
  if (/^(台北|臺北|Taipei)\s*101(?:大樓)?$/i.test(query)) return {name:'台北101',lat:25.033976,lon:121.56453,height:508,source:'內建地標參考點'};
  const coordinate = query.match(/^(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)$/);
  if (coordinate && Math.abs(Number(coordinate[1])) <= 90 && Math.abs(Number(coordinate[2])) <= 180) return {name:query,lat:Number(coordinate[1]),lon:Number(coordinate[2]),height:150,source:'使用者 WGS84 座標'};
  if (cache.has(query)) return cache.get(query);
  const hit = (await browserAi('/search',{method:'POST',data:{query}})).results?.[0];
  if (!hit || !Number.isFinite(hit.lat) || !Number.isFinite(hit.lon)) throw new Error(`找不到「${query}」，請加上縣市名稱或改用經緯度`);
  cache.set(query,hit); if (cache.size > 100) cache.delete(cache.keys().next().value);
  return hit;
}

export async function findPlaceCandidates(query){
  query=String(query || '').trim();if(!query || query.length>200)throw new Error('請指定 200 字以內的地點名稱');
  if(/^(台北|臺北|Taipei)\s*101(?:大樓)?$/i.test(query) || /^(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)$/.test(query))return [await resolvePlace(query)];
  return (await browserAi('/search',{method:'POST',data:{query}})).results || [];
}
