export async function checkCctvFreshness({ sampleSize = 3 } = {}) {
  const catalogResponse = await fetch('/api/cctv/sources', { cache: 'no-store' });
  if (!catalogResponse.ok) throw new Error(`CCTV catalog HTTP ${catalogResponse.status}`);
  const catalog = await catalogResponse.json();
  const sources = Array.isArray(catalog?.sources) ? catalog.sources : [];
  if (!sources.length) return { ok:false, checkedAt:new Date().toISOString(), total:0, samples:[], message:'目前沒有可用 CCTV 來源' };

  const candidates = sources
    .filter(s => s?.id)
    .slice(0, Math.max(sampleSize * 2, sampleSize));

  const samples = [];
  for (const camera of candidates) {
    if (samples.length >= sampleSize) break;
    const started = Date.now();
    try {
      const response = await fetch(
        `/api/cctv/frame/${encodeURIComponent(camera.id)}?ts=${Date.now()}`,
        { cache:'no-store' }
      );
      const source = response.headers.get('X-CCTV-Source') || 'unknown';
      const contentType = response.headers.get('Content-Type') || '';
      samples.push({
        id: camera.id,
        name: camera.name || camera.id,
        provider: camera.provider || '',
        ok: response.ok && contentType.startsWith('image/'),
        source,
        isCurrentUpstream: source === 'upstream-image',
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      });
      try { await response.body?.cancel(); } catch {}
    } catch (error) {
      samples.push({
        id: camera.id,
        name: camera.name || camera.id,
        provider: camera.provider || '',
        ok:false,
        source:'error',
        isCurrentUpstream:false,
        latencyMs:Date.now()-started,
        checkedAt:new Date().toISOString(),
        error:error?.message || String(error),
      });
    }
  }

  const current = samples.filter(s => s.isCurrentUpstream).length;
  return {
    ok: current > 0,
    total: sources.length,
    current,
    sampleCount: samples.length,
    samples,
    checkedAt: new Date().toISOString(),
    message: `抽查 ${samples.length} 支，其中 ${current} 支直接取得上游最新 snapshot`,
  };
}

export async function checkOsmFreshness({ lat = 23.7, lon = 120.9 } = {}) {
  const query = `[out:json][timeout:10];node(around:100,${lat},${lon});out ids 1;`;
  const response = await fetch('/api/overpass', {
    method:'POST',
    cache:'no-store',
    headers:{
      'Content-Type':'application/x-www-form-urlencoded',
      'X-GEV-Force-Refresh':'1',
    },
    body:`data=${encodeURIComponent(query)}`,
  });
  if (!response.ok) throw new Error(`OSM Overpass HTTP ${response.status}`);
  const payload = await response.json();
  const dataTime = payload?.osm3s?.timestamp_osm_base || null;
  const parsed = dataTime ? Date.parse(dataTime) : NaN;
  const lagMinutes = Number.isFinite(parsed) ? Math.max(0, Math.round((Date.now()-parsed)/60000)) : null;
  return {
    ok: !!dataTime,
    dataTime,
    lagMinutes,
    cache: response.headers.get('X-Overpass-Cache') || '',
    upstream: response.headers.get('X-Overpass-Upstream') || '',
    checkedAt:new Date().toISOString(),
  };
}
