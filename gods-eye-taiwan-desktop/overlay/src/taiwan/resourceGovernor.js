

const PROFILES = {
  eco:         { label:'省電', fps:24, scale:0.72, sse:30, cacheMB:192, overflowMB:48 },
  balanced:    { label:'平衡', fps:40, scale:1.00, sse:20, cacheMB:384, overflowMB:96 },
  performance: { label:'效能', fps:60, scale:1.00, sse:12, cacheMB:768, overflowMB:192 },
};

export class ResourceGovernor {
  constructor(viewer, tileset) {
    this.viewer = viewer; this.tileset = tileset; const saved=readSavedProfile(); this.profile=saved.name; this.custom=saved.custom; this.lastSnapshot = null;
    this.listeners = new Set(); this.timer = null; this.pressured = false;
  }
  start() { this.apply(this.profile, this.custom); this.timer ||= setInterval(() => this.refresh(), 3000); this.refresh(); }
  stop() { clearInterval(this.timer); this.timer = null; }
  setTileset(tileset){this.tileset=tileset;this.apply(this.profile,this.custom);if(this.pressured)this._protect();}
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  apply(name, custom={}) {
    this.profile = name; this.custom = custom || {};
    const cfg = name === 'custom' ? this.custom : PROFILES[name] || PROFILES.balanced;
    if (this.viewer) {
      this.viewer.targetFrameRate = cfg.fps || 45;
      this.viewer.resolutionScale = Math.max(0.5, Math.min(cfg.scale || 1, 1.5));
    }
    if (this.tileset) {
      this.tileset.maximumScreenSpaceError = cfg.sse || 18;
      this.tileset.cacheBytes = Math.round((cfg.cacheMB || 512) * 1024 * 1024);
      this.tileset.maximumCacheOverflowBytes = Math.round((cfg.overflowMB || 128) * 1024 * 1024);
    }
    localStorage.setItem('gev.tw.resourceProfile', JSON.stringify({ name, custom }));
  }
  async refresh() {
    try {
      const snapshot = await localSnapshot();
      const ram = ratio(snapshot.systemMemoryUsed, snapshot.systemMemoryTotal);
      const swap = ratio(snapshot.swapUsed, snapshot.swapTotal);
      const vram = ratio(snapshot.gpuUsed, snapshot.gpuTotal);
      const high = ram >= .88 || swap >= .75 || vram >= .88;
      const low = ram < .70 && (snapshot.swapTotal ? swap < .55 : true) && (snapshot.gpuTotal ? vram < .70 : true);
      this.lastSnapshot = snapshot;
      if (high && !this.pressured) { this.pressured = true; this._protect(); }
      else if (low && this.pressured) { this.pressured = false; this.apply(this.profile, this.custom); }
      for (const fn of this.listeners) fn({ ...snapshot, pressured:this.pressured });
    } catch (error) { console.debug('[TW resources]', error); }
  }
  _protect() {
    if (this.viewer) { this.viewer.targetFrameRate = 30; this.viewer.resolutionScale = Math.min(this.viewer.resolutionScale, .85); }
    if (this.tileset) { this.tileset.maximumScreenSpaceError = Math.max(this.tileset.maximumScreenSpaceError, 30); this.tileset.cacheBytes = Math.min(this.tileset.cacheBytes || Infinity, 192*1024*1024); }
  }
}
function readSavedProfile(){ try { const v=JSON.parse(localStorage.getItem('gev.tw.resourceProfile')||'{}'); if(v?.name) return {name:v.name,custom:v.custom||{}}; } catch {} return {name:'balanced',custom:{}}; }
function ratio(a,b){ return b ? a/b : 0; }
async function localSnapshot(){
  const response = await fetch('/api/taiwan/resources', { cache:'no-store' });
  if (!response.ok) throw new Error(`本機資源服務 ${response.status}`);
  return response.json();
}
export { PROFILES };
