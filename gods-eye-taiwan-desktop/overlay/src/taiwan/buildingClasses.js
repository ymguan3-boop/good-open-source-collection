import * as Cesium from 'cesium';

// 白模著色：依「地籍／建管／實價登錄」有無資料，把建物塗成不同顏色。
// bit 1 = 地籍, bit 2 = 建管, bit 4 = 實價登錄（同路名候選，非逐棟確認）。沒有資料的建物維持白色。
export const CLASS_BITS = [
  { bit: 1, key: 'cadastre', label: '地籍', color: '#34d399' },
  { bit: 2, key: 'permit', label: '建管', color: '#60a5fa' },
  { bit: 4, key: 'lvr', label: '實價登錄（同路名候選）', color: '#fbbf24' },
];
export const COMBINATIONS = [
  { mask: 3, label: '地籍＋建管', color: '#22d3ee' },
  { mask: 5, label: '地籍＋實價登錄', color: '#a3e635' },
  { mask: 6, label: '建管＋實價登錄', color: '#fb923c' },
  { mask: 7, label: '地籍＋建管＋實價登錄', color: '#e879f9' },
];
const COLORS = new Map([...CLASS_BITS.map(item => [item.bit, item.color]), ...COMBINATIONS.map(item => [item.mask, item.color])]);
export const colorOfMask = mask => COLORS.get(mask) || null;

/**
 * Colours the buildings of one white-tile town layer. The class table comes from the local server
 * (/info/classes); tiles are coloured as they become visible, nothing is sent outside this computer.
 */
export function attachBuildingClasses(layer, { slug, enabled = true, onChange } = {}) {
  const tileset = layer.tileset;
  const state = { enabled, ready: false, error: null, counts: null, available: null, version: 1, table: null, note: null };
  const applied = new WeakMap();
  const colors = new Map();
  const colorFor = mask => { const hex = colorOfMask(mask); if (!hex) return null; if (!colors.has(mask)) colors.set(mask, Cesium.Color.fromCssColorString(hex)); return colors.get(mask); };
  const paint = content => {
    if (!content || applied.get(content) === state.version) return;
    applied.set(content, state.version);
    const count = content.featuresLength || 0;
    for (let i = 0; i < count; i++) {
      let feature;
      try { feature = content.getFeature(i); } catch { continue; }
      let id;
      try { id = feature.getProperty('BUILD_ID'); } catch { continue; }
      const color = state.enabled && state.ready ? colorFor(state.table?.[id] || 0) : null;
      try { feature.color = color || Cesium.Color.WHITE; } catch { /* feature unloaded */ }
    }
  };
  const visit = tile => { try { paint(tile.content); } catch { /* tile content changing */ } };
  const remove = tileset.tileVisible.addEventListener(visit);
  const refresh = () => { state.version++; layer.viewer.scene.requestRender(); onChange?.(state); };
  fetch(`/api/taiwan/nlsc-buildings/info/classes?slug=${encodeURIComponent(slug)}`, { cache: 'no-store', credentials: 'same-origin' })
    .then(async response => { const value = await response.json().catch(() => ({})); if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`); return value; })
    .then(value => { state.table = value.classes; state.counts = value.counts; state.available = value.available; state.note = value.note; state.ready = true; refresh(); })
    .catch(error => { state.error = error.message; onChange?.(state); });
  const controller = {
    state,
    setEnabled(value) { state.enabled = !!value; refresh(); },
    destroy() { remove?.(); },
  };
  const dispose = layer.dispose;
  layer.dispose = () => { controller.destroy(); dispose?.(); };
  layer.infoClasses = controller;
  return controller;
}
