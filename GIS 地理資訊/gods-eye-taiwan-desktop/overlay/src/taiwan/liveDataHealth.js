export async function checkCctvFreshness({ sampleSize = 3, maxAttempts = 10 } = {}) {
  const catalogResponse = await fetch('/api/cctv/sources', { cache: 'no-store' });
  if (!catalogResponse.ok) throw new Error(`CCTV catalog HTTP ${catalogResponse.status}`);
  const catalog = await catalogResponse.json();
  const sources = Array.isArray(catalog?.sources) ? catalog.sources : [];
  if (!sources.length) {
    return { ok:false, checkedAt:new Date().toISOString(), total:0, samples:[], message:'目前沒有可用 CCTV 來源' };
  }

  // Spread probes across providers instead of trusting the first rows of one catalog.
  const byProvider = new Map();
  for (const camera of sources) {
    if (!camera?.id) continue;
    const key = camera.provider || camera.sourceKind || 'unknown';
    const group = byProvider.get(key) || [];
    group.push(camera);
    byProvider.set(key, group);
  }
  const candidates = [];
  let index = 0;
  while (candidates.length < Math.min(maxAttempts, sources.length)) {
    let added = false;
    for (const group of byProvider.values()) {
      if (group[index]) {
        candidates.push(group[index]);
        added = true;
        if (candidates.length >= maxAttempts) break;
      }
    }
    if (!added) break;
    index += 1;
  }

  const samples = [];
  let directUpstream = 0;
  for (const camera of candidates) {
    if (samples.length >= maxAttempts || directUpstream >= sampleSize) break;
    const started = Date.now();
    try {
      const response = await fetch(
        `/api/cctv/frame/${encodeURIComponent(camera.id)}?ts=${Date.now()}`,
        { cache:'no-store' }
      );
      const source = response.headers.get('X-CCTV-Source') || 'unknown';
      const contentType = response.headers.get('Content-Type') || '';
      const isCurrentUpstream = response.ok &&
        contentType.startsWith('image/') &&
        source === 'upstream-image';
      if (isCurrentUpstream) directUpstream += 1;
      samples.push({
        id: camera.id,
        name: camera.name || camera.id,
        provider: camera.provider || '',
        ok: response.ok && contentType.startsWith('image/'),
        source,
        isCurrentUpstream,
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

  return {
    ok: directUpstream > 0,
    total: sources.length,
    current: directUpstream,
    sampleCount: samples.length,
    samples,
    checkedAt: new Date().toISOString(),
    message: directUpstream > 0
      ? `跨來源抽查 ${samples.length} 支，其中 ${directUpstream} 支直接取得上游最新 snapshot`
      : `跨來源抽查 ${samples.length} 支，尚未取得 upstream-image；目前來源可能離線或正在使用備援`,
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
