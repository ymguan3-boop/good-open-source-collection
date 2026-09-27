
import { invoke } from '@tauri-apps/api/core';

const PROFILES = {
  eco:         { label:'省電', fps:30, scale:0.75, sse:28, cacheMB:256, overflowMB:64 },
  balanced:    { label:'平衡', fps:45, scale:1.00, sse:18, cacheMB:512, overflowMB:128 },
  performance: { label:'效能', fps:60, scale:1.00, sse:10, cacheMB:1024, overflowMB:256 },
};

export class ResourceGovernor {
  constructor(viewer, tileset) {
    this.viewer = viewer; this.tileset = tileset; this.profile = 'balanced'; this.custom = {}; this.lastSnapshot = null;
    this.listeners = new Set(); this.timer = null; this.pressured = false;
  }
  start() { this.apply(this.profile); this.timer ||= setInterval(() => this.refresh(), 2500); this.refresh(); }
  stop() { clearInterval(this.timer); this.timer = null; }
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
      const snapshot = globalThis.__TAURI_INTERNALS__ ? await invoke('resource_snapshot') : browserSnapshot();
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
    if (this.viewer) { this.viewer.targetFrameRate = 30; this.viewer.resolutionScale = Math.min(this.viewer.resolutionScale, .72); }
    if (this.tileset) { this.tileset.maximumScreenSpaceError = Math.max(this.tileset.maximumScreenSpaceError, 30); this.tileset.cacheBytes = Math.min(this.tileset.cacheBytes || Infinity, 192*1024*1024); }
  }
}
function ratio(a,b){ return b ? a/b : 0; }
function browserSnapshot(){ return { systemMemoryTotal:0,systemMemoryUsed:0,swapTotal:0,swapUsed:0,processMemory:0,processVirtualMemory:0,gpuName:'瀏覽器模式',gpuTotal:0,gpuUsed:0,processGpuUsed:0 }; }
export { PROFILES };
