// Ministry of Transportation / Freeway Bureau open-data CCTV catalog.
// Source: https://data.gov.tw/dataset/37665 (OGL Taiwan 1.0).
const CATALOG_URL = 'https://tisvcloud.freeway.gov.tw/history/motc20/CCTV.xml';
const MAX_XML_BYTES = 4 * 1024 * 1024;

function field(xml, name) {
  return (xml.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`))?.[1] || '')
    .trim().replace(/&amp;/g, '&');
}

export function parseTaiwanCctvXml(xml) {
  const sources = [];
  const ids = new Set();
  for (const match of String(xml).matchAll(/<CCTV>([\s\S]*?)<\/CCTV>/g)) {
    const row = match[1];
    const rawId = field(row, 'CCTVID');
    const lat = Number(field(row, 'PositionLat'));
    const lon = Number(field(row, 'PositionLon'));
    let url;
    try { url = new URL(field(row, 'VideoStreamURL')); } catch { continue; }
    if (!rawId || ids.has(rawId) || !Number.isFinite(lat) || !Number.isFinite(lon) ||
        lat < 21 || lat > 26 || lon < 119 || lon > 123 || url.protocol !== 'https:' ||
        !/(?:^|\.)(?:freeway|thb)\.gov\.tw$/i.test(url.hostname)) continue;
    ids.add(rawId);
    const road = field(row, 'RoadName');
    const mile = field(row, 'LocationMile');
    sources.push({
      id:`tw-nfb-${rawId}`, name:[road, mile, rawId].filter(Boolean).join(' · '),
      city:'台灣國道', provider:'交通部高速公路局', lat, lon,
      feedType:/mjpg|mjpeg|bmjpg/i.test(url.pathname) ? 'mjpeg' : 'image',
      url:url.toString(), sourceKind:'government-live-stream',
      license:'政府資料開放授權條款第 1 版；影像來源：交通部高速公路局',
      credit:'交通部高速公路局',
    });
  }
  return sources;
}

export async function loadTaiwanFreewaySources({ fetchImpl=fetch } = {}) {
  try {
    const response = await fetchImpl(CATALOG_URL, {
      headers:{ 'Accept':'application/xml', 'User-Agent':'gods-eye-taiwan/0.2 (+https://github.com/ymguan3-boop/good-open-source-collection)' },
      signal:AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const length = Number(response.headers.get('content-length'));
    if (length > MAX_XML_BYTES) throw new Error('CCTV 目錄過大');
    const xml = await response.text();
    if (xml.length > MAX_XML_BYTES) throw new Error('CCTV 目錄過大');
    const sources = parseTaiwanCctvXml(xml);
    if (!sources.length) throw new Error('CCTV 目錄無有效攝影機');
    return sources;
  } catch (error) {
    console.warn('[CCTV] Taiwan freeway catalog unavailable:', error?.message || error);
    return [];
  }
}
